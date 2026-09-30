CREATE INDEX IF NOT EXISTS `hr_idx_attendance_audit_employee_previous_date`
ON `hr_attendance_audit_logs` (`employee_id`, `previous_record_date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hr_idx_attendance_audit_employee_new_date`
ON `hr_attendance_audit_logs` (`employee_id`, `new_record_date`);
