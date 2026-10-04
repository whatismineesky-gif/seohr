import { getD1 } from "./index";
import { syncAttendanceToPayroll, type SystemUser } from "./attendance";

type CheckinConfig = {
  systemEnabled: boolean;
  otherMeetingStart: string;
  staffMeetingStart: string;
  meetingLateAfter: string;
  meetingAnswersOpen: boolean;
  workEndStart: string;
  workEndDeadline: string;
};

const defaultConfig: CheckinConfig = {
  systemEnabled: false,
  otherMeetingStart: "12:00",
  staffMeetingStart: "13:00",
  meetingLateAfter: "13:05",
  meetingAnswersOpen: true,
  workEndStart: "00:00",
  workEndDeadline: "06:00",
};

function bangkokNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const currentDate = `${value("year")}-${value("month")}-${value("day")}`;
  const currentTime = `${value("hour")}:${value("minute")}`;
  return {
    date: currentDate,
    time: currentTime,
    minutes: timeToMinutes(currentTime),
    iso: date.toISOString(),
  };
}

function previousDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function validTime(value: unknown) {
  const text = String(value ?? "").trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text))
    throw new Error("กรุณาระบุเวลาให้ถูกต้องในรูปแบบ HH:mm");
  return text;
}

function mapConfig(row?: Record<string, unknown> | null): CheckinConfig {
  if (!row) return defaultConfig;
  return {
    systemEnabled: Boolean(row.system_enabled),
    otherMeetingStart: String(row.other_meeting_start ?? defaultConfig.otherMeetingStart),
    staffMeetingStart: String(row.staff_meeting_start ?? defaultConfig.staffMeetingStart),
    meetingLateAfter: String(row.meeting_late_after ?? defaultConfig.meetingLateAfter),
    meetingAnswersOpen: Boolean(row.meeting_answers_open),
    workEndStart: String(row.work_end_start ?? defaultConfig.workEndStart),
    workEndDeadline: String(row.work_end_deadline ?? defaultConfig.workEndDeadline),
  };
}

function mapSession(row?: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    id: Number(row.id),
    employeeId: String(row.employee_id),
    workDate: String(row.work_date),
    meetingStartedAt: row.meeting_started_at ? String(row.meeting_started_at) : null,
    meetingLate: Boolean(row.meeting_late),
    meetingEndedAt: row.meeting_ended_at ? String(row.meeting_ended_at) : null,
    meetingAnswer: String(row.meeting_answer ?? ""),
    workEndedAt: row.work_ended_at ? String(row.work_ended_at) : null,
  };
}

async function getConfig() {
  const database = getD1();
  await database.prepare(`
    INSERT OR IGNORE INTO hr_checkin_config (
      id, system_enabled, other_meeting_start, staff_meeting_start, meeting_late_after,
      meeting_answers_open, work_end_start, work_end_deadline
    ) VALUES (1, 0, '12:00', '13:00', '13:05', 1, '00:00', '06:00')
  `).run();
  return mapConfig(
    await database
      .prepare("SELECT * FROM hr_checkin_config WHERE id = 1")
      .first<Record<string, unknown>>(),
  );
}

async function employeeFor(user: SystemUser) {
  if (!user.employeeId)
    throw new Error("บัญชีของคุณยังไม่ได้เชื่อมกับข้อมูลพนักงาน");
  const employee = await getD1()
    .prepare("SELECT id, nickname, team, position, status FROM hr_employees WHERE id = ?")
    .bind(user.employeeId)
    .first<Record<string, unknown>>();
  if (!employee) throw new Error("ไม่พบข้อมูลพนักงานที่เชื่อมกับบัญชีนี้");
  return {
    id: String(employee.id),
    nickname: String(employee.nickname ?? ""),
    team: String(employee.team ?? ""),
    position: String(employee.position ?? ""),
    status: String(employee.status ?? ""),
  };
}

async function sessionFor(employeeId: string, workDate: string) {
  return mapSession(
    await getD1()
      .prepare("SELECT * FROM hr_employee_checkins WHERE employee_id = ? AND work_date = ?")
      .bind(employeeId, workDate)
      .first<Record<string, unknown>>(),
  );
}

