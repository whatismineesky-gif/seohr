import { syncAttendanceToPayroll, type SystemUser } from "./attendance";
import { getD1 } from "./index";

type ReviewStatus = "complete" | "incomplete" | "none";
const workStatuses = ["working", "absence", "meeting_leave", "admin", "true"] as const;

async function workStatusConfig() {
  const row = await getD1().prepare("SELECT included_statuses, updated_by_email, updated_at FROM hr_daily_work_status_config WHERE id = 1")
    .first<{ included_statuses: string; updated_by_email: string; updated_at: string }>();
  const statuses = row ? JSON.parse(row.included_statuses) as string[] : ["working", "meeting_leave"];
  return { includedStatuses: statuses.filter((status) => (workStatuses as readonly string[]).includes(status)),
    updatedBy: row?.updated_by_email ?? "", updatedAt: row?.updated_at ?? "" };
}

export async function saveWorkStatusConfig(user: SystemUser, input: Record<string, unknown>) {
  if (user.role !== "hr") throw new Error("เฉพาะ HR เท่านั้นที่ตั้งค่าสถานะตรวจงานได้");
  if (!Array.isArray(input.includedStatuses) || input.includedStatuses.some((status) => typeof status !== "string" || !(workStatuses as readonly string[]).includes(status)))
    throw new Error("สถานะที่เลือกไม่ถูกต้อง");
  const statuses = [...new Set(input.includedStatuses as string[])];
  await getD1().prepare(`INSERT INTO hr_daily_work_status_config (id, included_statuses, updated_by_email) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET included_statuses = excluded.included_statuses,
    updated_by_email = excluded.updated_by_email, updated_at = CURRENT_TIMESTAMP`)
    .bind(JSON.stringify(statuses), user.email).run();
  return { includedStatuses: statuses };
}

async function runBatches(statements: ReturnType<ReturnType<typeof getD1>["prepare"]>[]) {
  const database = getD1();
  for (let index = 0; index < statements.length; index += 50) {
    await database.batch(statements.slice(index, index + 50));
  }
}

function validDate(value: unknown) {
  const date = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("กรุณาระบุวันที่ให้ถูกต้อง");
  return date;
}

function normalizedPosition(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-–—./()]+/g, "");
}

function statusFor(submitted: number, target: number): ReviewStatus {
  if (submitted <= 0) return "none";
  if (submitted < target) return "incomplete";
  return "complete";
}

function defaultReason(status: ReviewStatus, target: number, submitted: number) {
  if (status === "none") return "ไม่ส่งงาน";
  if (status === "incomplete")
    return `ส่งงานไม่ครบ — เว็บไม่เสร็จ ${Math.max(0, target - submitted)} เว็บ`;
  return "";
}

async function employeeTargetsFor(reviewDate: string) {
  const result = await getD1().prepare(
    `SELECT t.employee_id, t.target_per_day FROM hr_employee_daily_work_targets t
     WHERE t.effective_date = (
       SELECT MAX(latest.effective_date) FROM hr_employee_daily_work_targets latest
       WHERE latest.employee_id = t.employee_id AND latest.effective_date <= ?
     )`,
  ).bind(reviewDate).all<{ employee_id: string; target_per_day: number | null }>();
  return new Map(result.results.map((row) => [row.employee_id, row.target_per_day]));
}

