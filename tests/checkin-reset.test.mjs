import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/1024_clear_test_checkins_20261003.sql', import.meta.url), 'utf8');
function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE hr_employee_checkins(id INTEGER,employee_id TEXT,work_date TEXT,meeting_answer TEXT);
    CREATE TABLE hr_attendance_records(id INTEGER,employee_id TEXT,record_date TEXT,source_type TEXT,source_id INTEGER);
    CREATE TABLE hr_payroll_records(employee_id TEXT,payroll_month TEXT);
    INSERT INTO hr_employee_checkins VALUES (1,'A','2026-10-03','test'),(2,'B','2026-10-02','keep');
    INSERT INTO hr_attendance_records VALUES (1,'A','2026-10-03','checkin',1),(2,'B','2026-10-02','checkin',2),(3,'C','2026-10-03','manual',NULL);`);
  return db;
}
test('test-day reset archives only requested check-ins and their generated attendance', () => {
  const db=setup(); db.exec('BEGIN'); db.exec(migration); db.exec('COMMIT');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hr_employee_checkins').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hr_attendance_records').get().n,2);
  assert.equal(db.prepare('SELECT meeting_answer FROM hr_checkin_test_archive_20261003').get().meeting_answer,'test');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hr_checkin_attendance_archive_20261003').get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hr_employee_checkins WHERE work_date='2026-10-03'").get().n,0);
  db.close();
});
test('reset stops before deleting data when saved payroll requires recalculation', () => {
  const db=setup(); db.exec("INSERT INTO hr_payroll_records VALUES('A','2026-10'); BEGIN");
  assert.throws(()=>db.exec(migration),/CHECK constraint/); db.exec('ROLLBACK');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hr_employee_checkins').get().n,2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hr_attendance_records').get().n,3);
  db.close();
});
