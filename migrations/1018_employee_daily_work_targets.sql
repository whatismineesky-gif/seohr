CREATE TABLE `hr_employee_daily_work_targets` (
  `employee_id` text NOT NULL REFERENCES `hr_employees`(`id`),
  `effective_date` text NOT NULL,
  `target_per_day` integer CHECK (`target_per_day` IS NULL OR `target_per_day` >= 1),
  `updated_by_email` text DEFAULT '' NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (`employee_id`, `effective_date`)
);
--> statement-breakpoint
CREATE TABLE `hr_employee_daily_work_target_logs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `employee_id` text NOT NULL REFERENCES `hr_employees`(`id`),
  `effective_date` text NOT NULL,
  `previous_target` integer,
  `new_target` integer,
  `actor_email` text NOT NULL,
  `actor_name` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