async function ensureSession(user: SystemUser, employeeId: string, workDate: string) {
  const database = getD1();
  await database.prepare(`
    INSERT OR IGNORE INTO hr_employee_checkins (
      employee_id, work_date, created_by_user_id, created_by_email
    ) VALUES (?, ?, ?, ?)
  `).bind(employeeId, workDate, user.userId, user.email).run();
  const session = await sessionFor(employeeId, workDate);
  if (!session) throw new Error("สร้างรายการเช็คชื่อไม่สำเร็จ");
  return session;
}

async function meetingLateExempt(employeeId: string, workDate: string) {
  const record = await getD1().prepare(`SELECT id FROM hr_attendance_records
    WHERE employee_id = ? AND record_date = ? AND record_type IN ('absence', 'meeting_leave') LIMIT 1`)
    .bind(employeeId, workDate).first<{ id: number }>();
  return Boolean(record);
}

async function personalMeetingStart(employeeId: string) {
  const row = await getD1().prepare("SELECT meeting_start FROM hr_employee_checkin_overrides WHERE employee_id = ?")
    .bind(employeeId).first<{meeting_start:string}>();
  return row?.meeting_start ?? null;
}

export async function saveEarlyCheckin(user: SystemUser, input: Record<string, unknown>) {
  if (user.role !== "hr") throw new Error("เฉพาะ HR เท่านั้นที่กำหนดเวลาเช็คชื่อรายบุคคลได้");
  const employeeId = typeof input.employeeId === "string" ? input.employeeId.trim() : "";
  if (!employeeId || typeof input.enabled !== "boolean") throw new Error("กรุณาเลือกพนักงานและรูปแบบเวลาเช็คชื่อให้ถูกต้อง");
  const db = getD1();
  const employee = await db.prepare("SELECT id FROM hr_employees WHERE id = ?").bind(employeeId).first();
  if (!employee) throw new Error("ไม่พบพนักงาน");
  if (input.enabled) {
    await db.prepare(`INSERT INTO hr_employee_checkin_overrides(employee_id,meeting_start,updated_by_email)
      VALUES(?,'12:00',?) ON CONFLICT(employee_id) DO UPDATE SET meeting_start='12:00',updated_by_email=excluded.updated_by_email,updated_at=CURRENT_TIMESTAMP`)
      .bind(employeeId,user.email).run();
  } else {
    await db.prepare("DELETE FROM hr_employee_checkin_overrides WHERE employee_id = ?").bind(employeeId).run();
  }
  return {ok:true};
}

