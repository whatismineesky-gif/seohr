UPDATE `hr_employees`
SET
  `full_name` = CASE
    WHEN `full_name` = '' THEN COALESCE((
      SELECT `legal_name` FROM `employees`
      WHERE `employees`.`employee_code` = `hr_employees`.`id`
      LIMIT 1
    ), '')
    ELSE `full_name`
  END,
  `salary` = CASE
    WHEN `salary` IS NULL OR `salary` = 0 THEN (
      SELECT CAST(ROUND(`compensation_history`.`base_salary_satang` / 100.0) AS INTEGER)
      FROM `compensation_history`
      JOIN `employees` ON `employees`.`id` = `compensation_history`.`employee_id`
      WHERE `employees`.`employee_code` = `hr_employees`.`id`
      ORDER BY `compensation_history`.`effective_month` DESC
      LIMIT 1
    )
    ELSE `salary`
  END,
  `bank_account` = CASE
    WHEN `bank_account` = '' THEN REPLACE(REPLACE(COALESCE((
      SELECT `bank_account_number` FROM `employees`
      WHERE `employees`.`employee_code` = `hr_employees`.`id`
      LIMIT 1
    ), ''), '-', ''), ' ', '')
    ELSE `bank_account`
  END,
  `bank_name` = CASE
    WHEN `bank_name` = '' THEN COALESCE((
      SELECT `bank_name` FROM `employees`
      WHERE `employees`.`employee_code` = `hr_employees`.`id`
      LIMIT 1
    ), '')
    ELSE `bank_name`
  END,
  `account_name` = CASE
    WHEN `account_name` = '' THEN COALESCE((
      SELECT `bank_account_name` FROM `employees`
      WHERE `employees`.`employee_code` = `hr_employees`.`id`
      LIMIT 1
    ), '')
    ELSE `account_name`
  END,
  `email` = CASE
    WHEN `email` = '' THEN COALESCE((
      SELECT `email` FROM `employees`
      WHERE `employees`.`employee_code` = `hr_employees`.`id`
      LIMIT 1
    ), '')
    ELSE `email`
  END,
  `updated_at` = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM `employees`
  WHERE `employees`.`employee_code` = `hr_employees`.`id`
);
