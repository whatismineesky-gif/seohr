CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`sequence` integer NOT NULL,
	`nickname` text NOT NULL,
	`team` text NOT NULL,
	`position` text DEFAULT 'Staff' NOT NULL,
	`employment` text DEFAULT 'FullTime' NOT NULL,
	`full_name` text DEFAULT '' NOT NULL,
	`salary` integer,
	`bank_account` text DEFAULT '' NOT NULL,
	`bank_name` text DEFAULT '' NOT NULL,
	`account_name` text DEFAULT '' NOT NULL,
	`start_date` text DEFAULT '' NOT NULL,
	`end_date` text DEFAULT '' NOT NULL,
	`aff` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`discord_id` text DEFAULT '' NOT NULL,
	`dynadot` text DEFAULT '' NOT NULL,
	`referred_by` text DEFAULT '' NOT NULL,
	`probation` text DEFAULT 'ยังไม่ผ่าน' NOT NULL,
	`status` text DEFAULT 'ยังทำงานอยู่' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_employees_team` ON `employees` (`team`);--> statement-breakpoint
CREATE INDEX `idx_employees_status` ON `employees` (`status`);