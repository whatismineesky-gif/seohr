CREATE TABLE `hr_checkin_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`other_meeting_start` text DEFAULT '12:00' NOT NULL,
	`staff_meeting_start` text DEFAULT '13:00' NOT NULL,
	`meeting_late_after` text DEFAULT '13:05' NOT NULL,
	`meeting_answers_open` integer DEFAULT 1 NOT NULL,
	`work_end_start` text DEFAULT '00:00' NOT NULL,
	`work_end_deadline` text DEFAULT '06:00' NOT NULL,
	`updated_by_email` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `hr_checkin_config` (
	`id`, `other_meeting_start`, `staff_meeting_start`, `meeting_late_after`,
	`meeting_answers_open`, `work_end_start`, `work_end_deadline`
) VALUES (1, '12:00', '13:00', '13:05', 1, '00:00', '06:00');
--> statement-breakpoint
CREATE TABLE `hr_employee_checkins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`work_date` text NOT NULL,
	`meeting_started_at` text,
	`meeting_late` integer DEFAULT 0 NOT NULL,
	`meeting_ended_at` text,
	`meeting_answer` text DEFAULT '' NOT NULL,
	`work_ended_at` text,
	`created_by_user_id` text DEFAULT '' NOT NULL,
	`created_by_email` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hr_idx_employee_checkin_date`
ON `hr_employee_checkins` (`employee_id`, `work_date`);
--> statement-breakpoint
CREATE INDEX `hr_idx_employee_checkin_work_date`
ON `hr_employee_checkins` (`work_date`);
