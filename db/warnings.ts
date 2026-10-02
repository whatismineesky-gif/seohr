import { getD1 } from "./index";
import { ensureEmployeesSeeded } from "./employees";

type Input = Record<string, unknown>;

const DEFAULT_CONFIG = [
  [1, 3, 0], [2, 30, 25], [3, 50, 45], [4, 75, 65], [5, 110, 100], [6, 150, 140],
  [7, 220, 200], [8, 260, 240], [9, 300, 280], [10, 350, 320], [11, 400, 360], [12, 450, 380],
  [13, 500, 400], [14, 500, 400], [15, 500, 400], [16, 500, 400], [17, 500, 400], [18, 500, 400],
  [19, 500, 400], [20, 500, 400], [21, 500, 400], [22, 500, 400], [23, 500, 400], [24, 500, 400],
] as const;

function validMonth(value: unknown) {
  const result = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(result)) throw new Error("กรุณาระบุเดือนให้ถูกต้อง");
  return result;
}

function nonNegative(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function tenureAt(startDate: string, month: string) {
  const match = /^(\d{4})-(\d{2})/.exec(startDate);
  if (!match) return 1;
  const [year, monthNumber] = month.split("-").map(Number);
  const months = (year - Number(match[1])) * 12 + monthNumber - Number(match[2]) + 1;
  return Math.max(1, months);
}

function configMonth(tenure: number) {
  return Math.min(24, Math.max(1, tenure));
}

function resultType(depositCount: number, mid: number, min: number) {
  if (depositCount > mid) return "winloss";
  if (depositCount > min) return "yellow";
  return "red";
}

async function ensureWarningConfig() {
  const database = getD1();
  await database.batch(DEFAULT_CONFIG.map(([tenure, mid, min]) => database.prepare(`
    INSERT OR IGNORE INTO hr_warning_configs (tenure_month, mid_value, min_value) VALUES (?, ?, ?)
  `).bind(tenure, mid, min)));
}

export async function getWarningData(requestedMonth: string) {
  await ensureEmployeesSeeded();
  await ensureWarningConfig();
  const month = validMonth(requestedMonth);
  const database = getD1();
  const configRows = await database.prepare(`
    SELECT tenure_month, mid_value, min_value FROM hr_warning_configs ORDER BY tenure_month
  `).all<Record<string, unknown>>();
  const configs = configRows.results.map((row) => ({
    tenureMonth: Number(row.tenure_month), mid: Number(row.mid_value), min: Number(row.min_value),
  }));
  const configMap = new Map(configs.map((item) => [item.tenureMonth, item]));
  const employees = await database.prepare(`
    SELECT id, nickname, team, start_date FROM hr_employees
    WHERE status = 'ยังทำงานอยู่' ORDER BY sequence
  `).all<Record<string, unknown>>();
  const saved = await database.prepare(`
    SELECT employee_id, tenure_month, deposit_count, mid_value, min_value, result_type,
      tenure_quarter, quarter_month FROM hr_monthly_deposit_results WHERE result_month = ?
  `).bind(month).all<Record<string, unknown>>();
  const savedMap = new Map(saved.results.map((row) => [String(row.employee_id), row]));
  const rows = employees.results.map((employee) => {
    const tenure = tenureAt(String(employee.start_date ?? ""), month);
    const config = configMap.get(configMonth(tenure)) ?? { mid: 500, min: 400 };
    const current = savedMap.get(String(employee.id));
    const deposits = current ? Number(current.deposit_count) : 0;
    return {
      employeeId: String(employee.id), nickname: String(employee.nickname), team: String(employee.team),
      tenureMonth: tenure, depositCount: deposits, mid: Number(config.mid), min: Number(config.min),
      resultType: current ? String(current.result_type) : resultType(deposits, Number(config.mid), Number(config.min)),
      tenureQuarter: Math.ceil(tenure / 3), quarterMonth: ((tenure - 1) % 3) + 1, saved: Boolean(current),
    };
  });
  const quarterRows = await database.prepare(`
    SELECT r.employee_id, e.nickname, e.team, r.tenure_quarter, r.quarter_month,
      r.result_month, r.tenure_month, r.deposit_count, r.mid_value, r.min_value, r.result_type
    FROM hr_monthly_deposit_results r JOIN hr_employees e ON e.id = r.employee_id
    ORDER BY r.tenure_quarter DESC, e.team, e.nickname, r.result_month
  `).all<Record<string, unknown>>();
  const quarters = new Map<string, {
    employeeId: string; nickname: string; team: string; tenureQuarter: number;
    months: Array<{ tenureMonth: number; resultMonth: string; depositCount: number | null;
      mid: number; min: number; resultType: string | null }>;
  }>();
  function ensureQuarter(employeeId: string, nickname: string, team: string, tenureQuarter: number, anchor: number) {
    const key = `${employeeId}:${tenureQuarter}`;
    let quarter = quarters.get(key);
    if (!quarter) {
      quarter = {
        employeeId, nickname, team, tenureQuarter,
        months: Array.from({ length: 3 }, (_, index) => {
          const tenureMonth = (tenureQuarter - 1) * 3 + index + 1;
          const config = configMap.get(configMonth(tenureMonth)) ?? { mid: 500, min: 400 };
          const calendarMonth = anchor + index;
          return { tenureMonth, resultMonth: `${Math.floor(calendarMonth / 12)}-${String(calendarMonth % 12 + 1).padStart(2, "0")}`,
            depositCount: null, mid: config.mid, min: config.min, resultType: null };
        }),
      };
      quarters.set(key, quarter);
    }
    return quarter;
  }
  // Include active employees even when their current quarter has no saved deposits.
  const [year, monthNumber] = month.split("-").map(Number);
  for (const employee of employees.results) {
    const tenure = tenureAt(String(employee.start_date ?? ""), month);
    const anchor = year * 12 + monthNumber - 1 - ((tenure - 1) % 3);
    ensureQuarter(String(employee.id), String(employee.nickname), String(employee.team), Math.ceil(tenure / 3), anchor);
  }
  // Keep every recorded quarter, including historical records of resigned employees.
  for (const record of quarterRows.results) {
    const [recordYear, recordMonth] = String(record.result_month).split("-").map(Number);
    const anchor = recordYear * 12 + recordMonth - 1 - (Number(record.quarter_month) - 1);
    const quarter = ensureQuarter(String(record.employee_id), String(record.nickname), String(record.team), Number(record.tenure_quarter), anchor);
    const index = Number(record.quarter_month) - 1;
    if (index >= 0 && index < 3) quarter.months[index] = {
      tenureMonth: Number(record.tenure_month), resultMonth: String(record.result_month),
      depositCount: Number(record.deposit_count), mid: Number(record.mid_value),
      min: Number(record.min_value), resultType: String(record.result_type),
    };
  }
  return {
    month, configs, rows,
    quarterSummary: [...quarters.values()].map((quarter) => ({
      ...quarter,
      depositTotal: quarter.months.reduce((total, item) => total + (item.depositCount ?? 0), 0),
      minTotal: quarter.months.reduce((total, item) => total + item.min, 0),
      yellowCount: quarter.months.filter((item) => item.resultType === "yellow").length,
      redCount: quarter.months.filter((item) => item.resultType === "red").length,
      recordedMonths: quarter.months.filter((item) => item.depositCount !== null).length,
    })),
  };
}

export async function saveWarningConfig(input: Input) {
  const values = Array.isArray(input.configs) ? input.configs as Input[] : [];
  if (values.length !== 24) throw new Error("Config ต้องมีอายุงานครบ 1–24 เดือน");
  const database = getD1();
  await database.batch(values.map((item) => {
    const tenure = nonNegative(item.tenureMonth);
    const mid = nonNegative(item.mid);
    const min = nonNegative(item.min);
    if (tenure < 1 || tenure > 24) throw new Error("อายุงานใน Config ไม่ถูกต้อง");
    if (mid < min) throw new Error(`MID เดือนที่ ${tenure} ต้องไม่น้อยกว่า MIN`);
    return database.prepare(`
      INSERT INTO hr_warning_configs (tenure_month, mid_value, min_value, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tenure_month) DO UPDATE SET mid_value = excluded.mid_value,
        min_value = excluded.min_value, updated_at = CURRENT_TIMESTAMP
    `).bind(tenure, mid, min);
  }));
  return getWarningData(validMonth(input.month));
}

export async function saveWarningRows(input: Input) {
  const month = validMonth(input.month);
  const values = Array.isArray(input.rows) ? input.rows as Input[] : [];
  if (!values.length) throw new Error("ไม่มีข้อมูลสำหรับบันทึก");
  await ensureEmployeesSeeded();
  await ensureWarningConfig();
  const database = getD1();
  const configs = await database.prepare(`SELECT tenure_month, mid_value, min_value FROM hr_warning_configs`).all<Record<string, unknown>>();
  const configMap = new Map(configs.results.map((item) => [Number(item.tenure_month), item]));
  const statements = [];
  for (const item of values) {
    const employeeId = String(item.employeeId ?? "").trim();
    const employee = await database.prepare("SELECT id, start_date FROM hr_employees WHERE id = ?").bind(employeeId).first<Record<string, unknown>>();
    if (!employee) throw new Error(`ไม่พบรหัสพนักงาน ${employeeId}`);
    const tenure = tenureAt(String(employee.start_date ?? ""), month);
    const config = configMap.get(configMonth(tenure));
    if (!config) throw new Error(`ไม่พบ Config อายุงาน ${configMonth(tenure)} เดือน`);
    const depositCount = nonNegative(item.depositCount);
    const mid = Number(config.mid_value);
    const min = Number(config.min_value);
    const result = resultType(depositCount, mid, min);
    const quarter = Math.ceil(tenure / 3);
    const quarterMonth = ((tenure - 1) % 3) + 1;
    statements.push(database.prepare(`
      INSERT INTO hr_monthly_deposit_results (
        employee_id, result_month, tenure_month, deposit_count, mid_value, min_value,
        result_type, tenure_quarter, quarter_month, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(employee_id, result_month) DO UPDATE SET tenure_month = excluded.tenure_month,
        deposit_count = excluded.deposit_count, mid_value = excluded.mid_value, min_value = excluded.min_value,
        result_type = excluded.result_type, tenure_quarter = excluded.tenure_quarter,
        quarter_month = excluded.quarter_month, updated_at = CURRENT_TIMESTAMP
    `).bind(employeeId, month, tenure, depositCount, mid, min, result, quarter, quarterMonth));
    statements.push(database.prepare(`
      DELETE FROM hr_warning_records WHERE employee_id = ? AND warning_date = ? AND note = 'AUTO_DEPOSIT_KPI'
    `).bind(employeeId, `${month}-01`));
    if (result === "yellow" || result === "red") {
      statements.push(database.prepare(`
        INSERT INTO hr_warning_records (employee_id, warning_date, subject, amount, note)
        VALUES (?, ?, ?, 0, 'AUTO_DEPOSIT_KPI')
      `).bind(employeeId, `${month}-01`, result === "yellow" ? "ใบเหลือง" : "ใบแดง"));
    }
  }
  await database.batch(statements);
  return getWarningData(month);
}

export async function deleteWarningRow(input: Input) {
  const month = validMonth(input.month);
  const employeeId = String(input.employeeId ?? "").trim();
  if (!employeeId) throw new Error("กรุณาระบุพนักงาน");
  const database = getD1();
  await database.batch([
    database.prepare("DELETE FROM hr_monthly_deposit_results WHERE employee_id = ? AND result_month = ?").bind(employeeId, month),
    database.prepare("DELETE FROM hr_warning_records WHERE employee_id = ? AND warning_date = ? AND note = 'AUTO_DEPOSIT_KPI'").bind(employeeId, `${month}-01`),
  ]);
  return getWarningData(month);
}
