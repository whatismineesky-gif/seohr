import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import ts from 'typescript';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE hr_employees (
    id TEXT PRIMARY KEY, sequence INTEGER, nickname TEXT, team TEXT,
    position TEXT DEFAULT 'Staff', employment TEXT DEFAULT 'FullTime',
    status TEXT DEFAULT 'ยังทำงานอยู่', start_date TEXT DEFAULT '', end_date TEXT DEFAULT ''
  );
  CREATE TABLE hr_attendance_records (
    id INTEGER PRIMARY KEY, employee_id TEXT, record_date TEXT, record_type TEXT,
    reason TEXT, recorder_user_id TEXT, recorder_email TEXT, recorder_role TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  INSERT INTO hr_employees (id, sequence, nickname, team) VALUES
    ('A', 1, 'A', 'SEO 1'), ('B', 2, 'B', 'SEO 1'), ('C', 3, 'C', 'SEO 2');`);
  for (const file of ['1014_daily_work_audit.sql', '1018_employee_daily_work_targets.sql', '1019_daily_work_review_target_logs.sql']) {
    sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  const database = {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        first() { return sqlite.prepare(sql).get(...values) ?? null; },
        all() { return { results: sqlite.prepare(sql).all(...values) }; },
        run() { return sqlite.prepare(sql).run(...values); },
        execute() {
          const compiled = sqlite.prepare(sql);
          return { results: compiled.columns().length ? compiled.all(...values) : (compiled.run(...values), []) };
        },
      };
      return statement;
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const result = statements.map((statement) => statement.execute()); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const payroll = [];
  const source = ts.transpileModule(readFileSync(new URL('../db/work-audit.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)((name) => {
    if (name === './index') return { getD1: () => database };
    if (name === './attendance') return { syncAttendanceToPayroll: async (...args) => payroll.push(args) };
    throw new Error(`Unexpected import: ${name}`);
  }, exports);
  return { ...exports, sqlite, payroll };
}
const hr = { role: 'hr', userId: 'hr1', email: 'hr@example.test', displayName: 'HR' };

test('individual targets apply from their date, shared defaults and confirmed results recalculate with audit history', async () => {
  const f = fixture();
  await f.saveWorkTarget(hr, { month: '2026-10', targetPerDay: 3 });
  await f.saveEmployeeWorkTarget(hr, { employeeId: 'B', effectiveDate: '2026-10-02', targetPerDay: 1 });
  await f.saveEmployeeWorkTarget(hr, { employeeId: 'C', effectiveDate: '2026-10-02', targetPerDay: 5 });
  const targets = async (date) => (await f.getWorkAuditData(hr, date)).rows.map((row) => row.targetCount);
  assert.deepEqual(await targets('2026-10-01'), [3, 3, 3]);
  assert.deepEqual(await targets('2026-10-02'), [3, 1, 5]);
  await f.confirmDailyWork(hr, { reviewDate: '2026-10-02', rows: [
    { employeeId: 'A', submittedCount: 3 }, { employeeId: 'B', submittedCount: 1 },
    { employeeId: 'C', submittedCount: 4 },
  ] });
  const reviewed = await f.getWorkAuditData(hr, '2026-10-02');
  assert.deepEqual(reviewed.rows.map((row) => row.resultStatus), ['complete', 'complete', 'incomplete']);
  assert.equal(reviewed.rows[2].missingCount, 1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM hr_attendance_records').get().count, 1);
  assert.deepEqual(f.payroll, [['C', '2026-10']]);
  await f.saveEmployeeWorkTarget(hr, { employeeId: 'B', effectiveDate: '2026-10-02', targetPerDay: 2 });
  assert.deepEqual(await targets('2026-10-02'), [3, 2, 5]);
  assert.deepEqual(await targets('2026-10-03'), [3, 2, 5]);
  await f.confirmDailyWork(hr, { reviewDate: '2026-10-02', rows: [
    { employeeId: 'A', submittedCount: 3 },
    { employeeId: 'B', submittedCount: 2, changeReason: 'แก้จำนวนส่งจริง' },
    { employeeId: 'C', submittedCount: 4 },
  ] });
  assert.equal((await f.getWorkAuditData(hr, '2026-10-02')).rows[1].targetCount, 2);
  assert.equal((await f.getWorkAuditData(hr, '2026-10-02')).rows[1].resultStatus, 'complete');
  await f.saveEmployeeWorkTarget(hr, { employeeId: 'B', effectiveDate: '2026-10-04', targetPerDay: null });
  assert.deepEqual(await targets('2026-10-03'), [3, 2, 5]);
  assert.deepEqual(await targets('2026-10-04'), [3, 3, 5]);
  await f.saveWorkTarget(hr, { month: '2026-10', targetPerDay: 4 });
  assert.deepEqual(await targets('2026-10-04'), [4, 4, 5]);
  assert.deepEqual(await targets('2026-10-02'), [3, 2, 5]);
  const config = await f.getWorkAuditData(hr, '2026-10-04');
  assert.equal(config.employeeTargetConfigs.length, 3);
  assert.equal(config.employeeTargetHistory.length, 4);
  assert.equal(config.employeeTargetHistory[0].previousTarget, 2);
  assert.equal(config.employeeTargetHistory[0].newTarget, null);
  await f.saveWorkTarget(hr, { month: '2026-11', targetPerDay: 6 });
  assert.deepEqual(await targets('2026-11-01'), [6, 6, 5]);
  f.sqlite.close();
});

test('target writes validate permission, employee, date and positive integer; config stays private', async () => {
  const f = fixture();
  const input = { employeeId: 'B', effectiveDate: '2026-10-02', targetPerDay: 1 };
  for (const role of ['audit', 'employee']) {
    await assert.rejects(f.saveEmployeeWorkTarget({ ...hr, role }, input), /เฉพาะ HR/);
  }
  for (const targetPerDay of [0, -1, 1.5, 'NaN', Infinity, undefined]) {
    await assert.rejects(f.saveEmployeeWorkTarget(hr, { ...input, targetPerDay }), /จำนวนเต็ม/);
  }
  await assert.rejects(f.saveEmployeeWorkTarget(hr, { ...input, employeeId: 'missing' }), /ไม่พบพนักงาน/);
  await assert.rejects(f.saveEmployeeWorkTarget(hr, { ...input, effectiveDate: '2026-02-30' }), /วันที่เริ่มใช้/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM hr_employee_daily_work_targets').get().count, 0);
  await f.saveEmployeeWorkTarget(hr, input);
  const employeeData = await f.getWorkAuditData({ ...hr, role: 'employee', employeeId: 'B' }, '2026-10-02');
  assert.equal(employeeData.rows.length, 1);
  assert.equal(employeeData.rows[0].targetCount, 1);
  assert.deepEqual(employeeData.targetEmployees, []);
  assert.deepEqual(employeeData.employeeTargetHistory, []);
  f.sqlite.close();
});

test('setting a lower target after confirmation removes work-audit absence and resyncs payroll only for that employee', async () => {
  const f = fixture();
  await f.saveWorkTarget(hr, { month: '2026-10', targetPerDay: 3 });
  const rows = [ { employeeId: 'A', submittedCount: 3 }, { employeeId: 'B', submittedCount: 1 }, { employeeId: 'C', submittedCount: 2 } ];
  await f.confirmDailyWork(hr, { reviewDate: '2026-10-01', rows });
  await f.confirmDailyWork(hr, { reviewDate: '2026-10-02', rows });
  f.payroll.length = 0;
  await f.saveEmployeeWorkTarget(hr, { employeeId: 'B', effectiveDate: '2026-10-02', targetPerDay: 1 });
  const current = await f.getWorkAuditData(hr, '2026-10-02');
  assert.equal(current.rows[1].targetCount, 1);
  assert.equal(current.rows[1].submittedCount, 1);
  assert.equal(current.rows[1].resultStatus, 'complete');
  assert.equal(current.rows[2].submittedCount, 2);
  assert.equal(current.rows[2].resultStatus, 'incomplete');
  assert.equal((await f.getWorkAuditData(hr, '2026-10-01')).rows[1].targetCount, 3);
  assert.deepEqual(f.payroll, [['B', '2026-10']]);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM hr_attendance_records WHERE employee_id = 'B' AND record_date = '2026-10-02'").get().count, 0);
  const log = current.history.find(item => item.employeeId === 'B');
  assert.equal(log.previousTargetCount, 3);
  assert.equal(log.newTargetCount, 1);
  assert.equal(log.changeReason, 'ปรับเป้าหมายตาม Config เฉพาะพนักงาน');
  f.sqlite.close();
});

test('existing overrides show new targets and can reconfirm without changing actual submissions', async () => {
  const f = fixture();
  await f.saveWorkTarget(hr, { month: '2026-10', targetPerDay: 3 });
  await f.confirmDailyWork(hr, { reviewDate: '2026-10-02', rows: [
    { employeeId: 'A', submittedCount: 3 }, { employeeId: 'B', submittedCount: 1 }, { employeeId: 'C', submittedCount: 3 }
  ] });
  f.sqlite.prepare("INSERT INTO hr_employee_daily_work_targets (employee_id, effective_date, target_per_day) VALUES ('B', '2026-10-02', 1)").run();
  const preview = await f.getWorkAuditData(hr, '2026-10-02');
  assert.equal(preview.rows[1].targetCount, 1);
  assert.equal(preview.rows[1].targetPending, true);
  assert.equal(preview.rows[1].resultStatus, 'complete');
  const savedSummary = await f.getWorkAuditData(hr, '2026-10-02', true);
  assert.equal(savedSummary.rows[0].targetCount, 3);
  await f.confirmDailyWork(hr, { reviewDate: '2026-10-02', rows: preview.rows.map(row => ({ employeeId: row.id, submittedCount: row.submittedCount, reason: row.reason })) });
  assert.equal((await f.getWorkAuditData(hr, '2026-10-02')).rows[1].targetPending, false);
  assert.equal((await f.getWorkAuditData(hr, '2026-10-02', true)).rows.length, 0);
  f.sqlite.close();
});
