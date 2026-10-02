CREATE TABLE `hr_daily_work_status_config` (
  `id` integer PRIMARY KEY CHECK (`id` = 1),
  `included_statuses` text NOT NULL,
  `updated_by_email` text DEFAULT '' NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `hr_daily_work_status_config` (`id`, `included_statuses`)
VALUES (1, '["working","meeting_leave"]');
