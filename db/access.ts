import { getD1 } from "./index";
import { ensureEmployeesSeeded } from "./employees";
import { ensureAttendanceSetup, type AuthUser, type SystemUser } from "./attendance";

export const menuIds = ["dashboard", "employees", "members", "checkin", "attendance", "resignations", "advances", "warnings", "payroll", "data", "access"] as const;
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
  audit: ["dashboard", "employees", "members", "checkin", "attendance"],
  employee: ["dashboard", "checkin", "attendance"],
};

function parsePermissions(value: unknown, role: SystemUser["role"]): MenuId[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (Array.isArray(parsed) && parsed.length)
      return menuIds.filter(
        (id) => id === "dashboard" || id === "checkin" || parsed.includes(id),
      );
  } catch { /* ใช้ค่าเริ่มต้นตามบทบาท */ }
  return roleDefaults[role];
}

function role(value: unknown): SystemUser["role"] {
  return value === "hr" || value === "audit" ? value : "employee";
}

export async function getSystemAccess(auth: AuthUser) {
  const currentUser = await ensureAttendanceSetup(auth);
  const current = await getD1()
    .prepare(
      "SELECT menu_permissions FROM hr_system_users WHERE email = ? COLLATE NOCASE",
    )
    .bind(currentUser.email)
    .first<Record<string, unknown>>();
  return {
    currentUser,
    permissions: parsePermissions(
      current?.menu_permissions,
      currentUser.role,
    ),
  };
}

export async function getAccessData(auth: AuthUser) {
  await ensureEmployeesSeeded();
  const { currentUser, permissions } = await getSystemAccess(auth);
  const database = getD1();
  const employees = currentUser.role === "hr" ? (await database.prepare(`
    SELECT id, nickname, team, email, status FROM hr_employees ORDER BY sequence, id
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
  return {
    currentUser: {
      email: currentUser.email,
      displayName: currentUser.displayName,
      role: currentUser.role,
    },
    permissions,
    users,
    employees,
  };
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
  if (!permissions.includes("dashboard")) permissions.unshift("dashboard");
  if (!permissions.includes("checkin"))
    permissions.splice(permissions.includes("dashboard") ? 1 : 0, 0, "checkin");
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

function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function createEmployeeUsersBulk(
  currentUser: SystemUser,
  input: Record<string, unknown>,
) {
  if (currentUser.role !== "hr")
    throw new Error("เฉพาะ HR เท่านั้นที่สร้างผู้ใช้งานแบบกลุ่มได้");
  const requestedIds = Array.isArray(input.employeeIds)
    ? Array.from(
        new Set(input.employeeIds.map(String).map((id) => id.trim()).filter(Boolean)),
      )
    : [];
  if (!requestedIds.length) throw new Error("กรุณาเลือกพนักงานอย่างน้อย 1 คน");
  if (requestedIds.length > 500)
    throw new Error("สร้างผู้ใช้งานได้สูงสุดครั้งละ 500 คน");

  const database = getD1();
  const [employeeResult, accessResult, accountResult, legacyResult] =
    await database.batch([
      database.prepare(
        "SELECT id, nickname, team, email, status FROM hr_employees ORDER BY sequence, id",
      ),
      database.prepare(
        "SELECT email, employee_id, login_username FROM hr_system_users",
      ),
      database.prepare("SELECT username FROM users"),
      database.prepare("SELECT id, employee_code FROM employees"),
    ]);
  const requested = new Set(requestedIds);
  const employees = employeeResult.results.filter((row) =>
    requested.has(String(row.id)),
  );
  const existingEmployeeIds = new Set(
    accessResult.results
      .map((row) => String(row.employee_id ?? ""))
      .filter(Boolean),
  );
  const existingEmails = new Set(
    accessResult.results.map((row) => String(row.email ?? "").toLowerCase()),
  );
  const existingUsernames = new Set([
    ...accessResult.results.map((row) =>
      String(row.login_username ?? "").toLowerCase(),
    ),
    ...accountResult.results.map((row) =>
      String(row.username ?? "").toLowerCase(),
    ),
  ]);
  const legacyByCode = new Map(
    legacyResult.results.map((row) => [
      String(row.employee_code ?? ""),
      String(row.id ?? ""),
    ]),
  );
  const created: Array<{
    employeeId: string;
    nickname: string;
    team: string;
    username: string;
    password: string;
  }> = [];
  const skipped: Array<{ employeeId: string; reason: string }> = [];
  const statements = [];
  const foundIds = new Set(employees.map((row) => String(row.id)));

  for (const employeeId of requestedIds) {
    if (!foundIds.has(employeeId))
      skipped.push({ employeeId, reason: "ไม่พบข้อมูลพนักงาน" });
  }

  for (const employee of employees) {
    const employeeId = String(employee.id);
    const username = employeeId;
    if (existingEmployeeIds.has(employeeId)) {
      skipped.push({ employeeId, reason: "มี User เชื่อมกับพนักงานแล้ว" });
      continue;
    }
    if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) {
      skipped.push({ employeeId, reason: "รหัสพนักงานใช้เป็น Username ไม่ได้" });
      continue;
    }
    if (existingUsernames.has(username.toLowerCase())) {
      skipped.push({ employeeId, reason: "Username มีอยู่ในระบบแล้ว" });
      continue;
    }
    const employeeEmail = String(employee.email ?? "").trim().toLowerCase();
    const email = employeeEmail.includes("@")
      ? employeeEmail
      : `${username.toLowerCase()}@people-os.local`;
    if (existingEmails.has(email)) {
      skipped.push({ employeeId, reason: "อีเมลมี User อยู่แล้ว" });
      continue;
    }
    const password = temporaryPassword();
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    statements.push(
      database
        .prepare(
          `INSERT INTO users (id, employee_id, username, password_hash, status,
            failed_login_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', 0, ?, ?)`,
        )
        .bind(
          userId,
          legacyByCode.get(employeeId) || null,
          username,
          await hashPassword(password),
          now,
          now,
        ),
      database
        .prepare(
          `INSERT INTO hr_system_users (
            email, user_id, display_name, role, employee_id,
            menu_permissions, login_username
          ) VALUES (?, ?, ?, 'employee', ?, ?, ?)`,
        )
        .bind(
          email,
          userId,
          String(employee.nickname || employeeId),
          employeeId,
          JSON.stringify(["dashboard", "checkin", "attendance"]),
          username,
        ),
    );
    existingEmployeeIds.add(employeeId);
    existingEmails.add(email);
    existingUsernames.add(username.toLowerCase());
    created.push({
      employeeId,
      nickname: String(employee.nickname || ""),
      team: String(employee.team || ""),
      username,
      password,
    });
  }

  for (let index = 0; index < statements.length; index += 40)
    await database.batch(statements.slice(index, index + 40));
  return { created, skipped };
}
