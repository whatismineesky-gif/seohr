CREATE TABLE `hr_attendance_bonus_tiers` (
	`id` integer PRIMARY KEY NOT NULL,
	`min_month` integer NOT NULL,
	`max_month` integer,
	`amount` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_by_email` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hr_idx_attendance_bonus_tier_month`
ON `hr_attendance_bonus_tiers` (`min_month`);
--> statement-breakpoint
INSERT INTO `hr_attendance_bonus_tiers` (`id`, `min_month`, `max_month`, `amount`, `active`)
VALUES
	(1, 1, 3, 0, 1),
	(2, 4, 4, 1000, 1),
	(3, 5, 5, 1500, 1),
	(4, 6, NULL, 2000, 1);
--> statement-breakpoint
UPDATE `hr_attendance_rules`
SET `action_value` = 0, `updated_at` = CURRENT_TIMESTAMP
WHERE `action_type` = 'lose_bonus';