async function scopedEmployees(user: SystemUser, reviewDate: string) {
  const database = getD1();
  const { includedStatuses } = await workStatusConfig();
  const recordStatuses = includedStatuses.filter((status) => status !== "working");
  let scopeSql = "";
  const bindings: unknown[] = [reviewDate, reviewDate, includedStatuses.includes("working") ? 1 : 0, reviewDate, reviewDate, ...recordStatuses];
  if (user.role === "employee") {
    const viewer = user.employeeId
      ? await database
          .prepare("SELECT team, position FROM hr_employees WHERE id = ?")
          .bind(user.employeeId)
          .first<Record<string, unknown>>()
      : null;
    const canViewTeam =
      Boolean(viewer?.team) &&
      new Set(["head", "seniorstaff"]).has(
        normalizedPosition(viewer?.position),
      );
    if (canViewTeam) {
      scopeSql = " AND team = ?";
      bindings.push(String(viewer?.team ?? ""));
    } else {
      scopeSql = " AND id = ?";
      bindings.push(user.employeeId ?? "");
    }
  }
  const result = await database
    .prepare(
      `SELECT id, nickname, team, position
       FROM hr_employees e
       WHERE (start_date = '' OR
         CASE WHEN start_date GLOB '??/??/????'
           THEN substr(start_date, 7, 4) || '-' || substr(start_date, 4, 2) || '-' || substr(start_date, 1, 2)
           ELSE start_date END <= ?)
       AND (status <> 'ลาออก' OR end_date = '' OR
         CASE WHEN end_date GLOB '??/??/????'
           THEN substr(end_date, 7, 4) || '-' || substr(end_date, 4, 2) || '-' || substr(end_date, 1, 2)
           ELSE end_date END >= ?)
       AND LOWER(REPLACE(REPLACE(TRIM(position), '-', ''), ' ', '')) NOT IN ('parttime', 'freelancer')
       AND LOWER(REPLACE(REPLACE(TRIM(employment), '-', ''), ' ', '')) NOT IN ('parttime', 'freelancer')
       AND ((? = 1 AND NOT EXISTS (
         SELECT 1 FROM hr_attendance_records attendance
         WHERE attendance.employee_id = e.id
           AND attendance.record_date = ?
           AND attendance.record_type IN ('absence', 'meeting_leave', 'admin', 'true')
           AND attendance.source_type <> 'work_audit'
       )) OR EXISTS (
         SELECT 1 FROM hr_attendance_records attendance
         WHERE attendance.employee_id = e.id AND attendance.record_date = ?
           AND attendance.source_type <> 'work_audit'
           AND attendance.record_type IN (${recordStatuses.map(() => "?").join(", ") || "NULL"})
       ))
       ${scopeSql}
       ORDER BY sequence, id`,
    )
    .bind(...bindings)
    .all<Record<string, unknown>>();
  return result.results
    .map((row) => ({
      id: String(row.id),
      nickname: String(row.nickname ?? ""),
      team: String(row.team ?? ""),
      position: String(row.position ?? ""),
    }))
    .sort((left, right) => {
      const teamComparison = left.team.localeCompare(right.team, "th", {
        numeric: true,
        sensitivity: "base",
      });
      if (teamComparison !== 0) return teamComparison;
      return left.nickname.localeCompare(right.nickname, "th", {
        numeric: true,
        sensitivity: "base",
      });
    });
}

