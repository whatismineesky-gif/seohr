ALTER TABLE `hr_system_users` ADD `login_username` text DEFAULT '' NOT NULL;

UPDATE `hr_system_users`
SET `login_username` = substr(`email`, 1, instr(`email`, '@') - 1)
WHERE `email` LIKE '%@people-os.local'
  AND EXISTS (
    SELECT 1 FROM `users`
    WHERE `users`.`username` = substr(`hr_system_users`.`email`, 1, instr(`hr_system_users`.`email`, '@') - 1) COLLATE NOCASE
  );
