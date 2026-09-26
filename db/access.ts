import { getD1 } from "./index";
import { ensureEmployeesSeeded } from "./employees";
import { ensureAttendanceSetup, type AuthUser, type SystemUser } from "./attendance";

export const menuIds = ["dashboard", "employees", "members", "attendance", "resignations", "advances", "warnings", "payroll", "data", "access"] as const;
export type MenuId = typeof menuIds[number];

const roleDefaults: Record<SystemUser["role"], MenuId[]> = {
  hr: [...menuIds],
  audit: ["dashboard", "employees", "members", "attendance"],
  employee: ["dashboard", "attendance"],
};

function parsePermissions(value: unknown, role: SystemUser["role"]): MenuId[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (Array.isArray(parsed) && parsed.length) return menuIds.filter((id) => parsed.includes(id));
  } catch { /* ใช้ค่าเริ่มต้นตามบทบาท */ }
  return roleDefaults[role];
}

function role(value: unknown): SystemUser["role"] {
  return value === "hr" || value === "audit" ? value : "employee";
}

export async function getAccessData(auth: AuthUser) {
  await ensureEmployeesSeeded();
  const currentUser = await ensureAttendanceSetup(auth);
  const database = getD1();
  const current = await database.prepare("SELECT menu_permissions FROM hr_system_users WHERE email = ? COLLATE NOCASE")
    .bind(currentUser.email).first<Record<string, unknown>>();
  const permissions = parsePermissions(current?.menu_permissions, currentUser.role);
  const employees = currentUser.role === "hr" ? (await database.prepare(`
    SELECT id, nickname, team, email FROM hr_employees ORDER BY sequence, id
  `).all<Record<string, unknown>>()).results : [];
  const users = currentUser.role === "hr" ? (await database.prepare(`
    SELECT u.email, u.display_name, u.role, u.employee_id, u.menu_permissions, e.nickname, e.team
    FROM hr_system_users u LEFT JOIN hr_employees e ON e.id = u.employee_id
    ORDER BY CASE u.role WHEN 'hr' THEN 1 WHEN 'audit' THEN 2 ELSE 3 END, u.email
  `).all<Record<string, unknown>>()).results.map((row) => {
    const userRole = role(row.role);
    return {
      email: String(row.email), displayName: String(row.display_name || row.email), role: userRole,
      employeeId: row.employee_id ? String(row.employee_id) : "", nickname: row.nickname ? String(row.nickname) : "",
      team: row.team ? String(row.team) : "", permissions: parsePermissions(row.menu_permissions, userRole),
    };
  }) : [];
  return { currentUser, permissions, users, employees };
}

export async function saveAccessUser(currentUser: SystemUser, input: Record<string, unknown>) {
  if (currentUser.role !== "hr") throw new Error("เฉพาะ HR เท่านั้นที่กำหนดสิทธิ์ผู้ใช้งานได้");
  const email = String(input.email ?? "").trim().toLowerCase();
  const userRole = role(input.role);
  const employeeId = String(input.employeeId ?? "").trim() || null;
  const requested = Array.isArray(input.permissions) ? input.permissions.map(String) : [];
  const permissions = menuIds.filter((id) => requested.includes(id));
  if (!email || !email.includes("@")) throw new Error("กรุณาระบุอีเมลให้ถูกต้อง");
  if (employeeId) {
    const employee = await getD1().prepare("SELECT id FROM hr_employees WHERE id = ?").bind(employeeId).first();
    if (!employee) throw new Error("ไม่พบพนักงานที่เลือก");
  }
  if (userRole === "hr" && !permissions.includes("access")) permissions.push("access");
  await getD1().prepare(`
    INSERT INTO hr_system_users (email, user_id, display_name, role, employee_id, menu_permissions)
    VALUES (?, '', ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET role = excluded.role, employee_id = excluded.employee_id,
      menu_permissions = excluded.menu_permissions, updated_at = CURRENT_TIMESTAMP
  `).bind(email, email, userRole, employeeId, JSON.stringify(permissions)).run();
  return { ok: true };
}
