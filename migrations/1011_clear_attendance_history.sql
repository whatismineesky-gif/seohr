-- One-time cleanup requested for the production People OS database.
-- Keep employee, attendance-rule, and payroll tables intact.
DELETE FROM `hr_attendance_audit_logs`;
--> statement-breakpoint
DELETE FROM `hr_attendance_records`;
