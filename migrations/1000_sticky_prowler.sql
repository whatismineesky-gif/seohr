CREATE TABLE `hr_employees` (
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
CREATE INDEX `hr_idx_employees_team` ON `hr_employees` (`team`);--> statement-breakpoint
CREATE INDEX `hr_idx_employees_status` ON `hr_employees` (`status`);
--> statement-breakpoint
INSERT OR IGNORE INTO `hr_employees` (
	`id`, `sequence`, `nickname`, `team`, `position`, `employment`, `full_name`,
	`bank_account`, `bank_name`, `account_name`, `start_date`, `end_date`,
	`email`, `probation`, `status`, `created_at`, `updated_at`
)
SELECT
	e.`employee_code`,
	ROW_NUMBER() OVER (ORDER BY e.`created_at`, e.`employee_code`),
	e.`display_name`,
	COALESCE(t.`name`, t.`code`, ''),
	'Staff',
	CASE e.`employment_type`
		WHEN 'part_time' THEN 'PartTime'
		WHEN 'freelancer' THEN 'Freelancer'
		ELSE 'FullTime'
	END,
	COALESCE(e.`legal_name`, ''),
	COALESCE(e.`bank_account_number`, ''),
	COALESCE(e.`bank_name`, ''),
	COALESCE(e.`bank_account_name`, ''),
	COALESCE(e.`start_date`, ''),
	COALESCE(e.`end_date`, ''),
	COALESCE(e.`email`, ''),
	'ยังไม่ผ่าน',
	CASE e.`status`
		WHEN 'active' THEN 'ยังทำงานอยู่'
		WHEN 'resigned' THEN 'ลาออก'
		ELSE 'ไม่ทำงาน'
	END,
	e.`created_at`, e.`updated_at`
FROM `employees` e
LEFT JOIN `teams` t ON t.`id` = e.`team_id`
WHERE e.`deleted_at` IS NULL;