export async function getCheckinData(user: SystemUser, clock = () => new Date()) {
  const config = await getConfig();
  const now = bangkokNow(clock());
  let employee = null;
  let todaySession = null;
  let checkoutSession = null;
  let history: ReturnType<typeof mapSession>[] = [];

  if (user.employeeId) {
    employee = await employeeFor(user);
    const checkoutWorkDate = previousDate(now.date);
    const database = getD1();
    const [todayRow, checkoutRow, historyResult] = await database.batch<Record<string, unknown>>([
      database.prepare("SELECT * FROM hr_employee_checkins WHERE employee_id = ? AND work_date = ?").bind(employee.id, now.date),
      database.prepare("SELECT * FROM hr_employee_checkins WHERE employee_id = ? AND work_date = ?").bind(employee.id, checkoutWorkDate),
      database.prepare(`
        SELECT * FROM hr_employee_checkins
        WHERE employee_id = ? ORDER BY work_date DESC LIMIT 31
      `).bind(employee.id),
    ]);
    todaySession = mapSession(historyResult.results.find((row) => String(row.work_date) === now.date) ?? todayRow.results[0]);
    checkoutSession = mapSession(historyResult.results.find((row) => String(row.work_date) === checkoutWorkDate) ?? checkoutRow.results[0]);
    history = historyResult.results.map(mapSession);
  }

  const lateExempt = employee ? await meetingLateExempt(employee.id, now.date) : false;
  const isStaff = employee?.position.trim().toLowerCase() === "staff";
  const personalStart = employee ? await personalMeetingStart(employee.id) : null;
  const meetingStart = personalStart ?? (isStaff ? config.staffMeetingStart : config.otherMeetingStart);
  const checkoutWorkDate = previousDate(now.date);
  const workEndAvailable =
    now.minutes >= timeToMinutes(config.workEndStart) &&
    now.minutes <= timeToMinutes(config.workEndDeadline);

  const resetSummary = user.role === "hr" ? await getD1().prepare(`
    SELECT
      (SELECT COUNT(*) FROM hr_checkin_test_archive_20261003) AS removed_checkins,
      (SELECT COUNT(*) FROM hr_checkin_attendance_archive_20261003) AS removed_attendance,
      (SELECT COUNT(*) FROM hr_employee_checkins WHERE work_date = '2026-10-03') AS remaining_checkins,
      (SELECT COUNT(*) FROM hr_attendance_records WHERE source_type = 'checkin' AND record_date = '2026-10-03') AS remaining_attendance
  `).first<Record<string, number>>() : null;

  const earlyCheckinConfig = user.role === "hr" ? {
    employees: (await getD1().prepare("SELECT id,nickname,team,status FROM hr_employees ORDER BY team,nickname,id").all<{id:string;nickname:string;team:string;status:string}>()).results,
    overrides: (await getD1().prepare(`SELECT o.employee_id AS employeeId,e.nickname,e.team,o.meeting_start AS meetingStart,o.updated_by_email AS updatedBy,o.updated_at AS updatedAt
      FROM hr_employee_checkin_overrides o JOIN hr_employees e ON e.id=o.employee_id ORDER BY e.team,e.nickname,e.id`).all()).results,
  } : null;
  return {
    earlyCheckinConfig,
    resetSummary,
    currentUser: {
      displayName: user.displayName,
      role: user.role,
      employeeId: user.employeeId,
    },
    employee,
    serverNow: { date: now.date, time: now.time, iso: now.iso },
    config,
    todaySession,
    checkoutSession,
    checkoutWorkDate,
    history,
    availability: {
      meetingStart,
      personalMeetingStart: Boolean(personalStart),
      meetingCanStart: config.systemEnabled && Boolean(employee) && !todaySession?.meetingStartedAt && now.minutes >= timeToMinutes(meetingStart),
      meetingLateExempt: lateExempt,
      meetingWouldBeLate: !lateExempt && now.minutes > timeToMinutes(config.meetingLateAfter),
      meetingCanEnd: Boolean(
        config.systemEnabled &&
          employee &&
          config.meetingAnswersOpen &&
          todaySession?.meetingStartedAt &&
          !todaySession.meetingEndedAt,
      ),
      workEndAvailable,
      workCanEnd: Boolean(
        config.systemEnabled &&
          employee &&
          workEndAvailable &&
          !checkoutSession?.workEndedAt,
      ),
    },
  };
}

export async function startMeeting(user: SystemUser, clock = () => new Date()) {
  const employee = await employeeFor(user);
  const config = await getConfig();
  if (!config.systemEnabled)
    throw new Error("ระบบเช็คชื่อยังไม่เปิดใช้งาน");
  const now = bangkokNow(clock());
  const isStaff = employee.position.trim().toLowerCase() === "staff";
  const allowedFrom = await personalMeetingStart(employee.id) ?? (isStaff ? config.staffMeetingStart : config.otherMeetingStart);
  if (now.minutes < timeToMinutes(allowedFrom))
    throw new Error(`กดเข้าประชุมได้ตั้งแต่เวลา ${allowedFrom} น.`);
  const session = await ensureSession(user, employee.id, now.date);
  if (session.meetingStartedAt) throw new Error("คุณกดเข้าประชุมวันนี้แล้ว");

  const lateExempt = await meetingLateExempt(employee.id, now.date);
  const late = !lateExempt && now.minutes > timeToMinutes(config.meetingLateAfter);
  const database = getD1();
  await database.prepare(`
    UPDATE hr_employee_checkins
    SET meeting_started_at = ?, meeting_late = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND meeting_started_at IS NULL
  `).bind(now.iso, late ? 1 : 0, session.id).run();

  if (late) {
    await database.prepare(`
      INSERT OR IGNORE INTO hr_attendance_records (
        employee_id, record_date, record_type, reason,
        recorder_user_id, recorder_email, recorder_role, source_type, source_id
      ) VALUES (?, ?, 'late', ?, ?, ?, ?, 'checkin', ?)
    `).bind(
      employee.id,
      now.date,
      `เข้าประชุมหลังเวลา ${config.meetingLateAfter} น.`,
      user.userId,
      user.email,
      user.role,
      session.id,
    ).run();
    await syncAttendanceToPayroll(employee.id, now.date.slice(0, 7));
  }
  return { ok: true, late };
}

