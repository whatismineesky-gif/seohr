import { selectedEmployeeId as resolveSelectedEmployeeId } from "../lib/employee-selection";
import { getD1 } from "./index";
import { ensureEmployeesSeeded } from "./employees";

export type AppRole = "employee" | "hr" | "audit";

export type AuthUser = {
  userId: string;
  email: string;
  displayName: string;
};

export type SystemUser = AuthUser & {
  role: AppRole;
  employeeId: string | null;
};

export type AttendanceRule = {
  id: number;
  code: string;
  name: string;
  eventType: string;
  triggerFrom: number;
  actionType: string;
  actionValue: number;
  period: string;
  active: boolean;
  builtIn: boolean;
};

export type AttendanceBonusTier = {
  id: number;
  minMonth: number;
  maxMonth: number | null;
  amount: number;
  active: boolean;
};

const defaultRules = [
  ["LATE_BONUS", "มาสายไม่ได้รับเบี้ยขยัน", "late", 1, "lose_bonus", 0],
  [
    "MEETING_LEAVE_BONUS",
    "ลาประชุมไม่ได้รับเบี้ยขยัน",
    "meeting_leave",
    1,
    "lose_bonus",
    0,
  ],
  [
    "ABSENCE_DEDUCTION",
    "หยุดงานครั้งที่ 5 เป็นต้นไปหักเงิน",
    "absence",
    5,
    "deduct_money",
    1000,
  ],
  [
    "LATE_FORCE_LEAVE",
    "มาสายครั้งที่ 3 เป็นต้นไปบังคับหยุด",
    "late",
    3,
    "force_leave",
    1,
  ],
  [
    "MEETING_LEAVE_LIMIT",
    "ลาประชุมได้ต่อเดือน",
    "meeting_leave",
    1,
    "limit",
    3,
  ],
  ["ABSENCE_LIMIT", "หยุดงานได้ต่อเดือน", "absence", 1, "limit", 4],
] as const;

const defaultBonusTiers: AttendanceBonusTier[] = [
  { id: 1, minMonth: 1, maxMonth: 3, amount: 0, active: true },
  { id: 2, minMonth: 4, maxMonth: 4, amount: 1000, active: true },
  { id: 3, minMonth: 5, maxMonth: 5, amount: 1500, active: true },
  { id: 4, minMonth: 6, maxMonth: null, amount: 2000, active: true },
];

function mapRole(value: unknown): AppRole {
  return value === "hr" || value === "audit" ? value : "employee";
}

function mapSystemUser(row: Record<string, unknown>): SystemUser {
  return {
    userId: String(row.user_id ?? ""),
    email: String(row.email ?? ""),
    displayName: String(row.display_name ?? row.email ?? ""),
    role: mapRole(row.role),
    employeeId: row.employee_id ? String(row.employee_id) : null,
  };
}

