ALTER TABLE `hr_attendance_records` ADD COLUMN `source_type` text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE `hr_attendance_records` ADD COLUMN `source_id` integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hr_idx_attendance_source`
ON `hr_attendance_records` (`source_type`, `source_id`);
--> statement-breakpoint
CREATE TABLE `hr_daily_work_targets` (
	`month` text PRIMARY KEY NOT NULL,
	`target_per_day` integer DEFAULT 0 NOT NULL,
	`updated_by_email` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hr_daily_work_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`review_date` text NOT NULL,
	`target_count` integer DEFAULT 0 NOT NULL,
	`submitted_count` integer DEFAULT 0 NOT NULL,
	`result_status` text DEFAULT 'complete' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`attendance_record_id` integer,
	`reviewed_by_user_id` text DEFAULT '' NOT NULL,
	`reviewed_by_email` text DEFAULT '' NOT NULL,
	`reviewed_by_name` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hr_idx_daily_work_review_employee_date`
ON `hr_daily_work_reviews` (`employee_id`, `review_date`);
--> statement-breakpoint
CREATE INDEX `hr_idx_daily_work_review_date_status`
ON `hr_daily_work_reviews` (`review_date`, `result_status`);
--> statement-breakpoint
CREATE TABLE `hr_daily_work_review_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`review_id` integer NOT NULL,
	`employee_id` text NOT NULL,
	`review_date` text NOT NULL,
	`previous_status` text,
	`previous_submitted_count` integer,
	`previous_reason` text,
	`new_status` text NOT NULL,
	`new_submitted_count` integer NOT NULL,
	`new_reason` text DEFAULT '' NOT NULL,
	`change_reason` text DEFAULT '' NOT NULL,
	`actor_user_id` text DEFAULT '' NOT NULL,
	`actor_email` text NOT NULL,
	`actor_display_name` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `hr_idx_daily_work_review_logs_date`
ON `hr_daily_work_review_logs` (`review_date`, `created_at`);
--> statement-breakpoint
CREATE INDEX `hr_idx_daily_work_review_logs_employee`
ON `hr_daily_work_review_logs` (`employee_id`, `created_at`);
