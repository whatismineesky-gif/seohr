CREATE TABLE `attendance_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`record_date` text NOT NULL,
	`record_type` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`recorder_user_id` text DEFAULT '' NOT NULL,
	`recorder_email` text NOT NULL,
	`recorder_role` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attendance_unique_event` ON `attendance_records` (`employee_id`,`record_date`,`record_type`);--> statement-breakpoint
CREATE INDEX `idx_attendance_employee_date` ON `attendance_records` (`employee_id`,`record_date`);--> statement-breakpoint
CREATE INDEX `idx_attendance_date_type` ON `attendance_records` (`record_date`,`record_type`);--> statement-breakpoint
CREATE TABLE `attendance_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`event_type` text NOT NULL,
	`trigger_from` integer DEFAULT 1 NOT NULL,
	`action_type` text NOT NULL,
	`action_value` integer DEFAULT 0 NOT NULL,
	`period` text DEFAULT 'monthly' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`built_in` integer DEFAULT false NOT NULL,
	`created_by_email` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attendance_rules_code` ON `attendance_rules` (`code`);--> statement-breakpoint
CREATE INDEX `idx_attendance_rules_event_active` ON `attendance_rules` (`event_type`,`active`);--> statement-breakpoint
CREATE TABLE `system_users` (
	`email` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT '' NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'employee' NOT NULL,
	`employee_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_system_users_employee_id` ON `system_users` (`employee_id`);