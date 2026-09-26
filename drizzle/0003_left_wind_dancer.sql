CREATE TABLE `monthly_deposit_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`result_month` text NOT NULL,
	`tenure_month` integer NOT NULL,
	`deposit_count` integer DEFAULT 0 NOT NULL,
	`mid_value` integer NOT NULL,
	`min_value` integer NOT NULL,
	`result_type` text NOT NULL,
	`tenure_quarter` integer NOT NULL,
	`quarter_month` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monthly_deposit_employee_month` ON `monthly_deposit_results` (`employee_id`,`result_month`);--> statement-breakpoint
CREATE INDEX `idx_monthly_deposit_month_result` ON `monthly_deposit_results` (`result_month`,`result_type`);--> statement-breakpoint
CREATE INDEX `idx_monthly_deposit_employee_quarter` ON `monthly_deposit_results` (`employee_id`,`tenure_quarter`);--> statement-breakpoint
CREATE TABLE `warning_configs` (
	`tenure_month` integer PRIMARY KEY NOT NULL,
	`mid_value` integer NOT NULL,
	`min_value` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