export async function getWorkAuditData(
  user: SystemUser,
  dateValue: unknown,
  summaryOnly = false,
) {
  const reviewDate = validDate(dateValue);
  const month = reviewDate.slice(0, 7);
  const database = getD1();
  const employees = await scopedEmployees(user, reviewDate);
  const employeeIds = new Set(employees.map((employee) => employee.id));
  const [targetResult, reviewResult, configResult, submissionResult] = await database.batch<Record<string, unknown>>([
    database
      .prepare(
        "SELECT month, target_per_day, updated_by_email, updated_at FROM hr_daily_work_targets WHERE month = ?",
      )
      .bind(month),
    database
      .prepare(
        `SELECT id, employee_id, target_count, submitted_count, result_status,
          reason, attendance_record_id, reviewed_by_name, reviewed_by_email,
          created_at, updated_at
         FROM hr_daily_work_reviews WHERE review_date = ?`,
      )
      .bind(reviewDate),
    database.prepare(
      `SELECT month, target_per_day, updated_by_email, updated_at
       FROM hr_daily_work_targets ORDER BY month DESC LIMIT 24`,
    ),
    database.prepare(`SELECT employee_id, COUNT(*) AS submitted_count
      FROM hr_work_submissions WHERE work_date = ? GROUP BY employee_id`).bind(reviewDate),
  ]);
  const targetRow = targetResult.results[0];
  const configuredTarget = Number(targetRow?.target_per_day ?? 0);
  const employeeTargets = await employeeTargetsFor(reviewDate);
  const reviewMap = new Map(
    reviewResult.results
      .filter((row) => employeeIds.has(String(row.employee_id)))
      .map((row) => [String(row.employee_id), row]),
  );
  const submissionCounts = new Map(submissionResult.results.map((row) =>
    [String(row.employee_id), Number(row.submitted_count)]));
  const rows = employees.map((employee) => {
    const review = reviewMap.get(employee.id);
    const savedTarget = Number(review?.target_count ?? employeeTargets.get(employee.id) ?? configuredTarget);
    const targetCount = !summaryOnly && employeeTargets.has(employee.id)
      ? Number(employeeTargets.get(employee.id) ?? configuredTarget) : savedTarget;
    const targetPending = Boolean(review && targetCount !== savedTarget);
    const systemSubmittedCount = submissionCounts.get(employee.id) ?? 0;
    const submittedCount = Number(review?.submitted_count ?? systemSubmittedCount);
    const resultStatus = String(
      targetPending ? statusFor(submittedCount, targetCount) : review?.result_status ?? statusFor(submittedCount, targetCount),
    ) as ReviewStatus;
    return {
      ...employee,
      reviewId: review ? Number(review.id) : null,
      reviewed: Boolean(review),
      targetCount,
      targetPending,
      submittedCount,
      systemSubmittedCount,
      missingCount: Math.max(0, targetCount - submittedCount),
      resultStatus,
      reason: targetPending
        ? resultStatus === "complete" ? ""
          : String(review?.reason ?? "") && String(review?.reason) !== defaultReason(String(review?.result_status) as ReviewStatus, savedTarget, submittedCount)
            ? String(review?.reason) : defaultReason(resultStatus, targetCount, submittedCount)
        : String(review?.reason ?? defaultReason(resultStatus, targetCount, submittedCount)),
      attendanceRecordId: review?.attendance_record_id
        ? Number(review.attendance_record_id)
        : null,
      reviewedBy: String(review?.reviewed_by_name ?? review?.reviewed_by_email ?? ""),
      updatedAt: String(review?.updated_at ?? ""),
    };
  });
  const summary = {
    total: rows.length,
    complete: rows.filter((row) => row.reviewed && row.resultStatus === "complete").length,
    incomplete: rows.filter((row) => row.reviewed && row.resultStatus === "incomplete").length,
    none: rows.filter((row) => row.reviewed && row.resultStatus === "none").length,
    unreviewed: rows.filter((row) => !row.reviewed).length,
  };
  let history: Array<Record<string, unknown>> = [];
  let targetEmployees: Array<{ id: string; nickname: string; team: string }> = [];
  let employeeTargetConfigs: Array<Record<string, unknown>> = [];
  let employeeTargetHistory: Array<Record<string, unknown>> = [];
  if (!summaryOnly && user.role === "hr") {
    const [employeeResult, targetConfigs, targetLogs] = await database.batch<Record<string, unknown>>([
      database.prepare("SELECT id, nickname, team FROM hr_employees WHERE status <> 'ลาออก' ORDER BY team, nickname"),
      database.prepare(`SELECT t.*, e.nickname, e.team FROM hr_employee_daily_work_targets t
        JOIN hr_employees e ON e.id = t.employee_id ORDER BY t.effective_date DESC, e.team, e.nickname`),
      database.prepare(`SELECT l.*, e.nickname FROM hr_employee_daily_work_target_logs l
        JOIN hr_employees e ON e.id = l.employee_id ORDER BY l.id DESC LIMIT 100`),
    ]);
    targetEmployees = employeeResult.results.map((row) => ({ id: String(row.id), nickname: String(row.nickname), team: String(row.team) }));
    employeeTargetConfigs = targetConfigs.results.map((row) => ({
      employeeId: String(row.employee_id), nickname: String(row.nickname), team: String(row.team),
      effectiveDate: String(row.effective_date), targetPerDay: row.target_per_day === null ? null : Number(row.target_per_day),
      updatedBy: String(row.updated_by_email), updatedAt: String(row.updated_at),
    }));
    employeeTargetHistory = targetLogs.results.map((row) => ({
      id: Number(row.id), employeeId: String(row.employee_id), nickname: String(row.nickname),
      effectiveDate: String(row.effective_date), previousTarget: row.previous_target === null ? null : Number(row.previous_target),
      newTarget: row.new_target === null ? null : Number(row.new_target),
      actorName: String(row.actor_name || row.actor_email), createdAt: String(row.created_at),
    }));
  }
  if (!summaryOnly && (user.role === "hr" || user.role === "audit")) {
    const historyResult = await database
      .prepare(
        `SELECT l.*, e.nickname, e.team
         FROM hr_daily_work_review_logs l
         JOIN hr_employees e ON e.id = l.employee_id
         WHERE l.review_date = ? ORDER BY l.created_at DESC, l.id DESC LIMIT 200`,
      )
      .bind(reviewDate)
      .all<Record<string, unknown>>();
    history = historyResult.results.map((row) => ({
      id: Number(row.id),
      reviewId: Number(row.review_id),
      employeeId: String(row.employee_id),
      nickname: String(row.nickname ?? ""),
      team: String(row.team ?? ""),
      previousStatus: row.previous_status ? String(row.previous_status) : null,
      previousSubmittedCount:
        row.previous_submitted_count === null
          ? null
          : Number(row.previous_submitted_count),
      previousReason: String(row.previous_reason ?? ""),
      previousTargetCount: row.previous_target_count == null ? null : Number(row.previous_target_count),
      newTargetCount: row.new_target_count == null ? null : Number(row.new_target_count),
      newStatus: String(row.new_status),
      newSubmittedCount: Number(row.new_submitted_count),
      newReason: String(row.new_reason ?? ""),
      changeReason: String(row.change_reason ?? ""),
      actorName: String(row.actor_display_name ?? row.actor_email ?? ""),
      createdAt: String(row.created_at),
    }));
  }
  return {
    reviewDate,
    canReview: user.role === "hr" || user.role === "audit",
    canConfigure: user.role === "hr",
    config: targetRow
      ? {
          month: String(targetRow.month),
          targetPerDay: configuredTarget,
          updatedBy: String(targetRow.updated_by_email ?? ""),
          updatedAt: String(targetRow.updated_at ?? ""),
        }
      : null,
    configs: summaryOnly
      ? []
      : configResult.results.map((row) => ({
          month: String(row.month),
          targetPerDay: Number(row.target_per_day),
          updatedBy: String(row.updated_by_email ?? ""),
          updatedAt: String(row.updated_at ?? ""),
        })),
    summary,
    dayConfirmed: rows.length > 0 && summary.unreviewed === 0,
    rows: summaryOnly
      ? rows.filter(
          (row) =>
            row.reviewed &&
            (row.resultStatus === "incomplete" || row.resultStatus === "none"),
        )
      : rows,
    history,
    targetEmployees,
    employeeTargetConfigs,
    employeeTargetHistory,
    statusConfig: await workStatusConfig(),
  };
}

