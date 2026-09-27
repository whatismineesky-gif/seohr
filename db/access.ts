import { getD1 } from "./index";
import { ensureEmployeesSeeded } from "./employees";
import { ensureAttendanceSetup, type AuthUser, type SystemUser } from "./attendance";

export const menuIds = ["dashboard", "employees", "members", "attendance", "resignations", "advances", "warnings", "payroll", "data", "access"] as const;
export type MenuId = typeof menuIds[number];

const passwordEncoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string) {
  const iterations = 100_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    passwordEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      key,
      256,
    ),
  );
  return `pbkdf2_sha256$${iterations}$${bytesToHex(salt)}$${bytesToHex(digest)}`;
}

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
    SELECT u.email, u.display_name, u.role, u.employee_id, u.menu_permissions,
      u.login_username, e.nickname, e.team
    FROM hr_system_users u LEFT JOIN hr_employees e ON e.id = u.employee_id
    ORDER BY CASE u.role WHEN 'hr' THEN 1 WHEN 'audit' THEN 2 ELSE 3 END, u.email
  `).all<Record<string, unknown>>()).results.map((row) => {
    const userRole = role(row.role);
    return {
      email: String(row.email), displayName: String(row.display_name || row.email), role: userRole,
      employeeId: row.employee_id ? String(row.employee_id) : "", nickname: row.nickname ? String(row.nickname) : "",
      team: row.team ? String(row.team) : "", loginUsername: String(row.login_username || ""),
      permissions: parsePermissions(row.menu_permissions, userRole),
    };
  }) : [];
  return { currentUser, permissions, users, employees };
}

export async function saveAccessUser(currentUser: SystemUser, input: Record<string, unknown>) {
  if (currentUser.role !== "hr") throw new Error("เฉพาะ HR เท่านั้นที่กำหนดสิทธิ์ผู้ใช้งานได้");
  const email = String(input.email ?? "").trim().toLowerCase();
  const userRole = role(input.role);
  const employeeId = String(input.employeeId ?? "").trim() || null;
  const loginUsername = String(input.loginUsername ?? "").trim();
  const password = String(input.password ?? "");
  const requested = Array.isArray(input.permissions) ? input.permissions.map(String) : [];
  const permissions = menuIds.filter((id) => requested.includes(id));
  if (!email || !email.includes("@")) throw new Error("กรุณาระบุอีเมลให้ถูกต้อง");
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(loginUsername))
    throw new Error("Username ต้องมี 3–50 ตัว และใช้ตัวอักษรอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง");
  if (password && password.length < 8) throw new Error("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
  if (employeeId) {
    const employee = await getD1().prepare("SELECT id FROM hr_employees WHERE id = ?").bind(employeeId).first();
    if (!employee) throw new Error("ไม่พบพนักงานที่เลือก");
  }
  const database = getD1();
  const legacyEmployee = employeeId
    ? await database.prepare("SELECT id FROM employees WHERE employee_code = ? LIMIT 1").bind(employeeId).first<{ id: string }>()
    : null;
  const existingAccount = await database.prepare(`
    SELECT id, username FROM users
    WHERE username = ? COLLATE NOCASE
       OR (? IS NOT NULL AND employee_id = ?)
    LIMIT 1
  `).bind(loginUsername, legacyEmployee?.id ?? null, legacyEmployee?.id ?? null).first<Record<string, unknown>>();
  const now = new Date().toISOString();
  if (existingAccount) {
    if (password) {
      await database.prepare(`
        UPDATE users SET username = ?, password_hash = ?, employee_id = ?, status = 'active',
          failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?
      `).bind(loginUsername, await hashPassword(password), legacyEmployee?.id ?? null, now, existingAccount.id).run();
    } else {
      await database.prepare("UPDATE users SET username = ?, employee_id = ?, status = 'active', updated_at = ? WHERE id = ?")
        .bind(loginUsername, legacyEmployee?.id ?? null, now, existingAccount.id).run();
    }
  } else {
    if (!password) throw new Error("ผู้ใช้ใหม่ต้องกำหนดรหัสผ่านเริ่มต้น");
    await database.prepare(`
      INSERT INTO users (id, employee_id, username, password_hash, status, failed_login_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', 0, ?, ?)
    `).bind(crypto.randomUUID(), legacyEmployee?.id ?? null, loginUsername, await hashPassword(password), now, now).run();
  }
  if (userRole === "hr" && !permissions.includes("access")) permissions.push("access");
  await database.prepare(`
    INSERT INTO hr_system_users (email, user_id, display_name, role, employee_id, menu_permissions, login_username)
    VALUES (?, '', ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET role = excluded.role, employee_id = excluded.employee_id,
      menu_permissions = excluded.menu_permissions, login_username = excluded.login_username,
      updated_at = CURRENT_TIMESTAMP
  `).bind(email, email, userRole, employeeId, JSON.stringify(permissions), loginUsername).run();
  return { ok: true };
}
