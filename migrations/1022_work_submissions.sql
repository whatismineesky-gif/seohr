CREATE TABLE hr_work_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  website TEXT NOT NULL,
  work_date TEXT NOT NULL,
  parent_website TEXT NOT NULL,
  submission_type TEXT NOT NULL CHECK (submission_type IN ('new', '301', '301_new')),
  employee_id TEXT REFERENCES hr_employees(id),
  team TEXT NOT NULL DEFAULT '',
  author_email TEXT NOT NULL COLLATE NOCASE,
  author_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_work_submissions_date ON hr_work_submissions(work_date DESC, id DESC);
CREATE INDEX idx_work_submissions_author ON hr_work_submissions(author_email, work_date DESC, id DESC);
CREATE INDEX idx_work_submissions_team ON hr_work_submissions(team, work_date DESC, id DESC);

UPDATE hr_system_users
SET menu_permissions = json_insert(menu_permissions, '$[#]', 'submissions')
WHERE json_valid(menu_permissions) AND json_type(menu_permissions) = 'array'
  AND json_array_length(menu_permissions) > 0
  AND NOT EXISTS (SELECT 1 FROM json_each(menu_permissions) WHERE value = 'submissions');
