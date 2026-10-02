import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const employees = sqliteTable(
  "hr_employees",
  {
    id: text("id").primaryKey(),
    sequence: integer("sequence").notNull(),
    nickname: text("nickname").notNull(),
    team: text("team").notNull(),
    position: text("position").notNull().default("Staff"),
    employment: text("employment").notNull().default("FullTime"),
    fullName: text("full_name").notNull().default(""),
    salary: integer("salary"),
    bankAccount: text("bank_account").notNull().default(""),
    bankName: text("bank_name").notNull().default(""),
    accountName: text("account_name").notNull().default(""),
    startDate: text("start_date").notNull().default(""),
    endDate: text("end_date").notNull().default(""),
    aff: text("aff").notNull().default(""),
    email: text("email").notNull().default(""),
    discordId: text("discord_id").notNull().default(""),
    dynadot: text("dynadot").notNull().default(""),
    referredBy: text("referred_by").notNull().default(""),
    probation: text("probation").notNull().default("ยังไม่ผ่าน"),
    status: text("status").notNull().default("ยังทำงานอยู่"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_employees_team").on(table.team),
    index("idx_employees_status").on(table.status),
  ],
);

export const systemUsers = sqliteTable(
  "hr_system_users",
  {
    email: text("email").primaryKey(),
    userId: text("user_id").notNull().default(""),
    displayName: text("display_name").notNull().default(""),
    role: text("role").notNull().default("employee"),
    employeeId: text("employee_id").references(() => employees.id),
    menuPermissions: text("menu_permissions").notNull().default("[]"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_system_users_employee_id").on(table.employeeId)],
);

export const attendanceRules = sqliteTable(
  "hr_attendance_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    eventType: text("event_type").notNull(),
    triggerFrom: integer("trigger_from").notNull().default(1),
    actionType: text("action_type").notNull(),
    actionValue: integer("action_value").notNull().default(0),
    period: text("period").notNull().default("monthly"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    builtIn: integer("built_in", { mode: "boolean" }).notNull().default(false),
    createdByEmail: text("created_by_email").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_attendance_rules_code").on(table.code),
    index("idx_attendance_rules_event_active").on(
      table.eventType,
      table.active,
    ),
  ],
);

export const attendanceBonusTiers = sqliteTable(
  "hr_attendance_bonus_tiers",
  {
    id: integer("id").primaryKey(),
    minMonth: integer("min_month").notNull(),
    maxMonth: integer("max_month"),
    amount: integer("amount").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    updatedByEmail: text("updated_by_email").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_attendance_bonus_tier_month").on(table.minMonth)],
);

export const attendanceRecords = sqliteTable(
  "hr_attendance_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    recordDate: text("record_date").notNull(),
    recordType: text("record_type").notNull(),
    reason: text("reason").notNull().default(""),
    recorderUserId: text("recorder_user_id").notNull().default(""),
    recorderEmail: text("recorder_email").notNull(),
    recorderRole: text("recorder_role").notNull(),
    sourceType: text("source_type").notNull().default("manual"),
    sourceId: integer("source_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_attendance_unique_event").on(
      table.employeeId,
      table.recordDate,
      table.recordType,
    ),
    index("idx_attendance_employee_date").on(
      table.employeeId,
      table.recordDate,
    ),
    index("idx_attendance_date_type").on(table.recordDate, table.recordType),
    index("idx_attendance_source").on(table.sourceType, table.sourceId),
  ],
);

export const checkinConfig = sqliteTable("hr_checkin_config", {
  id: integer("id").primaryKey(),
  systemEnabled: integer("system_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  otherMeetingStart: text("other_meeting_start").notNull().default("12:00"),
  staffMeetingStart: text("staff_meeting_start").notNull().default("13:00"),
  meetingLateAfter: text("meeting_late_after").notNull().default("13:05"),
  meetingAnswersOpen: integer("meeting_answers_open", { mode: "boolean" })
    .notNull()
    .default(true),
  workEndStart: text("work_end_start").notNull().default("00:00"),
  workEndDeadline: text("work_end_deadline").notNull().default("06:00"),
  updatedByEmail: text("updated_by_email").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const employeeCheckins = sqliteTable(
  "hr_employee_checkins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    workDate: text("work_date").notNull(),
    meetingStartedAt: text("meeting_started_at"),
    meetingLate: integer("meeting_late", { mode: "boolean" })
      .notNull()
      .default(false),
    meetingEndedAt: text("meeting_ended_at"),
    meetingAnswer: text("meeting_answer").notNull().default(""),
    workEndedAt: text("work_ended_at"),
    createdByUserId: text("created_by_user_id").notNull().default(""),
    createdByEmail: text("created_by_email").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_employee_checkin_date").on(
      table.employeeId,
      table.workDate,
    ),
    index("idx_employee_checkin_work_date").on(table.workDate),
  ],
);

export const dailyWorkTargets = sqliteTable("hr_daily_work_targets", {
  month: text("month").primaryKey(),
  targetPerDay: integer("target_per_day").notNull().default(0),
  updatedByEmail: text("updated_by_email").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const dailyWorkReviews = sqliteTable(
  "hr_daily_work_reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: text("employee_id").notNull().references(() => employees.id),
    reviewDate: text("review_date").notNull(),
    targetCount: integer("target_count").notNull().default(0),
    submittedCount: integer("submitted_count").notNull().default(0),
    resultStatus: text("result_status").notNull().default("complete"),
    reason: text("reason").notNull().default(""),
    attendanceRecordId: integer("attendance_record_id"),
    reviewedByUserId: text("reviewed_by_user_id").notNull().default(""),
    reviewedByEmail: text("reviewed_by_email").notNull().default(""),
    reviewedByName: text("reviewed_by_name").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_daily_work_review_employee_date").on(table.employeeId, table.reviewDate),
    index("idx_daily_work_review_date_status").on(table.reviewDate, table.resultStatus),
  ],
);

export const dailyWorkReviewLogs = sqliteTable(
  "hr_daily_work_review_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reviewId: integer("review_id").notNull(),
    employeeId: text("employee_id").notNull().references(() => employees.id),
    reviewDate: text("review_date").notNull(),
    previousStatus: text("previous_status"),
    previousSubmittedCount: integer("previous_submitted_count"),
    previousReason: text("previous_reason"),
    newStatus: text("new_status").notNull(),
    newSubmittedCount: integer("new_submitted_count").notNull(),
    newReason: text("new_reason").notNull().default(""),
    changeReason: text("change_reason").notNull().default(""),
    actorUserId: text("actor_user_id").notNull().default(""),
    actorEmail: text("actor_email").notNull(),
    actorDisplayName: text("actor_display_name").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_daily_work_review_logs_date").on(table.reviewDate, table.createdAt),
    index("idx_daily_work_review_logs_employee").on(table.employeeId, table.createdAt),
  ],
);

export const attendanceAuditLogs = sqliteTable(
  "hr_attendance_audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    attendanceRecordId: integer("attendance_record_id").notNull(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    employeeNickname: text("employee_nickname").notNull().default(""),
    action: text("action").notNull(),
    previousRecordDate: text("previous_record_date").notNull(),
    previousRecordType: text("previous_record_type").notNull(),
    previousReason: text("previous_reason").notNull().default(""),
    newRecordDate: text("new_record_date"),
    newRecordType: text("new_record_type"),
    newReason: text("new_reason"),
    actorUserId: text("actor_user_id").notNull().default(""),
    actorEmail: text("actor_email").notNull(),
    actorDisplayName: text("actor_display_name").notNull().default(""),
    actorRole: text("actor_role").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_attendance_audit_employee_created").on(
      table.employeeId,
      table.createdAt,
    ),
    index("idx_attendance_audit_previous_date").on(table.previousRecordDate),
    index("idx_attendance_audit_new_date").on(table.newRecordDate),
  ],
);

export const payrollSettings = sqliteTable("hr_payroll_settings", {
  id: integer("id").primaryKey().default(1),
  targetWebsites: integer("target_websites").notNull().default(0),
  deductionPerWebsite: integer("deduction_per_website").notNull().default(100),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const employeeAdvances = sqliteTable(
  "hr_employee_advances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    advanceType: text("advance_type").notNull(),
    repaymentType: text("repayment_type").notNull(),
    description: text("description").notNull().default(""),
    totalAmount: integer("total_amount").notNull(),
    monthlyAmount: integer("monthly_amount").notNull(),
    startMonth: text("start_month").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_employee_advances_employee").on(table.employeeId),
    index("idx_employee_advances_status").on(table.status),
  ],
);

export const advanceInstallments = sqliteTable(
  "hr_advance_installments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    advanceId: integer("advance_id")
      .notNull()
      .references(() => employeeAdvances.id),
    dueMonth: text("due_month").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("pending"),
    payrollRecordId: integer("payroll_record_id"),
    processedAt: text("processed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_advance_installments_unique_month").on(
      table.advanceId,
      table.dueMonth,
    ),
    index("idx_advance_installments_due_status").on(
      table.dueMonth,
      table.status,
    ),
  ],
);

export const warningRecords = sqliteTable(
  "hr_warning_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    warningDate: text("warning_date").notNull(),
    subject: text("subject").notNull(),
    amount: integer("amount").notNull().default(0),
    note: text("note").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_warning_employee_date").on(table.employeeId, table.warningDate),
  ],
);

export const warningConfigs = sqliteTable("hr_warning_configs", {
  tenureMonth: integer("tenure_month").primaryKey(),
  midValue: integer("mid_value").notNull(),
  minValue: integer("min_value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const monthlyDepositResults = sqliteTable(
  "hr_monthly_deposit_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    resultMonth: text("result_month").notNull(),
    tenureMonth: integer("tenure_month").notNull(),
    depositCount: integer("deposit_count").notNull().default(0),
    midValue: integer("mid_value").notNull(),
    minValue: integer("min_value").notNull(),
    resultType: text("result_type").notNull(),
    tenureQuarter: integer("tenure_quarter").notNull(),
    quarterMonth: integer("quarter_month").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_monthly_deposit_employee_month").on(
      table.employeeId,
      table.resultMonth,
    ),
    index("idx_monthly_deposit_month_result").on(
      table.resultMonth,
      table.resultType,
    ),
    index("idx_monthly_deposit_employee_quarter").on(
      table.employeeId,
      table.tenureQuarter,
    ),
  ],
);

export const payrollRecords = sqliteTable(
  "hr_payroll_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    payrollMonth: text("payroll_month").notNull(),
    baseSalary: integer("base_salary").notNull().default(0),
    websitesCompleted: integer("websites_completed").notNull().default(0),
    targetWebsites: integer("target_websites").notNull().default(0),
    deductionPerWebsite: integer("deduction_per_website")
      .notNull()
      .default(100),
    websiteDeduction: integer("website_deduction").notNull().default(0),
    installmentDeduction: integer("installment_deduction").notNull().default(0),
    warningDeduction: integer("warning_deduction").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    workingDays: integer("working_days").notNull().default(0),
    attendanceBonusLoss: integer("attendance_bonus_loss").notNull().default(0),
    attendanceDeduction: integer("attendance_deduction").notNull().default(0),
    otherIncome: integer("other_income").notNull().default(0),
    customIncomeItems: text("custom_income_items").notNull().default("[]"),
    winlossAmount: integer("winloss_amount").notNull().default(0),
    otherDeduction: integer("other_deduction").notNull().default(0),
    customDeductionItems: text("custom_deduction_items")
      .notNull()
      .default("[]"),
    pulledInstallments: integer("pulled_installments", { mode: "boolean" })
      .notNull()
      .default(false),
    netSalary: integer("net_salary").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_payroll_employee_month").on(
      table.employeeId,
      table.payrollMonth,
    ),
    index("idx_payroll_month").on(table.payrollMonth),
  ],
);