export async function endMeeting(user: SystemUser, input: Record<string, unknown>) {
  const employee = await employeeFor(user);
  const config = await getConfig();
  if (!config.systemEnabled)
    throw new Error("ระบบเช็คชื่อยังไม่เปิดใช้งาน");
  if (!config.meetingAnswersOpen)
    throw new Error("ขณะนี้ปิดรับคำตอบหลังประชุม");
  const answer = String(input.answer ?? "").trim();
  if (!answer) throw new Error("กรุณากรอกคำตอบก่อนส่ง");
  if (answer.length > 2000) throw new Error("คำตอบต้องไม่เกิน 2,000 ตัวอักษร");
  const now = bangkokNow();
  const session = await sessionFor(employee.id, now.date);
  if (!session?.meetingStartedAt) throw new Error("กรุณากดเข้าประชุมก่อนส่งคำตอบ");
  if (session.meetingEndedAt) throw new Error("คุณส่งคำตอบวันนี้แล้ว");
  await getD1().prepare(`
    UPDATE hr_employee_checkins
    SET meeting_ended_at = ?, meeting_answer = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND meeting_ended_at IS NULL
  `).bind(now.iso, answer, session.id).run();
  return { ok: true };
}

export async function endWork(user: SystemUser) {
  const employee = await employeeFor(user);
  const config = await getConfig();
  if (!config.systemEnabled)
    throw new Error("ระบบเช็คชื่อยังไม่เปิดใช้งาน");
  const now = bangkokNow();
  const start = timeToMinutes(config.workEndStart);
  const deadline = timeToMinutes(config.workEndDeadline);
  if (now.minutes < start || now.minutes > deadline)
    throw new Error(
      `กดเลิกงานได้เวลา ${config.workEndStart}–${config.workEndDeadline} น. ของวันถัดไป`,
    );
  const workDate = previousDate(now.date);
  const session = await ensureSession(user, employee.id, workDate);
  if (session.workEndedAt) throw new Error("คุณกดเลิกงานสำหรับวันนี้แล้ว");
  await getD1().prepare(`
    UPDATE hr_employee_checkins
    SET work_ended_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND work_ended_at IS NULL
  `).bind(now.iso, session.id).run();
  return { ok: true, workDate };
}

export async function saveCheckinConfig(
  user: SystemUser,
  input: Record<string, unknown>,
) {
  if (user.role !== "hr") throw new Error("เฉพาะ HR เท่านั้นที่แก้ไข Config ได้");
  const otherMeetingStart = validTime(input.otherMeetingStart);
  const staffMeetingStart = validTime(input.staffMeetingStart);
  const meetingLateAfter = validTime(input.meetingLateAfter);
  const workEndStart = validTime(input.workEndStart);
  const workEndDeadline = validTime(input.workEndDeadline);
  if (timeToMinutes(meetingLateAfter) < timeToMinutes(staffMeetingStart))
    throw new Error("เวลาตัดสายต้องไม่ก่อนเวลาเริ่มประชุมของ Staff");
  if (timeToMinutes(workEndDeadline) < timeToMinutes(workEndStart))
    throw new Error("เวลาสิ้นสุดการกดเลิกงานต้องไม่ก่อนเวลาเริ่ม");
  await getD1().prepare(`
    INSERT INTO hr_checkin_config (
      id, system_enabled, other_meeting_start, staff_meeting_start, meeting_late_after,
      meeting_answers_open, work_end_start, work_end_deadline, updated_by_email
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      system_enabled = excluded.system_enabled,
      other_meeting_start = excluded.other_meeting_start,
      staff_meeting_start = excluded.staff_meeting_start,
      meeting_late_after = excluded.meeting_late_after,
      meeting_answers_open = excluded.meeting_answers_open,
      work_end_start = excluded.work_end_start,
      work_end_deadline = excluded.work_end_deadline,
      updated_by_email = excluded.updated_by_email,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    input.systemEnabled ? 1 : 0,
    otherMeetingStart,
    staffMeetingStart,
    meetingLateAfter,
    input.meetingAnswersOpen ? 1 : 0,
    workEndStart,
    workEndDeadline,
    user.email,
  ).run();
  return { ok: true };
}
