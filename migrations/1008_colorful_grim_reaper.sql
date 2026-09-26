CREATE TABLE `hr_attendance_audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`attendance_record_id` integer NOT NULL,
	`employee_id` text NOT NULL,
	`employee_nickname` text DEFAULT '' NOT NULL,
	`action` text NOT NULL,
	`previous_record_date` text NOT NULL,
	`previous_record_type` text NOT NULL,
	`previous_reason` text DEFAULT '' NOT NULL,
	`new_record_date` text,
	`new_record_type` text,
	`new_reason` text,
	`actor_user_id` text DEFAULT '' NOT NULL,
	`actor_email` text NOT NULL,
	`actor_display_name` text DEFAULT '' NOT NULL,
	`actor_role` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `hr_idx_attendance_audit_employee_created` ON `hr_attendance_audit_logs` (`employee_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `hr_idx_attendance_audit_previous_date` ON `hr_attendance_audit_logs` (`previous_record_date`);--> statement-breakpoint
CREATE INDEX `hr_idx_attendance_audit_new_date` ON `hr_attendance_audit_logs` (`new_record_date`);