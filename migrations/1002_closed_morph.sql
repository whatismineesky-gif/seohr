CREATE TABLE `hr_advance_installments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`advance_id` integer NOT NULL,
	`due_month` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payroll_record_id` integer,
	`processed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`advance_id`) REFERENCES `hr_employee_advances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hr_idx_advance_installments_unique_month` ON `hr_advance_installments` (`advance_id`,`due_month`);--> statement-breakpoint
CREATE INDEX `hr_idx_advance_installments_due_status` ON `hr_advance_installments` (`due_month`,`status`);--> statement-breakpoint
CREATE TABLE `hr_employee_advances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`advance_type` text NOT NULL,
	`repayment_type` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`total_amount` integer NOT NULL,
	`monthly_amount` integer NOT NULL,
	`start_month` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `hr_idx_employee_advances_employee` ON `hr_employee_advances` (`employee_id`);--> statement-breakpoint
CREATE INDEX `hr_idx_employee_advances_status` ON `hr_employee_advances` (`status`);--> statement-breakpoint
CREATE TABLE `hr_payroll_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`payroll_month` text NOT NULL,
	`base_salary` integer DEFAULT 0 NOT NULL,
	`websites_completed` integer DEFAULT 0 NOT NULL,
	`target_websites` integer DEFAULT 0 NOT NULL,
	`deduction_per_website` integer DEFAULT 100 NOT NULL,
	`website_deduction` integer DEFAULT 0 NOT NULL,
	`installment_deduction` integer DEFAULT 0 NOT NULL,
	`warning_deduction` integer DEFAULT 0 NOT NULL,
	`warning_count` integer DEFAULT 0 NOT NULL,
	`other_income` integer DEFAULT 0 NOT NULL,
	`other_deduction` integer DEFAULT 0 NOT NULL,
	`pulled_installments` integer DEFAULT false NOT NULL,
	`net_salary` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hr_idx_payroll_employee_month` ON `hr_payroll_records` (`employee_id`,`payroll_month`);--> statement-breakpoint
CREATE INDEX `hr_idx_payroll_month` ON `hr_payroll_records` (`payroll_month`);--> statement-breakpoint
CREATE TABLE `hr_payroll_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`target_websites` integer DEFAULT 0 NOT NULL,
	`deduction_per_website` integer DEFAULT 100 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hr_warning_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`warning_date` text NOT NULL,
	`subject` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `hr_idx_warning_employee_date` ON `hr_warning_records` (`employee_id`,`warning_date`);