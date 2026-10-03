-- One-time reset of check-in test data for work date 2026-10-03.
-- Archive before removing active records. Do not touch manually entered attendance.
CREATE TABLE hr_checkin_reset_guard_20261003 (
  affected_saved_payroll INTEGER NOT NULL CHECK (affected_saved_payroll = 0)
);
INSERT INTO hr_checkin_reset_guard_20261003
SELECT COUNT(*) FROM hr_payroll_records p
WHERE p.payroll_month = '2026-10'
AND EXISTS (
  SELECT 1 FROM hr_attendance_records a
  WHERE a.employee_id = p.employee_id AND a.source_type = 'checkin'
    AND a.record_date = '2026-10-03'
    AND a.source_id IN (SELECT id FROM hr_employee_checkins WHERE work_date = '2026-10-03')
);
CREATE TABLE hr_checkin_test_archive_20261003 AS
SELECT * FROM hr_employee_checkins WHERE work_date = '2026-10-03';
CREATE TABLE hr_checkin_attendance_archive_20261003 AS
SELECT * FROM hr_attendance_records WHERE source_type = 'checkin'
  AND record_date = '2026-10-03'
  AND source_id IN (SELECT id FROM hr_checkin_test_archive_20261003);
DELETE FROM hr_attendance_records
WHERE id IN (SELECT id FROM hr_checkin_attendance_archive_20261003);
DELETE FROM hr_employee_checkins
WHERE id IN (SELECT id FROM hr_checkin_test_archive_20261003);
DROP TABLE hr_checkin_reset_guard_20261003;
