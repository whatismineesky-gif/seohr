import { getD1 } from "./index";
import { ensureEmployeesSeeded } from "./employees";
import { getAttendancePayrollImpact } from "./attendance";

type Input = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function money(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function month(value: unknown) {
  const result = text(value);
  if (!/^\d{4}-\d{2}$/.test(result)) throw new Error("กรุณาระบุเดือนให้ถูกต้อง");
  return result;
}

function addMonth(value: string, count = 1) {
  const [year, monthNumber] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function listAdvances(employeeId?: string) {
  await ensureEmployeesSeeded();
  const database = getD1();
  const condition = employeeId ? "WHERE a.employee_id = ?" : "";
  const statement = database.prepare(`
    SELECT a.*, e.nickname, e.team,
      COALESCE(SUM(CASE WHEN i.status = 'deducted' THEN i.amount ELSE 0 END), 0) AS paid_amount,
      COALESCE(SUM(CASE WHEN i.status = 'pending' THEN i.amount ELSE 0 END), 0) AS pending_amount
    FROM hr_employee_advances a
    JOIN hr_employees e ON e.id = a.employee_id
    LEFT JOIN hr_advance_installments i ON i.advance_id = a.id
    ${condition}
    GROUP BY a.id, e.id
    ORDER BY a.status ASC, a.created_at DESC, a.id DESC
  `);
  const rows = employeeId
    ? await statement.bind(employeeId).all<Record<string, unknown>>()
    : await statement.all<Record<string, unknown>>();
  const advances = [];
  for (const row of rows.results) {
    const installments = await database.prepare(`
      SELECT id, due_month, amount, status, payroll_record_id, processed_at
      FROM hr_advance_installments WHERE advance_id = ? ORDER BY due_month, id
    `).bind(row.id).all<Record<string, unknown>>();
    advances.push({
      id: Number(row.id), employeeId: String(row.employee_id), nickname: String(row.nickname), team: String(row.team),
      advanceType: String(row.advance_type), repaymentType: String(row.repayment_type), description: String(row.description ?? ""),
      totalAmount: Number(row.total_amount), monthlyAmount: Number(row.monthly_amount), startMonth: String(row.start_month),
      status: String(row.status), paidAmount: Number(row.paid_amount), pendingAmount: Number(row.pending_amount),
      installments: installments.results.map((item) => ({
        id: Number(item.id), dueMonth: String(item.due_month), amount: Number(item.amount), status: String(item.status),
        payrollRecordId: item.payroll_record_id ? Number(item.payroll_record_id) : null,
      })),
    });
  }
  return advances;
}

export async function createAdvance(input: Input) {
  await ensureEmployeesSeeded();
  const database = getD1();
  const employeeId = text(input.employeeId);
  const advanceType = text(input.advanceType);
  const repaymentType = text(input.repaymentType);
  const totalAmount = money(input.totalAmount);
  const startMonth = month(input.startMonth);
  if (!employeeId) throw new Error("กรุณาเลือกพนักงาน");
  if (!new Set(["advance", "installment_item"]).has(advanceType)) throw new Error("กรุณาเลือกประเภทเงินเบิก");
  if (!new Set(["full", "installment"]).has(repaymentType)) throw new Error("กรุณาเลือกรูปแบบคืน");
  if (totalAmount <= 0) throw new Error("ยอดเงินต้องมากกว่า 0 บาท");
  const monthlyAmount = repaymentType === "full" ? totalAmount : money(input.monthlyAmount);
  if (monthlyAmount <= 0) throw new Error("กรุณาระบุยอดผ่อนต่อเดือน");
  const employee = await database.prepare("SELECT id FROM hr_employees WHERE id = ?").bind(employeeId).first();
  if (!employee) throw new Error("ไม่พบพนักงานที่เลือก");

  const inserted = await database.prepare(`
    INSERT INTO hr_employee_advances (
      employee_id, advance_type, repayment_type, description, total_amount, monthly_amount, start_month
    ) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
  `).bind(employeeId, advanceType, repaymentType, text(input.description), totalAmount, monthlyAmount, startMonth)
    .first<{ id: number }>();
  const advanceId = Number(inserted?.id);
  const statements = [];
  let remaining = totalAmount;
  let offset = 0;
  while (remaining > 0) {
    const amount = Math.min(monthlyAmount, remaining);
    statements.push(database.prepare(`
      INSERT INTO hr_advance_installments (advance_id, due_month, amount, status)
      VALUES (?, ?, ?, 'pending')
    `).bind(advanceId, addMonth(startMonth, offset), amount));
    remaining -= amount;
    offset += 1;
  }
  await database.batch(statements);
  return (await listAdvances(employeeId)).find((item) => item.id === advanceId);
}

export async function updateAdvance(input: Input) {
  const database = getD1();
  const id = money(input.id);
  const existing = await database.prepare("SELECT employee_id FROM hr_employee_advances WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!existing) throw new Error("ไม่พบรายการเบิก");
  const deducted = await database.prepare("SELECT COUNT(*) AS count FROM hr_advance_installments WHERE advance_id = ? AND status = 'deducted'").bind(id).first<{ count: number }>();
  if (Number(deducted?.count ?? 0) > 0) throw new Error("รายการนี้ถูกหักเงินเดือนแล้ว จึงไม่สามารถแก้ไขย้อนหลังได้");
  const employeeId = text(input.employeeId);
  const advanceType = text(input.advanceType);
  const repaymentType = text(input.repaymentType);
  const totalAmount = money(input.totalAmount);
  const startMonth = month(input.startMonth);
  if (!employeeId || !new Set(["advance", "installment_item"]).has(advanceType)) throw new Error("ข้อมูลรายการไม่ถูกต้อง");
  if (!new Set(["full", "installment"]).has(repaymentType) || totalAmount <= 0) throw new Error("ข้อมูลการชำระไม่ถูกต้อง");
  const monthlyAmount = repaymentType === "full" ? totalAmount : money(input.monthlyAmount);
  if (monthlyAmount <= 0) throw new Error("กรุณาระบุยอดผ่อนต่อเดือน");
  await database.batch([
    database.prepare("DELETE FROM hr_advance_installments WHERE advance_id = ?").bind(id),
    database.prepare(`UPDATE hr_employee_advances SET employee_id = ?, advance_type = ?, repayment_type = ?, description = ?, total_amount = ?, monthly_amount = ?, start_month = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(employeeId, advanceType, repaymentType, text(input.description), totalAmount, monthlyAmount, startMonth, id),
  ]);
  const statements = [];
  let remaining = totalAmount;
  let offset = 0;
  while (remaining > 0) {
    const amount = Math.min(monthlyAmount, remaining);
    statements.push(database.prepare("INSERT INTO hr_advance_installments (advance_id, due_month, amount, status) VALUES (?, ?, ?, 'pending')").bind(id, addMonth(startMonth, offset), amount));
    remaining -= amount;
    offset += 1;
  }
  await database.batch(statements);
  return (await listAdvances(employeeId)).find((item) => item.id === id);
}

export async function deleteAdvance(idValue: unknown) {
  const database = getD1();
  const id = money(idValue);
  const existing = await database.prepare("SELECT id FROM hr_employee_advances WHERE id = ?").bind(id).first();
  if (!existing) throw new Error("ไม่พบรายการเบิก");
  const deducted = await database.prepare("SELECT COUNT(*) AS count FROM hr_advance_installments WHERE advance_id = ? AND status = 'deducted'").bind(id).first<{ count: number }>();
  if (Number(deducted?.count ?? 0) > 0) throw new Error("รายการนี้ถูกหักเงินเดือนแล้ว จึงไม่สามารถลบย้อนหลังได้");
  await database.batch([
    database.prepare("DELETE FROM hr_advance_installments WHERE advance_id = ?").bind(id),
    database.prepare("DELETE FROM hr_employee_advances WHERE id = ?").bind(id),
  ]);
  return { success: true };
}

export async function getPayrollData(employeeId: string, payrollMonth: string) {
  await ensureEmployeesSeeded();
  const database = getD1();
  const validMonth = month(payrollMonth);
  await database.prepare(`
    INSERT OR IGNORE INTO hr_payroll_settings (id, target_websites, deduction_per_website) VALUES (1, 0, 100)
  `).run();
  const employee = await database.prepare(`
    SELECT id, nickname, team, full_name, salary, bank_name, bank_account, account_name, status, end_date
    FROM hr_employees
    WHERE id = ?
      AND (start_date = '' OR
        CASE WHEN start_date GLOB '??/??/????'
          THEN substr(start_date, 7, 4) || '-' || substr(start_date, 4, 2) || '-' || substr(start_date, 1, 2)
          ELSE start_date END < ?)
      AND (status <> 'ลาออก' OR
        CASE WHEN end_date GLOB '??/??/????'
          THEN substr(end_date, 7, 4) || '-' || substr(end_date, 4, 2) || '-' || substr(end_date, 1, 2)
          ELSE end_date END >= ?)
  `).bind(employeeId, `${addMonth(validMonth)}-01`, `${validMonth}-01`).first<Record<string, unknown>>();
  if (!employee) throw new Error("ไม่พบพนักงานในรอบเงินเดือนที่เลือก");
  const settings = await database.prepare("SELECT target_websites, deduction_per_website FROM hr_payroll_settings WHERE id = 1")
    .first<Record<string, unknown>>();
  const installments = await database.prepare(`
    SELECT i.id, i.advance_id, i.amount, i.due_month, i.status, a.advance_type, a.description
    FROM hr_advance_installments i JOIN hr_employee_advances a ON a.id = i.advance_id
    WHERE a.employee_id = ? AND i.due_month = ? AND i.status = 'pending'
    ORDER BY i.id
  `).bind(employeeId, validMonth).all<Record<string, unknown>>();
  const warnings = await database.prepare(`
    SELECT id, warning_date, subject, amount, note FROM hr_warning_records
    WHERE employee_id = ? AND warning_date >= ? AND warning_date < ? ORDER BY warning_date
  `).bind(employeeId, `${validMonth}-01`, `${addMonth(validMonth)}-01`).all<Record<string, unknown>>();
  const payroll = await database.prepare("SELECT * FROM hr_payroll_records WHERE employee_id = ? AND payroll_month = ?")
    .bind(employeeId, validMonth).first<Record<string, unknown>>();
  const performance = await database.prepare(`SELECT deposit_count, mid_value, min_value, result_type FROM hr_monthly_deposit_results WHERE employee_id = ? AND result_month = ?`)
    .bind(employeeId, validMonth).first<Record<string, unknown>>();
  const attendance = await getAttendancePayrollImpact(employeeId, validMonth);
  return {
    employee,
    settings: { targetWebsites: Number(settings?.target_websites ?? 0), deductionPerWebsite: Number(settings?.deduction_per_website ?? 100) },
    installments: installments.results,
    warnings: warnings.results,
    payroll,
    performance,
    attendance,
  };
}

export async function getPayrollSettings() {
  const database = getD1();
  await database.prepare(`
    INSERT OR IGNORE INTO hr_payroll_settings (id, target_websites, deduction_per_website) VALUES (1, 0, 100)
  `).run();
  const settings = await database.prepare(
    "SELECT target_websites, deduction_per_website FROM hr_payroll_settings WHERE id = 1",
  ).first<Record<string, unknown>>();
  return {
    targetWebsites: Number(settings?.target_websites ?? 0),
    deductionPerWebsite: Number(settings?.deduction_per_website ?? 100),
  };
}

export async function listMonthlyPayroll(payrollMonthValue: unknown) {
  await ensureEmployeesSeeded();
  const payrollMonth = month(payrollMonthValue);
  const database = getD1();
  const rows = await database.prepare(`
    SELECT e.id AS employee_id, e.nickname, e.team, e.salary, e.status, e.end_date,
      p.id AS payroll_id, p.base_salary, p.websites_completed, p.target_websites,
      p.other_income, p.custom_income_items, p.winloss_amount, p.installment_deduction, p.warning_deduction,
      p.working_days, p.attendance_bonus_loss, p.attendance_deduction, p.other_deduction, p.custom_deduction_items, p.net_salary, p.updated_at
    FROM hr_employees e
    LEFT JOIN hr_payroll_records p ON p.employee_id = e.id AND p.payroll_month = ?
    WHERE (e.start_date = '' OR
      CASE WHEN e.start_date GLOB '??/??/????'
        THEN substr(e.start_date, 7, 4) || '-' || substr(e.start_date, 4, 2) || '-' || substr(e.start_date, 1, 2)
        ELSE e.start_date END < ?)
      AND (e.status <> 'ลาออก' OR
        CASE WHEN e.end_date GLOB '??/??/????'
          THEN substr(e.end_date, 7, 4) || '-' || substr(e.end_date, 4, 2) || '-' || substr(e.end_date, 1, 2)
          ELSE e.end_date END >= ?)
    ORDER BY e.sequence, e.id
  `).bind(payrollMonth, `${addMonth(payrollMonth)}-01`, `${payrollMonth}-01`).all<Record<string, unknown>>();
  return {
    month: payrollMonth,
    rows: rows.results.map((row) => ({
      employeeId: String(row.employee_id), nickname: String(row.nickname), team: String(row.team),
      employeeStatus: String(row.status), endDate: String(row.end_date ?? ""),
      salary: Number(row.salary ?? 0), completed: Boolean(row.payroll_id), payrollId: row.payroll_id ? Number(row.payroll_id) : null,
      baseSalary: Number(row.base_salary ?? 0), websitesCompleted: Number(row.websites_completed ?? 0),
      targetWebsites: Number(row.target_websites ?? 0), otherIncome: Number(row.other_income ?? 0),
      customIncomeItems: JSON.parse(String(row.custom_income_items ?? "[]")),
      winlossAmount: Number(row.winloss_amount ?? 0), installmentDeduction: Number(row.installment_deduction ?? 0),
      warningDeduction: Number(row.warning_deduction ?? 0), workingDays: Number(row.working_days ?? 0),
      attendanceBonusLoss: Number(row.attendance_bonus_loss ?? 0), attendanceDeduction: Number(row.attendance_deduction ?? 0), otherDeduction: Number(row.other_deduction ?? 0),
      customDeductionItems: JSON.parse(String(row.custom_deduction_items ?? "[]")),
      netSalary: Number(row.net_salary ?? 0), updatedAt: row.updated_at ? String(row.updated_at) : null,
    })),
  };
}

export async function savePayrollSettings(input: Input) {
  const target = money(input.targetWebsites);
  const rate = money(input.deductionPerWebsite);
  if (rate <= 0) throw new Error("ราคาหักต่อเว็บต้องมากกว่า 0 บาท");
  const database = getD1();
  await database.prepare(`
    INSERT INTO hr_payroll_settings (id, target_websites, deduction_per_website, updated_at)
    VALUES (1, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET target_websites = excluded.target_websites,
      deduction_per_website = excluded.deduction_per_website, updated_at = CURRENT_TIMESTAMP
  `).bind(target, rate).run();
  return { targetWebsites: target, deductionPerWebsite: rate };
}

export async function savePayroll(input: Input) {
  const database = getD1();
  const employeeId = text(input.employeeId);
  const payrollMonth = month(input.payrollMonth);
  const source = await getPayrollData(employeeId, payrollMonth);
  const isUpdate = Boolean(source.payroll);
  const websitesCompleted = money(input.websitesCompleted);
  const customIncomeItems = Array.isArray(input.customIncomeItems) ? input.customIncomeItems.map((item) => ({ name: text((item as Input).name), amount: money((item as Input).amount) })).filter((item) => item.name && item.amount > 0) : [];
  const customDeductionItems = Array.isArray(input.customDeductionItems) ? input.customDeductionItems.map((item) => ({ name: text((item as Input).name), amount: money((item as Input).amount) })).filter((item) => item.name && item.amount > 0) : [];
  const otherIncome = customIncomeItems.reduce((sum, item) => sum + item.amount, 0);
  const winlossAmount = String(source.performance?.result_type ?? "") === "winloss" ? money(input.winlossAmount) : 0;
  const otherDeduction = customDeductionItems.reduce((sum, item) => sum + item.amount, 0);
  const pulledInstallments = Boolean(input.pulledInstallments);
  const normalBaseSalary = money(source.employee.salary);
  const baseSalary = websitesCompleted >= source.settings.targetWebsites
    ? normalBaseSalary
    : websitesCompleted * source.settings.deductionPerWebsite;
  const websiteDeduction = 0;
  const installmentDeduction = isUpdate ? Number(source.payroll?.installment_deduction ?? 0) : pulledInstallments
    ? source.installments.reduce((sum, item) => sum + Number(item.amount), 0)
    : 0;
  const warningDeduction = source.warnings.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const attendanceBonus = source.attendance.attendanceBonus;
  const attendanceDeduction = source.attendance.attendanceDeduction;
  const netSalary = Math.max(0, baseSalary + otherIncome + winlossAmount + attendanceBonus - websiteDeduction - installmentDeduction - warningDeduction - attendanceDeduction - otherDeduction);

  const saved = await database.prepare(`
    INSERT INTO hr_payroll_records (
      employee_id, payroll_month, base_salary, websites_completed, target_websites, deduction_per_website,
      website_deduction, installment_deduction, warning_deduction, warning_count, working_days,
      attendance_bonus_loss, attendance_deduction, other_income, custom_income_items, winloss_amount, other_deduction, custom_deduction_items,
      pulled_installments, net_salary, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(employee_id, payroll_month) DO UPDATE SET
      base_salary = excluded.base_salary, websites_completed = excluded.websites_completed,
      target_websites = excluded.target_websites, deduction_per_website = excluded.deduction_per_website,
      website_deduction = excluded.website_deduction, installment_deduction = excluded.installment_deduction,
      warning_deduction = excluded.warning_deduction, warning_count = excluded.warning_count,
      working_days = excluded.working_days, attendance_bonus_loss = excluded.attendance_bonus_loss,
      attendance_deduction = excluded.attendance_deduction,
      other_income = excluded.other_income, custom_income_items = excluded.custom_income_items, winloss_amount = excluded.winloss_amount, other_deduction = excluded.other_deduction, custom_deduction_items = excluded.custom_deduction_items,
      pulled_installments = excluded.pulled_installments, net_salary = excluded.net_salary,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `).bind(
    employeeId, payrollMonth, baseSalary, websitesCompleted, source.settings.targetWebsites,
    source.settings.deductionPerWebsite, websiteDeduction, installmentDeduction, warningDeduction,
    source.warnings.length, source.attendance.workingDays, attendanceBonus, attendanceDeduction,
    otherIncome, JSON.stringify(customIncomeItems), winlossAmount, otherDeduction, JSON.stringify(customDeductionItems), isUpdate ? Number(source.payroll?.pulled_installments ?? 0) : pulledInstallments ? 1 : 0, netSalary,
  ).first<{ id: number }>();
  const payrollId = Number(saved?.id);

  if (!isUpdate) for (const installment of source.installments) {
    const installmentId = Number(installment.id);
    if (pulledInstallments) {
      await database.prepare(`
        UPDATE hr_advance_installments SET status = 'deducted', payroll_record_id = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(payrollId, installmentId).run();
    } else if (String(installment.status) === "pending") {
      await database.prepare(`
        UPDATE hr_advance_installments SET status = 'skipped', processed_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(installmentId).run();
      const last = await database.prepare("SELECT MAX(due_month) AS last_month FROM hr_advance_installments WHERE advance_id = ?")
        .bind(installment.advance_id).first<{ last_month: string }>();
      await database.prepare(`
        INSERT OR IGNORE INTO hr_advance_installments (advance_id, due_month, amount, status) VALUES (?, ?, ?, 'pending')
      `).bind(installment.advance_id, addMonth(String(last?.last_month ?? payrollMonth)), installment.amount).run();
    }
  }

  await database.prepare(`
    UPDATE hr_employee_advances SET status = CASE
      WHEN EXISTS (SELECT 1 FROM hr_advance_installments i WHERE i.advance_id = hr_employee_advances.id AND i.status = 'pending') THEN 'active'
      ELSE 'paid' END, updated_at = CURRENT_TIMESTAMP
    WHERE employee_id = ?
  `).bind(employeeId).run();
  return getPayrollData(employeeId, payrollMonth);
}

export async function deletePayroll(employeeIdValue: unknown, payrollMonthValue: unknown) {
  const database = getD1();
  const employeeId = text(employeeIdValue);
  const payrollMonth = month(payrollMonthValue);
  const payroll = await database.prepare("SELECT id FROM hr_payroll_records WHERE employee_id = ? AND payroll_month = ?").bind(employeeId, payrollMonth).first<{ id: number }>();
  if (!payroll) throw new Error("ไม่พบรายการเงินเดือน");
  await database.batch([
    database.prepare("UPDATE hr_advance_installments SET status = 'pending', payroll_record_id = NULL, processed_at = NULL WHERE payroll_record_id = ?").bind(payroll.id),
    database.prepare("DELETE FROM hr_payroll_records WHERE id = ?").bind(payroll.id),
  ]);
  await database.prepare("UPDATE hr_employee_advances SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE employee_id = ? AND EXISTS (SELECT 1 FROM hr_advance_installments i WHERE i.advance_id = hr_employee_advances.id AND i.status = 'pending')").bind(employeeId).run();
  return getPayrollData(employeeId, payrollMonth);
}
