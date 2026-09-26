ALTER TABLE `hr_payroll_records` ADD `custom_income_items` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `hr_payroll_records` ADD `custom_deduction_items` text DEFAULT '[]' NOT NULL;