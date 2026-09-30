UPDATE `hr_employees`
SET `status` = 'กำลังรอคัดชื่อออก', `updated_at` = CURRENT_TIMESTAMP
WHERE `status` = 'รอคัดชื่อออก';
--> statement-breakpoint
UPDATE `hr_employees`
SET `status` = 'ลาออก', `updated_at` = CURRENT_TIMESTAMP
WHERE `status` = 'ลาออกแล้ว';