export async function saveWorkTarget(
  user: SystemUser,
  input: Record<string, unknown>,
) {
  if (user.role !== "hr")
    throw new Error("เฉพาะ HR เท่านั้นที่แก้ไขเป้าหมายส่งงานได้");
  const month = String(input.month ?? "").trim();
  const targetPerDay = Math.max(1, Math.round(Number(input.targetPerDay ?? 0)));
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("กรุณาระบุเดือนให้ถูกต้อง");
  if (!Number.isFinite(targetPerDay) || targetPerDay < 1)
    throw new Error("เป้าหมายต่อวันต้องอย่างน้อย 1 เว็บ");
  await getD1()
    .prepare(
      `INSERT INTO hr_daily_work_targets (month, target_per_day, updated_by_email)
       VALUES (?, ?, ?)
       ON CONFLICT(month) DO UPDATE SET target_per_day = excluded.target_per_day,
         updated_by_email = excluded.updated_by_email, updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(month, targetPerDay, user.email)
    .run();
  return { month, targetPerDay };
}

export async function saveEmployeeWorkTarget(user: SystemUser, input: Record<string, unknown>) {
  if (user.role !== "hr") throw new Error("เฉพาะ HR เท่านั้นที่แก้ไขเป้าหมายส่งงานได้");
  const employeeId = String(input.employeeId ?? "").trim();
  const effectiveDate = validDate(input.effectiveDate);
  const parsedDate = new Date(`${effectiveDate}T00:00:00Z`);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== effectiveDate)
    throw new Error("กรุณาระบุวันที่เริ่มใช้ให้ถูกต้อง");
  const targetPerDay = input.targetPerDay === null ? null : Number(input.targetPerDay);
  if (targetPerDay !== null && (!Number.isSafeInteger(targetPerDay) || targetPerDay < 1))
    throw new Error("เป้าหมายเฉพาะต้องเป็นจำนวนเต็มอย่างน้อย 1 เว็บ");
  const database = getD1();
  const employee = await database.prepare("SELECT id FROM hr_employees WHERE id = ?").bind(employeeId).first();
  if (!employee) throw new Error("ไม่พบพนักงานที่เลือก");
  // Log the effective value before replacing this date's setting. A null target
  // is a dated return to the shared monthly target, preserving earlier dates.
  await database.batch([
    database.prepare(`INSERT INTO hr_employee_daily_work_target_logs
      (employee_id, effective_date, previous_target, new_target, actor_email, actor_name)
      VALUES (?, ?, (SELECT target_per_day FROM hr_employee_daily_work_targets
        WHERE employee_id = ? AND effective_date <= ? ORDER BY effective_date DESC LIMIT 1), ?, ?, ?)`)
      .bind(employeeId, effectiveDate, employeeId, effectiveDate, targetPerDay, user.email, user.displayName),
    database.prepare(`INSERT INTO hr_employee_daily_work_targets
      (employee_id, effective_date, target_per_day, updated_by_email) VALUES (?, ?, ?, ?)
      ON CONFLICT(employee_id, effective_date) DO UPDATE SET
      target_per_day = excluded.target_per_day, updated_by_email = excluded.updated_by_email,
      updated_at = CURRENT_TIMESTAMP`).bind(employeeId, effectiveDate, targetPerDay, user.email),
  ]);
  const affected = await database.prepare(
    "SELECT * FROM hr_daily_work_reviews WHERE employee_id = ? AND review_date >= ? ORDER BY review_date",
  ).bind(employeeId, effectiveDate).all<Record<string, unknown>>();
  for (const review of affected.results) {
    const automaticReason = defaultReason(String(review.result_status) as ReviewStatus, Number(review.target_count), Number(review.submitted_count));
    await confirmDailyWork(user, {
      reviewDate: String(review.review_date),
      rows: [{ employeeId, submittedCount: Number(review.submitted_count),
        reason: String(review.reason ?? "") === automaticReason ? "" : String(review.reason ?? ""),
        changeReason: "ปรับเป้าหมายตาม Config เฉพาะพนักงาน" }],
    }, employeeId);
  }
  return { employeeId, effectiveDate, targetPerDay };
}

export async function confirmDailyWork(
  user: SystemUser,
  input: Record<string, unknown>,
  onlyEmployeeId?: string,
) {
  if (user.role !== "hr" && user.role !== "audit")
    throw new Error("เฉพาะ HR หรือ Audit เท่านั้นที่ตรวจส่งงานได้");
  const reviewDate = validDate(input.reviewDate);
  const database = getD1();
  const targetRow = await database
    .prepare("SELECT target_per_day FROM hr_daily_work_targets WHERE month = ?")
    .bind(reviewDate.slice(0, 7))
    .first<Record<string, unknown>>();
  const configuredTarget = Number(targetRow?.target_per_day ?? 0);
  const employeeTargets = await employeeTargetsFor(reviewDate);
  if (configuredTarget < 1)
    throw new Error("ยังไม่ได้ตั้งค่าเป้าหมายส่งงานของเดือนนี้");
  const employees = (await scopedEmployees(user, reviewDate)).filter((employee) => !onlyEmployeeId || employee.id === onlyEmployeeId);
  const inputRows = Array.isArray(input.rows)
    ? (input.rows as Array<Record<string, unknown>>)
    : [];
  const inputMap = new Map(
    inputRows.map((row) => [String(row.employeeId ?? ""), row]),
  );
  const existingResult = await database
    .prepare("SELECT * FROM hr_daily_work_reviews WHERE review_date = ?")
    .bind(reviewDate)
    .all<Record<string, unknown>>();
  const existingMap = new Map(
    existingResult.results.map((row) => [String(row.employee_id), row]),
  );
  const submissionResult = await database.prepare(`SELECT employee_id, COUNT(*) AS submitted_count
    FROM hr_work_submissions WHERE work_date = ? GROUP BY employee_id`).bind(reviewDate)
    .all<Record<string, unknown>>();
  const submissionCounts = new Map(submissionResult.results.map((row) =>
    [String(row.employee_id), Number(row.submitted_count)]));
  const changes: Array<{
    employeeId: string;
    targetCount: number;
    submittedCount: number;
    resultStatus: ReviewStatus;
    reason: string;
    changeReason: string;
    previous: Record<string, unknown> | undefined;
  }> = [];
  for (const employee of employees) {
    const previous = existingMap.get(employee.id);
    const row = inputMap.get(employee.id);
    const targetCount = employeeTargets.has(employee.id)
      ? employeeTargets.get(employee.id) ?? configuredTarget
      : previous ? Number(previous.target_count) : configuredTarget;
    const targetChanged = Boolean(previous && Number(previous.target_count) !== targetCount);
    const submittedCount = Math.max(
      0,
      Math.round(Number(row?.submittedCount ?? previous?.submitted_count ?? submissionCounts.get(employee.id) ?? 0)),
    );
    const resultStatus = statusFor(submittedCount, targetCount);
    const reason =
      resultStatus === "complete"
        ? ""
        : String(row?.reason ?? previous?.reason ?? "").trim() ||
          defaultReason(resultStatus, targetCount, submittedCount);
    const changeReason = String(row?.changeReason ?? "").trim() ||
      (targetChanged && Number(previous?.submitted_count) === submittedCount ? "ปรับเป้าหมายตาม Config เฉพาะพนักงาน" : "");
    const changed =
      !previous ||
      targetChanged ||
      Number(previous.submitted_count) !== submittedCount ||
      String(previous.result_status) !== resultStatus ||
      String(previous.reason ?? "") !== reason;
    if (!changed) continue;
    if (previous && !changeReason)
      throw new Error(`กรุณาระบุเหตุผลการแก้ไขของ ${employee.nickname}`);
    changes.push({
      employeeId: employee.id,
      targetCount,
      submittedCount,
      resultStatus,
      reason,
      changeReason,
      previous,
    });
  }
  if (!changes.length) return { changed: 0 };

  const reviewStatements = changes.flatMap((change) => [
    database
      .prepare(
        `INSERT INTO hr_daily_work_reviews (
          employee_id, review_date, target_count, submitted_count, result_status,
          reason, reviewed_by_user_id, reviewed_by_email, reviewed_by_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(employee_id, review_date) DO UPDATE SET
          target_count = excluded.target_count,
          submitted_count = excluded.submitted_count,
          result_status = excluded.result_status,
          reason = excluded.reason,
          reviewed_by_user_id = excluded.reviewed_by_user_id,
          reviewed_by_email = excluded.reviewed_by_email,
          reviewed_by_name = excluded.reviewed_by_name,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        change.employeeId,
        reviewDate,
        change.targetCount,
        change.submittedCount,
        change.resultStatus,
        change.reason,
        user.userId,
        user.email,
        user.displayName,
      ),
    database
      .prepare(
        `INSERT INTO hr_daily_work_review_logs (
          review_id, employee_id, review_date, previous_status,
          previous_submitted_count, previous_reason, new_status,
          new_submitted_count, new_reason, change_reason,
          actor_user_id, actor_email, actor_display_name
          , previous_target_count, new_target_count
        ) SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          FROM hr_daily_work_reviews WHERE employee_id = ? AND review_date = ?`,
      )
      .bind(
        change.employeeId,
        reviewDate,
        change.previous?.result_status ?? null,
        change.previous?.submitted_count ?? null,
        change.previous?.reason ?? null,
        change.resultStatus,
        change.submittedCount,
        change.reason,
        change.changeReason,
        user.userId,
        user.email,
        user.displayName,
        change.previous?.target_count ?? null,
        change.targetCount,
        change.employeeId,
        reviewDate,
      ),
  ]);
  await runBatches(reviewStatements);

  const changedReviews = await database
    .prepare("SELECT id, employee_id, result_status, reason FROM hr_daily_work_reviews WHERE review_date = ?")
    .bind(reviewDate)
    .all<Record<string, unknown>>();
  const changedIds = new Set(changes.map((change) => change.employeeId));
  const attendanceStatements = changedReviews.results
    .filter((review) => changedIds.has(String(review.employee_id)))
    .flatMap((review) => {
      const reviewId = Number(review.id);
      if (String(review.result_status) === "complete") {
        return [
          database
            .prepare(
              "DELETE FROM hr_attendance_records WHERE source_type = 'work_audit' AND source_id = ?",
            )
            .bind(reviewId),
          database
            .prepare(
              "UPDATE hr_daily_work_reviews SET attendance_record_id = NULL WHERE id = ?",
            )
            .bind(reviewId),
        ];
      }
      const attendanceReason = `ตรวจส่งงาน: ${String(review.reason ?? "ส่งงานไม่ครบ")}`;
      return [
        database
          .prepare(
            `UPDATE hr_attendance_records SET reason = ?, recorder_user_id = ?,
              recorder_email = ?, recorder_role = ?, updated_at = CURRENT_TIMESTAMP
             WHERE source_type = 'work_audit' AND source_id = ?`,
          )
          .bind(attendanceReason, user.userId, user.email, user.role, reviewId),
        database
          .prepare(
            `INSERT OR IGNORE INTO hr_attendance_records (
              employee_id, record_date, record_type, reason, recorder_user_id,
              recorder_email, recorder_role, source_type, source_id
            ) VALUES (?, ?, 'absence', ?, ?, ?, ?, 'work_audit', ?)`,
          )
          .bind(
            review.employee_id,
            reviewDate,
            attendanceReason,
            user.userId,
            user.email,
            user.role,
            reviewId,
          ),
        database
          .prepare(
            `UPDATE hr_daily_work_reviews SET attendance_record_id = (
              SELECT id FROM hr_attendance_records
              WHERE source_type = 'work_audit' AND source_id = ? LIMIT 1
            ) WHERE id = ?`,
          )
          .bind(reviewId, reviewId),
      ];
    });
  if (attendanceStatements.length) await runBatches(attendanceStatements);
  const payrollImpactIds = new Set(
    changes
      .filter(
        (change) =>
          change.resultStatus !== "complete" ||
          (change.previous && String(change.previous.result_status) !== "complete"),
      )
      .map((change) => change.employeeId),
  );
  await Promise.all(
    [...payrollImpactIds].map((employeeId) =>
      syncAttendanceToPayroll(employeeId, reviewDate.slice(0, 7)),
    ),
  );
  return { changed: changes.length };
}
