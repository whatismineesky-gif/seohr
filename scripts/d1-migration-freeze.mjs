import { writeFileSync } from 'node:fs';

const tables = [
  "advance_payments",
  "advance_schedule",
  "advances",
  "attachments",
  "attendance_entries",
  "attendance_events",
  "audit_events",
  "compensation_history",
  "d1_migrations",
  "employees",
  "hr_advance_installments",
  "hr_attendance_audit_logs",
  "hr_attendance_bonus_tiers",
  "hr_attendance_records",
  "hr_attendance_rules",
  "hr_checkin_attendance_archive_20261003",
  "hr_checkin_config",
  "hr_checkin_test_archive_20261003",
  "hr_daily_work_review_logs",
  "hr_daily_work_reviews",
  "hr_daily_work_status_config",
  "hr_daily_work_targets",
  "hr_employee_advances",
  "hr_employee_checkin_overrides",
  "hr_employee_checkins",
  "hr_employee_daily_work_target_logs",
  "hr_employee_daily_work_targets",
  "hr_employees",
  "hr_integration_api_keys",
  "hr_monthly_deposit_results",
  "hr_notification_reads",
  "hr_notifications",
  "hr_payroll_records",
  "hr_payroll_settings",
  "hr_system_announcements",
  "hr_system_users",
  "hr_warning_configs",
  "hr_warning_records",
  "hr_work_submission_backfill_grants",
  "hr_work_submissions",
  "import_batches",
  "members",
  "payroll_accounts",
  "payroll_lines",
  "payroll_periods",
  "payroll_records",
  "permissions",
  "policy_versions",
  "role_permissions",
  "roles",
  "sessions",
  "teams",
  "user_roles",
  "users"
];
const release = process.argv.includes('--release');
const lines = ['-- People OS: reversible D1 migration write fence. No row data is changed.'];
for (const table of tables) for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
  const name = '__people_os_migration_freeze_' + table + '_' + event.toLowerCase();
  lines.push(release
    ? `DROP TRIGGER IF EXISTS "${name}";`
    : `CREATE TRIGGER IF NOT EXISTS "${name}" BEFORE ${event} ON "${table}" BEGIN SELECT RAISE(ABORT, 'PEOPLE_OS_MIGRATION_PAUSED'); END;`);
}
lines.push("SELECT COUNT(*) AS freeze_guards FROM sqlite_master WHERE type = 'trigger' AND name GLOB '__people_os_migration_freeze_*';");
const sql = lines.join('\n') + '\n';
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
if (output) writeFileSync(output, sql); else process.stdout.write(sql);
