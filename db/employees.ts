import { getD1 } from "./index";
import { seedEmployees, type SeedEmployee } from "./seed-employees";

export type EmployeeRecord = SeedEmployee & {
  tenure: string;
  hasSalary: boolean;
  hasBank: boolean;
  hasEmail: boolean;
  createdAt: string;
  updatedAt: string;
};

const employeeColumns = `
  id, sequence, nickname, team, position, employment, full_name, salary,
  bank_account, bank_name, account_name, start_date, end_date, aff, email,
  discord_id, dynadot, referred_by, probation, status, created_at, updated_at
`;

function tenureFromDate(startDate: string) {
  if (!startDate) return "ไม่ระบุ";
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return "ไม่ระบุ";
  const now = new Date();
  const months = Math.max(1, (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + now.getUTCMonth() - start.getUTCMonth() + 1);
  return `${months} เดือน`;
}

function mapEmployee(row: Record<string, unknown>): EmployeeRecord {
  const salary = row.salary == null ? null : Number(row.salary);
  const bankAccount = String(row.bank_account ?? "");
  const bankName = String(row.bank_name ?? "");
  const email = String(row.email ?? "");
  const startDate = String(row.start_date ?? "");
  return {
    id: String(row.id ?? ""),
    sequence: Number(row.sequence ?? 0),
    nickname: String(row.nickname ?? ""),
    team: String(row.team ?? ""),
    position: String(row.position ?? ""),
    employment: String(row.employment ?? ""),
    fullName: String(row.full_name ?? ""),
    salary,
    bankAccount,
    bankName,
    accountName: String(row.account_name ?? ""),
    startDate,
    endDate: String(row.end_date ?? ""),
    aff: String(row.aff ?? ""),
    email,
    discordId: String(row.discord_id ?? ""),
    dynadot: String(row.dynadot ?? ""),
    referredBy: String(row.referred_by ?? ""),
    probation: String(row.probation ?? ""),
    status: String(row.status ?? ""),
    tenure: tenureFromDate(startDate),
    hasSalary: salary !== null,
    hasBank: Boolean(bankAccount && bankName),
    hasEmail: Boolean(email),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function ensureEmployeesSeeded() {
  const database = getD1();
  const count = await database.prepare("SELECT COUNT(*) AS count FROM hr_employees").first<{ count: number }>();
  if (Number(count?.count ?? 0) > 0) return;

  const sql = `
    INSERT OR IGNORE INTO hr_employees (
      id, sequence, nickname, team, position, employment, full_name, salary,
      bank_account, bank_name, account_name, start_date, end_date, aff, email,
      discord_id, dynadot, referred_by, probation, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const statements = seedEmployees.map((employee) =>
    database.prepare(sql).bind(
      employee.id,
      employee.sequence,
      employee.nickname,
      employee.team,
      employee.position,
      employee.employment,
      employee.fullName,
      employee.salary,
      employee.bankAccount,
      employee.bankName,
      employee.accountName,
      employee.startDate,
      employee.endDate,
      employee.aff,
      employee.email,
      employee.discordId,
      employee.dynadot,
      employee.referredBy,
      employee.probation,
      employee.status,
    ),
  );

  for (let index = 0; index < statements.length; index += 40) {
    await database.batch(statements.slice(index, index + 40));
  }
}

export async function listEmployees(): Promise<EmployeeRecord[]> {
  await ensureEmployeesSeeded();
  const result = await getD1()
    .prepare(`SELECT ${employeeColumns} FROM hr_employees ORDER BY sequence ASC`)
    .all<Record<string, unknown>>();
  return result.results.map(mapEmployee);
}

export async function createEmployee(input: SeedEmployee): Promise<EmployeeRecord> {
  await ensureEmployeesSeeded();
  const database = getD1();
  const statement = database.prepare(`
    INSERT INTO hr_employees (
      id, sequence, nickname, team, position, employment, full_name, salary,
      bank_account, bank_name, account_name, start_date, end_date, aff, email,
      discord_id, dynadot, referred_by, probation, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING ${employeeColumns}
  `).bind(
    input.id,
    input.sequence,
    input.nickname,
    input.team,
    input.position,
    input.employment,
    input.fullName,
    input.salary,
    input.bankAccount,
    input.bankName,
    input.accountName,
    input.startDate,
    input.endDate,
    input.aff,
    input.email,
    input.discordId,
    input.dynadot,
    input.referredBy,
    input.probation,
    input.status,
  );
  const row = await statement.first<Record<string, unknown>>();
  if (!row) throw new Error("ไม่สามารถเพิ่มพนักงานได้");
  return mapEmployee(row);
}

export async function importEmployees(inputs: SeedEmployee[]) {
  await ensureEmployeesSeeded();
  const database = getD1();
  const existingResult = await database
    .prepare("SELECT id FROM hr_employees")
    .all<{ id: string }>();
  const existingIds = new Set(existingResult.results.map((row) => String(row.id)));
  const sequenceRow = await database
    .prepare("SELECT COALESCE(MAX(sequence), 0) AS maximum FROM hr_employees")
    .first<{ maximum: number }>();
  let nextSequence = Number(sequenceRow?.maximum ?? 0) + 1;
  const deduplicated = Array.from(
    new Map(inputs.map((employee) => [employee.id, employee])).values(),
  );
  const added = deduplicated.filter((employee) => !existingIds.has(employee.id)).length;
  const updated = deduplicated.length - added;
  const sql = `
    INSERT INTO hr_employees (
      id, sequence, nickname, team, position, employment, full_name, salary,
      bank_account, bank_name, account_name, start_date, end_date, aff, email,
      discord_id, dynadot, referred_by, probation, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      nickname = excluded.nickname,
      team = excluded.team,
      position = excluded.position,
      employment = excluded.employment,
      full_name = excluded.full_name,
      salary = excluded.salary,
      bank_account = excluded.bank_account,
      bank_name = excluded.bank_name,
      account_name = excluded.account_name,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      aff = excluded.aff,
      email = excluded.email,
      discord_id = excluded.discord_id,
      dynadot = excluded.dynadot,
      referred_by = excluded.referred_by,
      probation = excluded.probation,
      status = excluded.status,
      updated_at = CURRENT_TIMESTAMP
  `;
  const statements = deduplicated.map((employee) => {
    const sequence = existingIds.has(employee.id)
      ? Math.max(0, employee.sequence)
      : nextSequence++;
    return database.prepare(sql).bind(
      employee.id,
      sequence,
      employee.nickname,
      employee.team,
      employee.position,
      employee.employment,
      employee.fullName,
      employee.salary,
      employee.bankAccount,
      employee.bankName,
      employee.accountName,
      employee.startDate,
      employee.endDate,
      employee.aff,
      employee.email,
      employee.discordId,
      employee.dynadot,
      employee.referredBy,
      employee.probation,
      employee.status,
    );
  });
  for (let index = 0; index < statements.length; index += 40) {
    await database.batch(statements.slice(index, index + 40));
  }
  return { added, updated, employees: await listEmployees() };
}

export async function updateEmployee(input: SeedEmployee): Promise<EmployeeRecord> {
  await ensureEmployeesSeeded();
  const row = await getD1().prepare(`
    UPDATE hr_employees SET
      nickname = ?, team = ?, position = ?, employment = ?, full_name = ?, salary = ?,
      bank_account = ?, bank_name = ?, account_name = ?, start_date = ?, end_date = ?,
      aff = ?, email = ?, discord_id = ?, dynadot = ?, referred_by = ?, probation = ?,
      status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    RETURNING ${employeeColumns}
  `).bind(
    input.nickname,
    input.team,
    input.position,
    input.employment,
    input.fullName,
    input.salary,
    input.bankAccount,
    input.bankName,
    input.accountName,
    input.startDate,
    input.endDate,
    input.aff,
    input.email,
    input.discordId,
    input.dynadot,
    input.referredBy,
    input.probation,
    input.status,
    input.id,
  ).first<Record<string, unknown>>();
  if (!row) throw new Error("ไม่พบพนักงานที่ต้องการแก้ไข");
  return mapEmployee(row);
}

export async function deleteEmployee(employeeId: string) {
  const database = getD1();
  const employee = await database
    .prepare("SELECT id, nickname FROM hr_employees WHERE id = ?")
    .bind(employeeId)
    .first<{ id: string; nickname: string }>();
  if (!employee) throw new Error("ไม่พบพนักงานที่ต้องการลบ");

  await database.batch([
    database
      .prepare(
        "UPDATE hr_system_users SET employee_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE employee_id = ?",
      )
      .bind(employeeId),
    database
      .prepare("DELETE FROM hr_attendance_audit_logs WHERE employee_id = ?")
      .bind(employeeId),
    database
      .prepare("DELETE FROM hr_attendance_records WHERE employee_id = ?")
      .bind(employeeId),
    database
      .prepare(
        "DELETE FROM hr_advance_installments WHERE advance_id IN (SELECT id FROM hr_employee_advances WHERE employee_id = ?)",
      )
      .bind(employeeId),
    database
      .prepare("DELETE FROM hr_employee_advances WHERE employee_id = ?")
      .bind(employeeId),
    database
      .prepare("DELETE FROM hr_warning_records WHERE employee_id = ?")
      .bind(employeeId),
    database
      .prepare("DELETE FROM hr_monthly_deposit_results WHERE employee_id = ?")
      .bind(employeeId),
    database
      .prepare("DELETE FROM hr_payroll_records WHERE employee_id = ?")
      .bind(employeeId),
    database.prepare("DELETE FROM hr_employees WHERE id = ?").bind(employeeId),
  ]);

  return { id: String(employee.id), nickname: String(employee.nickname) };
}

export async function nextEmployeeSequence() {
  await ensureEmployeesSeeded();
  const row = await getD1().prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM hr_employees").first<{ next_sequence: number }>();
  return Number(row?.next_sequence ?? 1);
}