function mapRule(row: Record<string, unknown>): AttendanceRule {
  return {
    id: Number(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    eventType: String(row.event_type ?? ""),
    triggerFrom: Number(row.trigger_from ?? 1),
    actionType: String(row.action_type ?? ""),
    actionValue: Number(row.action_value ?? 0),
    period: String(row.period ?? "monthly"),
    active: Boolean(row.active),
    builtIn: Boolean(row.built_in),
  };
}

function mapBonusTier(row: Record<string, unknown>): AttendanceBonusTier {
  return {
    id: Number(row.id),
    minMonth: Number(row.min_month),
    maxMonth:
      row.max_month === null || row.max_month === undefined
        ? null
        : Number(row.max_month),
    amount: Number(row.amount ?? 0),
    active: Boolean(row.active),
  };
}

function normalizedMonthFromDate(value: unknown) {
  const text = String(value ?? "").trim();
  const thai = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (thai) return `${thai[3]}-${thai[2]}`;
  const iso = /^(\d{4})-(\d{2})/.exec(text);
  return iso ? `${iso[1]}-${iso[2]}` : "";
}

function serviceMonthFor(startDate: unknown, payrollMonth: string) {
  const startMonth = normalizedMonthFromDate(startDate);
  if (!startMonth) return 1;
  const [startYear, startMonthNumber] = startMonth.split("-").map(Number);
  const [payrollYear, payrollMonthNumber] = payrollMonth.split("-").map(Number);
  return Math.max(
    0,
    (payrollYear - startYear) * 12 + payrollMonthNumber - startMonthNumber + 1,
  );
}

function bonusForServiceMonth(
  tiers: AttendanceBonusTier[],
  serviceMonth: number,
) {
  return (
    tiers.find(
      (tier) =>
        tier.active &&
        serviceMonth >= tier.minMonth &&
        (tier.maxMonth === null || serviceMonth <= tier.maxMonth),
    )?.amount ?? 0
  );
}

export async function ensureAttendanceSetup(
  user: AuthUser,
): Promise<SystemUser> {
  await ensureEmployeesSeeded();
  const database = getD1();
  const [existingResult, ruleCountResult] = await database.batch([
    database
      .prepare(
        "SELECT user_id, email, display_name, role, employee_id FROM hr_system_users WHERE email = ? COLLATE NOCASE",
      )
      .bind(user.email),
    database.prepare(
      `SELECT COUNT(*) AS count FROM hr_attendance_rules
       WHERE code IN ('LATE_BONUS', 'MEETING_LEAVE_BONUS', 'ABSENCE_DEDUCTION',
         'LATE_FORCE_LEAVE', 'MEETING_LEAVE_LIMIT', 'ABSENCE_LIMIT')`,
    ),
  ]);
  const existing = existingResult.results[0] as
    | Record<string, unknown>
    | undefined;
  const ruleCount = Number(ruleCountResult.results[0]?.count ?? 0);

  if (ruleCount < defaultRules.length) {
    const ruleSql = `
      INSERT OR IGNORE INTO hr_attendance_rules (
        code, name, event_type, trigger_from, action_type, action_value,
        period, active, built_in, created_by_email
      ) VALUES (?, ?, ?, ?, ?, ?, 'monthly', 1, 1, ?)
    `;
    await database.batch(
      defaultRules.map((rule) =>
        database.prepare(ruleSql).bind(...rule, user.email),
      ),
    );
  }

  if (existing) {
    if (
      String(existing.user_id ?? "") !== user.userId ||
      String(existing.display_name ?? "") !== user.displayName
    ) {
      await database
        .prepare(
          `
        UPDATE hr_system_users SET user_id = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE email = ? COLLATE NOCASE
      `,
        )
        .bind(user.userId, user.displayName, user.email)
        .run();
    }
    return {
      ...mapSystemUser(existing),
      userId: user.userId,
      displayName: user.displayName,
    };
  }

  const count = await database
    .prepare("SELECT COUNT(*) AS count FROM hr_system_users")
    .first<{ count: number }>();
  const employee = await database
    .prepare("SELECT id FROM hr_employees WHERE email = ? COLLATE NOCASE LIMIT 1")
    .bind(user.email)
    .first<{ id: string }>();
  const role: AppRole = Number(count?.count ?? 0) === 0 ? "hr" : "employee";
  await database
    .prepare(
      `
    INSERT INTO hr_system_users (email, user_id, display_name, role, employee_id)
    VALUES (?, ?, ?, ?, ?)
  `,
    )
    .bind(user.email, user.userId, user.displayName, role, employee?.id ?? null)
    .run();

  return { ...user, role, employeeId: employee?.id ?? null };
}

function monthBounds(month: string) {
  const valid = /^\d{4}-\d{2}$/.test(month)
    ? month
    : new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = valid.split("-").map(Number);
  const start = `${valid}-01`;
  const next =
    monthNumber === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;
  return { month: valid, start, next, year, monthNumber };
}

function bangkokDateValue() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function normalizedPosition(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-–—./()]+/g, "");
}

