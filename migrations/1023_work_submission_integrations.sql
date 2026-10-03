CREATE TABLE hr_integration_api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('all', 'team')),
  team TEXT NOT NULL DEFAULT '',
  expires_at TEXT,
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  revoked_by_email TEXT,
  last_used_at TEXT,
  request_minute INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE hr_work_submissions ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
UPDATE hr_work_submissions SET updated_at = created_at WHERE updated_at = '';
CREATE INDEX idx_work_submissions_created ON hr_work_submissions(created_at, id);
CREATE INDEX idx_work_submissions_team_created ON hr_work_submissions(team, created_at, id);
