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
  CREATE TABLE hr_work_submissions (employee_id TEXT, work_date TEXT, submission_type TEXT, created_at TEXT);
  INSERT INTO hr_employees (id, sequence, nickname, team) VALUES
    ('A', 1, 'A', 'SEO 1'), ('B', 2, 'B', 'SEO 1'), ('C', 3, 'C', 'SEO 2');`);
  for (const file of ['1014_daily_work_audit.sql', '1018_employee_daily_work_targets.sql', '1019_daily_work_review_target_logs.sql', '1020_daily_work_status_filter.sql']) {
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
  return { ...exports, sqlite, payroll, database };
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

test('status config filters by manual attendance on review date, supports all options and preserves role scope', async () => {
  const f = fixture();
  f.sqlite.exec(`INSERT INTO hr_employees (id, sequence, nickname, team) VALUES
    ('D', 4, 'D', 'SEO 2'), ('E', 5, 'E', 'SEO 2'), ('F', 6, 'F', 'SEO 1');
    INSERT INTO hr_attendance_records (employee_id, record_date, record_type, source_type) VALUES
    ('B', '2026-10-02', 'absence', 'manual'),
    ('C', '2026-10-02', 'meeting_leave', 'manual'),
    ('D', '2026-10-02', 'admin', 'manual'),
    ('E', '2026-10-02', 'true', 'manual'),
    ('F', '2026-10-02', 'late', 'manual'),
    ('A', '2026-10-02', 'absence', 'work_audit');`);
  const ids = async () => (await f.getWorkAuditData(hr, '2026-10-02')).rows.map(row => row.id).sort();
  assert.deepEqual(await ids(), ['A', 'C', 'F']);
  for (const [status, expected] of [ ['working', ['A', 'F']], ['absence', ['B']], ['meeting_leave', ['C']], ['admin', ['D']], ['true', ['E']] ]) {
    await f.saveWorkStatusConfig(hr, { includedStatuses: [status] });
    assert.deepEqual(await ids(), expected);
  }
  await f.saveWorkStatusConfig(hr, { includedStatuses: ['admin', 'true', 'admin'] });
  assert.deepEqual(await ids(), ['D', 'E']);
  assert.deepEqual((await f.getWorkAuditData(hr, '2026-10-03')).rows, []);
  const employee = await f.getWorkAuditData({ ...hr, role: 'employee', employeeId: 'D' }, '2026-10-02');
  assert.deepEqual(employee.rows.map(row => row.id), ['D']);
  await f.saveWorkTarget(hr, { month: '2026-10', targetPerDay: 3 });
  await f.confirmDailyWork(hr, { reviewDate: '2026-10-02', rows: [] });
  assert.deepEqual(f.sqlite.prepare('SELECT employee_id FROM hr_daily_work_reviews ORDER BY employee_id').all().map(row => row.employee_id), ['D', 'E']);
  await f.saveWorkStatusConfig(hr, { includedStatuses: [] });
  assert.deepEqual(await ids(), []);
  for (const role of ['audit', 'employee']) await assert.rejects(f.saveWorkStatusConfig({ ...hr, role }, { includedStatuses: ['working'] }), /เฉพาะ HR/);
  for (const includedStatuses of [null, 'admin', ['not_a_status']]) await assert.rejects(f.saveWorkStatusConfig(hr, { includedStatuses }), /ไม่ถูกต้อง/);
  f.sqlite.close();
});

test('HR can create and edit admin/true records with audit history, without new payroll deductions', async () => {
  const f = fixture();
  f.sqlite.exec(`CREATE TABLE hr_payroll_records (
    id INTEGER, employee_id TEXT, payroll_month TEXT, base_salary INTEGER,
    other_income INTEGER, winloss_amount INTEGER, installment_deduction INTEGER,
    warning_deduction INTEGER, other_deduction INTEGER
  );
  CREATE TABLE hr_attendance_rules (id INTEGER, code TEXT, name TEXT, event_type TEXT,
    trigger_from INTEGER, action_type TEXT, action_value INTEGER, period TEXT, active INTEGER, built_in INTEGER);
  CREATE TABLE hr_attendance_bonus_tiers (id INTEGER, min_month INTEGER, max_month INTEGER, amount INTEGER, active INTEGER);`);
  f.sqlite.exec(readFileSync(new URL('../migrations/1008_colorful_grim_reaper.sql', import.meta.url), 'utf8'));
  const source = ts.transpileModule(readFileSync(new URL('../db/attendance.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const attendance = {};
  new Function('require', 'exports', source)((name) => {
    if (name === './index') return { getD1: () => f.database };
    if (name === './employees') return { ensureEmployeesSeeded: async () => {} };
    if (name === '../lib/employee-selection') {
      const selection = {};
      const code = ts.transpileModule(readFileSync(new URL('../lib/employee-selection.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
      new Function('exports', code)(selection);
      return selection;
    }
    throw Error(name);
  }, attendance);
  const before = await attendance.getAttendancePayrollImpact('B', '2026-10');
  const input = { employeeId: 'B', recordDate: '2026-10-02', recordType: 'admin', reason: 'งานแอดมิน' };
  const created = await attendance.createAttendanceRecord(hr, input);
  assert.equal(f.sqlite.prepare('SELECT record_type FROM hr_attendance_records WHERE id = ?').get(created.id).record_type, 'admin');
  await attendance.updateAttendanceRecord(hr, { ...input, id: created.id, recordType: 'true', reason: 'งานทรู' });
  assert.equal(f.sqlite.prepare('SELECT record_type FROM hr_attendance_records WHERE id = ?').get(created.id).record_type, 'true');
  const log = f.sqlite.prepare('SELECT * FROM hr_attendance_audit_logs').get();
  assert.equal(log.previous_record_type, 'admin');
  assert.equal(log.new_record_type, 'true');
  assert.deepEqual(await attendance.getAttendancePayrollImpact('B', '2026-10'), before);
  const employee = { ...hr, userId: 'employee-b', email: 'b@test', role: 'employee', employeeId: 'B' };
  const audit = { ...hr, userId: 'audit-user', email: 'audit@test', role: 'audit' };
  for (const recordType of ['admin', 'true']) {
    const own = await attendance.createAttendanceRecord(employee, { ...input, recordType });
    await attendance.updateAttendanceRecord(employee, { ...input, id: own.id, recordType: recordType === 'admin' ? 'true' : 'admin' });
    const other = await attendance.createAttendanceRecord(audit, { ...input, recordType });
    await attendance.updateAttendanceRecord(audit, { ...input, id: other.id, recordType });
    await assert.rejects(attendance.createAttendanceRecord(employee, { ...input, employeeId: 'A', recordType }), /ไม่มีสิทธิ์/);
    await assert.rejects(attendance.updateAttendanceRecord(employee, { ...input, id: other.id, recordType }), /ไม่มีสิทธิ์/);
    await attendance.deleteAttendanceRecord(employee, own.id);
    await attendance.deleteAttendanceRecord(audit, other.id);
  }
  await assert.rejects(attendance.createAttendanceRecord(employee, { ...input, recordType: 'late' }), /พนักงานบันทึกได้เฉพาะ/);
  await assert.rejects(attendance.createAttendanceRecord(audit, { ...input, recordType: 'meeting_leave' }), /Audit/);
  assert.deepEqual(await attendance.getAttendancePayrollImpact('B', '2026-10'), before);
  f.sqlite.close();
});


test('submission counts use work date across midnight, employee scope and individual targets without writing reviews', async () => {
  const f = fixture();
  await f.saveWorkTarget(hr, { month: '2026-10', targetPerDay: 3 });
  await f.saveEmployeeWorkTarget(hr, { employeeId: 'B', effectiveDate: '2026-10-03', targetPerDay: 1 });
  f.sqlite.exec(`INSERT INTO hr_work_submissions VALUES
    ('A','2026-10-03','new','2026-10-03 08:00:00'),
    ('A','2026-10-03','301','2026-10-03 09:00:00'),
    ('A','2026-10-03','301_new','2026-10-04 01:00:00'),
    ('A','2026-10-04','new','2026-10-03 08:00:00'),
    ('B','2026-10-03','new','2026-10-04 01:00:00'),
    (NULL,'2026-10-03','new','2026-10-04 01:00:00');`);
  const data = await f.getWorkAuditData(hr, '2026-10-03');
  assert.deepEqual(data.rows.map(r => [r.systemSubmittedCount, r.submittedCount, r.targetCount, r.resultStatus]),
    [[3,3,3,'complete'],[1,1,1,'complete'],[0,0,3,'none']]);
  assert.equal(data.summary.unreviewed, 3);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM hr_daily_work_reviews').get().count, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM hr_attendance_records').get().count, 0);
  assert.deepEqual(f.payroll, []);
  const own = await f.getWorkAuditData({ ...hr, role: 'employee', employeeId: 'B' }, '2026-10-03');
  assert.deepEqual(own.rows.map(r => [r.id, r.systemSubmittedCount]), [['B',1]]);
  assert.equal((await f.getWorkAuditData(hr, '2026-10-04')).rows[0].systemSubmittedCount, 1);
  await f.confirmDailyWork(hr, {reviewDate: '2026-10-03', rows: []});
  f.sqlite.exec("INSERT INTO hr_work_submissions VALUES ('A','2026-10-03','new','2026-10-04 01:30:00')");
  const saved = (await f.getWorkAuditData(hr, '2026-10-03')).rows[0];
  assert.equal(saved.submittedCount, 3);
  assert.equal(saved.systemSubmittedCount, 4);
  await f.confirmDailyWork(hr, {reviewDate: '2026-10-03', rows: []});
  assert.equal((await f.getWorkAuditData(hr, '2026-10-03')).rows[0].submittedCount, 3);
  await assert.rejects(f.confirmDailyWork(hr, {reviewDate: '2026-10-03', rows: [{employeeId:'A',submittedCount:4}]}), /เหตุผลการแก้ไข/);
  f.sqlite.close();
});
