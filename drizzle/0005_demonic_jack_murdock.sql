ALTER TABLE `payroll_records` ADD `working_days` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payroll_records` ADD `attendance_bonus_loss` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payroll_records` ADD `attendance_deduction` integer DEFAULT 0 NOT NULL;