function workingDaysInMonth(year: number, monthNumber: number) {
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function getRule(
  rules: AttendanceRule[],
  eventType: string,
  actionType: string,
) {
  return rules.find(
    (rule) =>
      rule.active &&
      rule.eventType === eventType &&
      rule.actionType === actionType,
  );
}

export async function getAttendanceData(
  user: SystemUser,
  requestedMonth: string,
  requestedEmployeeId?: string,
  requestedAuditPage = 1,
  requestedStatusDate?: string,
) {
  const database = getD1();
  const bounds = monthBounds(requestedMonth);
  const viewerEmployee = user.employeeId
    ? await database
        .prepare("SELECT team, position FROM hr_employees WHERE id = ?")
        .bind(user.employeeId)
        .first<Record<string, unknown>>()
    : null;
  const viewerTeam = String(viewerEmployee?.team ?? "");
  const viewerPosition = normalizedPosition(viewerEmployee?.position);
  const canViewTeamSummary =
    user.role === "employee" &&
    Boolean(viewerTeam) &&
    new Set(["head", "seniorstaff"]).has(viewerPosition);
  const employeesResult = await database
    .prepare(
      `
    SELECT id, nickname, team, position, status, email, start_date, end_date
    FROM hr_employees
    WHERE (start_date = '' OR
      CASE WHEN start_date GLOB '??/??/????'
        THEN substr(start_date, 7, 4) || '-' || substr(start_date, 4, 2) || '-' || substr(start_date, 1, 2)
        ELSE start_date END < ?)
      AND (status <> 'ลาออก' OR
        CASE WHEN end_date GLOB '??/??/????'
          THEN substr(end_date, 7, 4) || '-' || substr(end_date, 4, 2) || '-' || substr(end_date, 1, 2)
          ELSE end_date END >= ?)
    ORDER BY sequence ASC
  `,
    )
    .bind(bounds.next, bounds.start)
    .all<Record<string, unknown>>();
  const allEmployees = employeesResult.results.map((row) => ({
    id: String(row.id),
    nickname: String(row.nickname),
    team: String(row.team),
    position: String(row.position ?? ""),
    status: String(row.status),
    startDate: String(row.start_date ?? ""),
    endDate: String(row.end_date ?? ""),
    email: String(row.email ?? ""),
  }));
  const employees =
    user.role === "employee"
      ? allEmployees
          .filter((employee) =>
            canViewTeamSummary
              ? employee.team === viewerTeam
              : employee.id === user.employeeId,
          )
          .map((employee) => ({
            id: employee.id,
            nickname: employee.nickname,
            team: employee.team,
            position: employee.position,
            status: employee.status,
            email: "",
            endDate: "",
          }))
      : allEmployees.map((employee) =>
          user.role === "hr"
            ? {
                id: employee.id,
                nickname: employee.nickname,
                team: employee.team,
                position: employee.position,
                status: employee.status,
                email: employee.email,
                endDate: employee.endDate,
              }
            : {
                id: employee.id,
                nickname: employee.nickname,
                team: employee.team,
                position: employee.position,
                status: employee.status,
                email: "",
                endDate: "",
              },
        );

  const selectedEmployeeId =
    user.role === "employee"
      ? user.employeeId
      : (resolveSelectedEmployeeId(employees, user.employeeId, requestedEmployeeId) || null);

  const auditPageSize = 50;
  const auditPage = Number.isFinite(requestedAuditPage)
    ? Math.max(1, Math.floor(requestedAuditPage))
    : 1;
  const auditOffset = (auditPage - 1) * auditPageSize;

  const recordsSql =
    canViewTeamSummary
      ? `SELECT r.*, e.nickname, e.team FROM hr_attendance_records r JOIN hr_employees e ON e.id = r.employee_id WHERE r.record_date >= ? AND r.record_date < ? AND e.team = ? ORDER BY r.record_date DESC, r.id DESC`
      : user.role === "employee"
      ? `SELECT r.*, e.nickname, e.team FROM hr_attendance_records r JOIN hr_employees e ON e.id = r.employee_id WHERE r.record_date >= ? AND r.record_date < ? AND r.employee_id = ? ORDER BY r.record_date DESC, r.id DESC`
      : `SELECT r.*, e.nickname, e.team FROM hr_attendance_records r JOIN hr_employees e ON e.id = r.employee_id WHERE r.record_date >= ? AND r.record_date < ? ORDER BY r.record_date DESC, r.id DESC`;
  const recordStatement =
    canViewTeamSummary
      ? database.prepare(recordsSql).bind(bounds.start, bounds.next, viewerTeam)
      : user.role === "employee"
      ? database
          .prepare(recordsSql)
          .bind(bounds.start, bounds.next, user.employeeId ?? "")
      : database.prepare(recordsSql).bind(bounds.start, bounds.next);

  const statusDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedStatusDate ?? "")
    ? requestedStatusDate!
    : bangkokDateValue();
  const statusSql = canViewTeamSummary
    ? `SELECT r.employee_id, r.record_type, r.reason, e.nickname, e.team, e.position
       FROM hr_attendance_records r JOIN hr_employees e ON e.id = r.employee_id
       WHERE r.record_date = ? AND r.record_type IN ('absence', 'meeting_leave', 'admin', 'true')
         AND e.team = ? ORDER BY e.sequence, r.id`
    : user.role === "employee"
      ? `SELECT r.employee_id, r.record_type, r.reason, e.nickname, e.team, e.position
         FROM hr_attendance_records r JOIN hr_employees e ON e.id = r.employee_id
         WHERE r.record_date = ? AND r.record_type IN ('absence', 'meeting_leave', 'admin', 'true')
           AND r.employee_id = ? ORDER BY r.id`
      : `SELECT r.employee_id, r.record_type, r.reason, e.nickname, e.team, e.position
         FROM hr_attendance_records r JOIN hr_employees e ON e.id = r.employee_id
         WHERE r.record_date = ? AND r.record_type IN ('absence', 'meeting_leave', 'admin', 'true')
         ORDER BY e.sequence, r.id`;
  const statusStatement = canViewTeamSummary
    ? database.prepare(statusSql).bind(statusDate, viewerTeam)
    : user.role === "employee"
      ? database.prepare(statusSql).bind(statusDate, user.employeeId ?? "")
      : database.prepare(statusSql).bind(statusDate);

  const auditWhere = `employee_id = ?
    AND ((previous_record_date >= ? AND previous_record_date < ?)
      OR (new_record_date >= ? AND new_record_date < ?))`;
  const auditBindings = [
    selectedEmployeeId ?? "",
    bounds.start,
    bounds.next,
    bounds.start,
    bounds.next,
  ] as const;
  const auditStatement = database
    .prepare(
      `SELECT * FROM hr_attendance_audit_logs
       WHERE ${auditWhere}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...auditBindings, auditPageSize, auditOffset);
  const auditCountStatement = database
    .prepare(
      `SELECT COUNT(*) AS count FROM hr_attendance_audit_logs WHERE ${auditWhere}`,
    )
    .bind(...auditBindings);
  const rulesStatement = database.prepare(`
    SELECT id, code, name, event_type, trigger_from, action_type, action_value, period, active, built_in
    FROM hr_attendance_rules ORDER BY built_in DESC, id ASC
  `);
  const bonusTiersStatement = database.prepare(`
    SELECT id, min_month, max_month, amount, active
    FROM hr_attendance_bonus_tiers ORDER BY min_month, id
  `);

  const [
    recordResult,
    statusResult,
    auditResult,
    auditCountResult,
    ruleResult,
    bonusTierResult,
  ] =
    await database.batch([
      recordStatement,
      statusStatement,
      auditStatement,
      auditCountStatement,
      rulesStatement,
      bonusTiersStatement,
    ]);

  const records = recordResult.results.map((row) => ({
    id: Number(row.id),
    employeeId: String(row.employee_id),
    nickname: String(row.nickname),
    team: String(row.team),
    recordDate: String(row.record_date),
    recordType: String(row.record_type),
    reason: String(row.reason ?? ""),
    recorderEmail:
      user.role === "employee" &&
      String(row.employee_id) !== user.employeeId
        ? ""
        : String(row.recorder_email),
    recorderRole: String(row.recorder_role),
    createdAt: String(row.created_at),
  }));
  const statusRecords = statusResult.results.map((row) => ({
    employeeId: String(row.employee_id),
    nickname: String(row.nickname ?? ""),
    team: String(row.team ?? ""),
    position: String(row.position ?? ""),
    recordType: String(row.record_type),
    reason: String(row.reason ?? ""),
  }));

  const auditLogs = auditResult.results.map((row) => ({
    id: Number(row.id),
    attendanceRecordId: Number(row.attendance_record_id),
    employeeId: String(row.employee_id),
    employeeNickname: String(row.employee_nickname ?? ""),
    action: String(row.action),
    previousRecordDate: String(row.previous_record_date),
    previousRecordType: String(row.previous_record_type),
    previousReason: String(row.previous_reason ?? ""),
    newRecordDate: row.new_record_date ? String(row.new_record_date) : null,
    newRecordType: row.new_record_type ? String(row.new_record_type) : null,
    newReason:
      row.new_reason === null || row.new_reason === undefined
        ? null
        : String(row.new_reason),
    actorEmail: String(row.actor_email),
    actorDisplayName: String(row.actor_display_name || row.actor_email),
    actorRole: String(row.actor_role),
    createdAt: String(row.created_at),
  }));

  const auditTotal = Number(auditCountResult.results[0]?.count ?? 0);
  const auditPageCount = Math.max(1, Math.ceil(auditTotal / auditPageSize));
  const rules = ruleResult.results.map(mapRule);
  const bonusTiers = bonusTierResult.results.length
    ? bonusTierResult.results.map(mapBonusTier)
    : defaultBonusTiers;
  const selectedRecords = records.filter(
    (record) => record.employeeId === selectedEmployeeId,
  );
  const counts = {
    absence: selectedRecords.filter((record) => record.recordType === "absence")
      .length,
    meetingLeave: selectedRecords.filter(
      (record) => record.recordType === "meeting_leave",
    ).length,
    late: selectedRecords.filter((record) => record.recordType === "late")
      .length,
  };
  const countFor = (eventType: string) => {
    if (eventType === "absence") return counts.absence;
    if (eventType === "meeting_leave") return counts.meetingLeave;
    if (eventType === "late") return counts.late;
    return 0;
  };
  const absenceLimit = getRule(rules, "absence", "limit")?.actionValue ?? 4;
  const meetingLimit =
    getRule(rules, "meeting_leave", "limit")?.actionValue ?? 3;
  const forceRule = getRule(rules, "late", "force_leave");
  const forceThreshold = forceRule?.triggerFrom ?? 3;
  const forcedLeaveDays = rules
    .filter((rule) => rule.active && rule.actionType === "force_leave")
    .reduce((total, rule) => {
      const count = countFor(rule.eventType);
      return (
        total +
        (count >= rule.triggerFrom
          ? (count - rule.triggerFrom + 1) * rule.actionValue
          : 0)
      );
    }, 0);
  const absenceDeduction = rules
    .filter((rule) => rule.active && rule.actionType === "deduct_money")
    .reduce((total, rule) => {
      const count = countFor(rule.eventType);
      return (
        total +
        (count >= rule.triggerFrom
          ? (count - rule.triggerFrom + 1) * rule.actionValue
          : 0)
      );
    }, 0);
  const forfeitsBonus = rules
    .filter((rule) => rule.active && rule.actionType === "lose_bonus")
    .some((rule) => countFor(rule.eventType) >= rule.triggerFrom);
  const selectedEmployee = allEmployees.find(
    (employee) => employee.id === selectedEmployeeId,
  );
  const serviceMonth = serviceMonthFor(selectedEmployee?.startDate, bounds.month);
  const eligibleAttendanceBonus = bonusForServiceMonth(
    bonusTiers,
    serviceMonth,
  );
  const bonusLoss = forfeitsBonus ? eligibleAttendanceBonus : 0;
  const attendanceBonus = forfeitsBonus ? 0 : eligibleAttendanceBonus;
  const plannedWorkingDays = workingDaysInMonth(
    bounds.year,
    bounds.monthNumber,
  );
  const summary = {
    plannedWorkingDays,
    workingDays: Math.max(
      0,
      plannedWorkingDays - counts.absence - forcedLeaveDays,
    ),
    ...counts,
    absenceRemaining: Math.max(0, absenceLimit - counts.absence),
    meetingLeaveRemaining: Math.max(0, meetingLimit - counts.meetingLeave),
    lateRemainingBeforeForceLeave: Math.max(0, forceThreshold - counts.late),
    forcedLeaveDays,
    bonusLoss,
    serviceMonth,
    eligibleAttendanceBonus,
    attendanceBonus,
    absenceDeduction,
    totalDeduction: absenceDeduction,
  };

  return {
    currentUser: user,
    month: bounds.month,
    teamSummary: { canView: canViewTeamSummary, team: viewerTeam },
    statusDate,
    statusRecords,
    selectedEmployeeId,
    employees,
    records,
    auditLogs,
    auditPagination: {
      page: Math.min(auditPage, auditPageCount),
      pageSize: auditPageSize,
      total: auditTotal,
      pageCount: auditPageCount,
    },
    rules,
    bonusTiers,
    summary,
  };
}

export async function createAttendanceRecord(
  user: SystemUser,
  input: Record<string, unknown>,
) {
  const employeeId = String(input.employeeId ?? "").trim();
  const recordDate = String(input.recordDate ?? "").trim();
  const recordType = String(input.recordType ?? "").trim();
  const reason = String(input.reason ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate))
    throw new Error("กรุณาระบุวันที่ให้ถูกต้อง");

  if (user.role === "employee") {
    if (!user.employeeId || employeeId !== user.employeeId)
      throw new Error(
        "บัญชีของคุณยังไม่เชื่อมกับพนักงาน หรือไม่มีสิทธิ์บันทึกให้ผู้อื่น",
      );
    if (!new Set(["absence", "meeting_leave", "admin", "true"]).has(recordType))
      throw new Error("พนักงานบันทึกได้เฉพาะหยุดงาน ลาประชุม แอดมิน หรือทรู");
  } else if (user.role === "audit") {
    if (!new Set(["absence", "admin", "true"]).has(recordType))
      throw new Error("Audit บันทึกได้เฉพาะหยุดงาน แอดมิน หรือทรู");
  } else if (!new Set(["late", "absence", "meeting_leave", "admin", "true"]).has(recordType)) {
    throw new Error("HR บันทึกได้เฉพาะมาสาย หยุดงาน ลาประชุม แอดมิน หรือทรู");
  }

  if (!employeeId) throw new Error("กรุณาเลือกพนักงาน");
  if (!reason) throw new Error("กรุณาระบุเหตุผล");

  const database = getD1();
  const employee = await database
    .prepare("SELECT id FROM hr_employees WHERE id = ?")
    .bind(employeeId)
    .first();
  if (!employee) throw new Error("ไม่พบพนักงานที่เลือก");
  const row = await database
    .prepare(
      `
    INSERT INTO hr_attendance_records (
      employee_id, record_date, record_type, reason,
      recorder_user_id, recorder_email, recorder_role
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `,
    )
    .bind(
      employeeId,
      recordDate,
      recordType,
      reason,
      user.userId,
      user.email,
      user.role,
    )
    .first<{ id: number }>();
  await syncAttendanceToPayroll(employeeId, recordDate.slice(0, 7));
  return { id: Number(row?.id) };
}

async function assertRecordAccess(user: SystemUser, id: number) {
  const row = await getD1()
    .prepare(
      `
    SELECT r.id, r.employee_id, r.record_date, r.record_type, r.reason,
      r.recorder_user_id, e.nickname AS employee_nickname
    FROM hr_attendance_records r
    JOIN hr_employees e ON e.id = r.employee_id
    WHERE r.id = ?
  `,
    )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) throw new Error("ไม่พบประวัติการลงเวลา");
  if (user.role === "employee" && (!user.employeeId || String(row.employee_id) !== user.employeeId))
    throw new Error("พนักงานแก้ไขหรือลบได้เฉพาะรายการของตัวเอง");
  if (user.role !== "hr" && String(row.recorder_user_id) !== user.userId)
    throw new Error("ไม่มีสิทธิ์แก้ไขหรือลบรายการนี้");
  return row;
}

export async function updateAttendanceRecord(
  user: SystemUser,
  input: Record<string, unknown>,
) {
  const id = Math.max(0, Math.round(Number(input.id ?? 0)));
  const existing = await assertRecordAccess(user, id);
  const recordDate = String(input.recordDate ?? "").trim();
  const recordType = String(input.recordType ?? "").trim();
  const reason = String(input.reason ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate))
    throw new Error("กรุณาระบุวันที่ให้ถูกต้อง");
  if (!reason) throw new Error("กรุณาระบุเหตุผล");
  if (
    user.role === "employee" &&
    !new Set(["absence", "meeting_leave", "admin", "true"]).has(recordType)
  )
    throw new Error("พนักงานบันทึกได้เฉพาะหยุดงาน ลาประชุม แอดมิน หรือทรู");
  if (user.role === "audit" && !new Set(["absence", "admin", "true"]).has(recordType))
    throw new Error("Audit บันทึกได้เฉพาะหยุดงาน แอดมิน หรือทรู");
  if (
    user.role === "hr" &&
    !new Set(["late", "absence", "meeting_leave", "admin", "true"]).has(recordType)
  )
    throw new Error("ประเภทการลงเวลาไม่ถูกต้อง");
  const database = getD1();
  await database.batch([
    database
      .prepare(
        `UPDATE hr_attendance_records SET record_date = ?, record_type = ?, reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(recordDate, recordType, reason, id),
    database
      .prepare(
        `
      INSERT INTO hr_attendance_audit_logs (
        attendance_record_id, employee_id, employee_nickname, action,
        previous_record_date, previous_record_type, previous_reason,
        new_record_date, new_record_type, new_reason,
        actor_user_id, actor_email, actor_display_name, actor_role
      ) VALUES (?, ?, ?, 'edit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .bind(
        id,
        existing.employee_id,
        existing.employee_nickname,
        existing.record_date,
        existing.record_type,
        existing.reason,
        recordDate,
        recordType,
        reason,
        user.userId,
        user.email,
        user.displayName,
        user.role,
      ),
  ]);
  const employeeId = String(existing.employee_id);
  await syncAttendanceToPayroll(
    employeeId,
    String(existing.record_date).slice(0, 7),
  );
  if (recordDate.slice(0, 7) !== String(existing.record_date).slice(0, 7))
    await syncAttendanceToPayroll(employeeId, recordDate.slice(0, 7));
  return { id };
}

export async function deleteAttendanceRecord(
  user: SystemUser,
  idValue: unknown,
) {
  const id = Math.max(0, Math.round(Number(idValue ?? 0)));
  const existing = await assertRecordAccess(user, id);
  const database = getD1();
  await database.batch([
    database
      .prepare(
        `
      INSERT INTO hr_attendance_audit_logs (
        attendance_record_id, employee_id, employee_nickname, action,
        previous_record_date, previous_record_type, previous_reason,
        actor_user_id, actor_email, actor_display_name, actor_role
      ) VALUES (?, ?, ?, 'delete', ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .bind(
        id,
        existing.employee_id,
        existing.employee_nickname,
        existing.record_date,
        existing.record_type,
        existing.reason,
        user.userId,
        user.email,
        user.displayName,
        user.role,
      ),
    database.prepare("DELETE FROM hr_attendance_records WHERE id = ?").bind(id),
  ]);
  await syncAttendanceToPayroll(
    String(existing.employee_id),
    String(existing.record_date).slice(0, 7),
  );
  return { id };
}

export async function getAttendancePayrollImpact(
  employeeId: string,
  requestedMonth: string,
) {
  const database = getD1();
  const bounds = monthBounds(requestedMonth);
  const [countsResult, ruleResult, employeeResult, bonusTierResult] =
    await database.batch([
      database
        .prepare(
      `
    SELECT SUM(CASE WHEN record_type = 'absence' THEN 1 ELSE 0 END) AS absence,
      SUM(CASE WHEN record_type = 'meeting_leave' THEN 1 ELSE 0 END) AS meeting_leave,
      SUM(CASE WHEN record_type = 'late' THEN 1 ELSE 0 END) AS late
    FROM hr_attendance_records WHERE employee_id = ? AND record_date >= ? AND record_date < ?
  `,
        )
        .bind(employeeId, bounds.start, bounds.next),
      database.prepare(
        `SELECT id, code, name, event_type, trigger_from, action_type, action_value, period, active, built_in
         FROM hr_attendance_rules WHERE active = 1`,
      ),
      database
        .prepare("SELECT start_date FROM hr_employees WHERE id = ?")
        .bind(employeeId),
      database.prepare(
        `SELECT id, min_month, max_month, amount, active
         FROM hr_attendance_bonus_tiers WHERE active = 1 ORDER BY min_month, id`,
      ),
    ]);
  const countsRow = countsResult.results[0];
  const counts = {
    absence: Number(countsRow?.absence ?? 0),
    meetingLeave: Number(countsRow?.meeting_leave ?? 0),
    late: Number(countsRow?.late ?? 0),
  };
  const rules = ruleResult.results.length
    ? ruleResult.results.map(mapRule)
    : defaultRules.map((rule, index) => ({
        id: index,
        code: rule[0],
        name: rule[1],
        eventType: rule[2],
        triggerFrom: rule[3],
        actionType: rule[4],
        actionValue: rule[5],
        period: "monthly",
        active: true,
        builtIn: true,
      }));
  const countFor = (type: string) =>
    type === "absence"
      ? counts.absence
      : type === "meeting_leave"
        ? counts.meetingLeave
        : counts.late;
  const forcedLeaveDays = rules
    .filter((rule) => rule.actionType === "force_leave")
    .reduce((total, rule) => {
      const count = countFor(rule.eventType);
      return (
        total +
        (count >= rule.triggerFrom
          ? (count - rule.triggerFrom + 1) * rule.actionValue
          : 0)
      );
    }, 0);
  const attendanceDeduction = rules
    .filter((rule) => rule.actionType === "deduct_money")
    .reduce((total, rule) => {
      const count = countFor(rule.eventType);
      return (
        total +
        (count >= rule.triggerFrom
          ? (count - rule.triggerFrom + 1) * rule.actionValue
          : 0)
      );
    }, 0);
  const forfeitsBonus = rules
    .filter(
      (rule) =>
        rule.actionType === "lose_bonus" &&
        countFor(rule.eventType) >= rule.triggerFrom,
    )
    .length > 0;
  const bonusTiers = bonusTierResult.results.length
    ? bonusTierResult.results.map(mapBonusTier)
    : defaultBonusTiers;
  const serviceMonth = serviceMonthFor(
    employeeResult.results[0]?.start_date,
    bounds.month,
  );
  const eligibleAttendanceBonus = bonusForServiceMonth(
    bonusTiers,
    serviceMonth,
  );
  const bonusLoss = forfeitsBonus ? eligibleAttendanceBonus : 0;
  const attendanceBonus = forfeitsBonus ? 0 : eligibleAttendanceBonus;
  const plannedWorkingDays = workingDaysInMonth(
    bounds.year,
    bounds.monthNumber,
  );
  return {
    plannedWorkingDays,
    workingDays: Math.max(
      0,
      plannedWorkingDays - counts.absence - forcedLeaveDays,
    ),
    ...counts,
    forcedLeaveDays,
    serviceMonth,
    eligibleAttendanceBonus,
    bonusLoss,
    attendanceBonus,
    attendanceDeduction,
    totalDeduction: attendanceDeduction,
  };
}

export async function syncAttendanceToPayroll(
  employeeId: string,
  payrollMonth: string,
) {
  const database = getD1();
  const payroll = await database
    .prepare(
      `SELECT id, base_salary, other_income, winloss_amount, installment_deduction, warning_deduction, other_deduction FROM hr_payroll_records WHERE employee_id = ? AND payroll_month = ?`,
    )
    .bind(employeeId, payrollMonth)
    .first<Record<string, unknown>>();
  if (!payroll) return;
  const impact = await getAttendancePayrollImpact(employeeId, payrollMonth);
  const netSalary = Math.max(
    0,
    Number(payroll.base_salary ?? 0) +
      Number(payroll.other_income ?? 0) +
      Number(payroll.winloss_amount ?? 0) +
      impact.attendanceBonus -
      Number(payroll.installment_deduction ?? 0) -
      Number(payroll.warning_deduction ?? 0) -
      impact.attendanceDeduction -
      Number(payroll.other_deduction ?? 0),
  );
  await database
    .prepare(
      `UPDATE hr_payroll_records SET working_days = ?, attendance_bonus_loss = ?, attendance_deduction = ?, net_salary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    )
    .bind(
      impact.workingDays,
      impact.attendanceBonus,
      impact.attendanceDeduction,
      netSalary,
      payroll.id,
    )
    .run();
}

export async function saveAttendanceRule(
  user: SystemUser,
  input: Record<string, unknown>,
) {
  if (user.role !== "hr")
    throw new Error("เฉพาะ HR เท่านั้นที่แก้ไขเงื่อนไขได้");
  const database = getD1();
  const id = Number(input.id ?? 0);
  const name = String(input.name ?? "").trim();
  const eventType = String(input.eventType ?? "").trim();
  const actionType = String(input.actionType ?? "").trim();
  const triggerFrom = Math.max(1, Math.round(Number(input.triggerFrom ?? 1)));
  const actionValue =
    actionType === "lose_bonus"
      ? 0
      : Math.max(0, Math.round(Number(input.actionValue ?? 0)));
  const active = input.active === false ? 0 : 1;
  if (!name || !eventType || !actionType)
    throw new Error("กรุณากรอกข้อมูลเงื่อนไขให้ครบ");

  if (id > 0) {
    await database
      .prepare(
        `
      UPDATE hr_attendance_rules SET name = ?, event_type = ?, trigger_from = ?,
        action_type = ?, action_value = ?, active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      )
      .bind(name, eventType, triggerFrom, actionType, actionValue, active, id)
      .run();
    return { id };
  }
  const code = `CUSTOM_${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
  const row = await database
    .prepare(
      `
    INSERT INTO hr_attendance_rules (
      code, name, event_type, trigger_from, action_type, action_value,
      period, active, built_in, created_by_email
    ) VALUES (?, ?, ?, ?, ?, ?, 'monthly', ?, 0, ?)
    RETURNING id
  `,
    )
    .bind(
      code,
      name,
      eventType,
      triggerFrom,
      actionType,
      actionValue,
      active,
      user.email,
    )
    .first<{ id: number }>();
  return { id: Number(row?.id) };
}

export async function saveAttendanceBonusTier(
  user: SystemUser,
  input: Record<string, unknown>,
) {
  if (user.role !== "hr")
    throw new Error("เฉพาะ HR เท่านั้นที่แก้ไขเบี้ยขยันได้");
  const id = Math.max(1, Math.round(Number(input.id ?? 0)));
  const amount = Math.max(0, Math.round(Number(input.amount ?? 0)));
  const active = input.active === false ? 0 : 1;
  if (!Number.isFinite(amount)) throw new Error("จำนวนเงินเบี้ยขยันไม่ถูกต้อง");
  const result = await getD1()
    .prepare(
      `UPDATE hr_attendance_bonus_tiers
       SET amount = ?, active = ?, updated_by_email = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? RETURNING id`,
    )
    .bind(amount, active, user.email, id)
    .first<{ id: number }>();
  if (!result) throw new Error("ไม่พบช่วงอายุงานที่ต้องการแก้ไข");
  return { id, amount, active: Boolean(active) };
}

export async function saveSystemUser(
  user: SystemUser,
  input: Record<string, unknown>,
) {
  if (user.role !== "hr")
    throw new Error("เฉพาะ HR เท่านั้นที่กำหนดสิทธิ์ผู้ใช้ได้");
  const email = String(input.email ?? "")
    .trim()
    .toLowerCase();
  const role = mapRole(input.role);
  const employeeId = String(input.employeeId ?? "").trim() || null;
  if (!email || !email.includes("@"))
    throw new Error("กรุณาระบุอีเมลให้ถูกต้อง");
  if (employeeId) {
    const employee = await getD1()
      .prepare("SELECT id FROM hr_employees WHERE id = ?")
      .bind(employeeId)
      .first();
    if (!employee) throw new Error("ไม่พบพนักงานที่เลือก");
  }
  await getD1()
    .prepare(
      `
    INSERT INTO hr_system_users (email, user_id, display_name, role, employee_id)
    VALUES (?, '', ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET role = excluded.role,
      employee_id = excluded.employee_id, updated_at = CURRENT_TIMESTAMP
  `,
    )
    .bind(email, email, role, employeeId)
    .run();
  return { email, role, employeeId };
}
