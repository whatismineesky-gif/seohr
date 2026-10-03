CREATE TABLE hr_work_submission_backfill_grants (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 start_date TEXT NOT NULL, end_date TEXT NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('all','team','employee')),
 team TEXT NOT NULL DEFAULT '', employee_id TEXT NOT NULL DEFAULT '',
 closes_at TEXT NOT NULL, reason TEXT NOT NULL,
 created_by_email TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 revoked_at TEXT, revoked_by_email TEXT,
 CHECK(start_date <= end_date)
);
CREATE INDEX hr_work_submission_backfill_active ON hr_work_submission_backfill_grants(revoked_at, closes_at);
ALTER TABLE hr_work_submissions ADD COLUMN backfill_grant_id INTEGER REFERENCES hr_work_submission_backfill_grants(id);
