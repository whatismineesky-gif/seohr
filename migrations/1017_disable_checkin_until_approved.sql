ALTER TABLE `hr_checkin_config`
ADD COLUMN `system_enabled` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `hr_checkin_config` SET `system_enabled` = 0 WHERE `id` = 1;
