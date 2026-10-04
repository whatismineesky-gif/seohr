CREATE TABLE hr_employee_checkin_overrides (
 employee_id TEXT PRIMARY KEY REFERENCES hr_employees(id) ON DELETE CASCADE,
 meeting_start TEXT NOT NULL DEFAULT '12:00' CHECK(meeting_start = '12:00'),
 updated_by_email TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
