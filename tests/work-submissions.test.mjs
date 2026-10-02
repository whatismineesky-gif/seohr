import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import ts from 'typescript';

test('submission ownership, team filters, pagination and validation use authenticated identity', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE hr_employees(id TEXT PRIMARY KEY,nickname TEXT,team TEXT);
    CREATE TABLE hr_system_users(email TEXT,menu_permissions TEXT);
    INSERT INTO hr_employees VALUES('A','เอ','ทีม 1'),('B','บี','ทีม 2');
    INSERT INTO hr_system_users VALUES('a@test','["dashboard","attendance"]'),('b@test','[]'),('c@test','["dashboard","submissions"]');`);
  sqlite.exec(readFileSync(new URL('../migrations/1022_work_submissions.sql', import.meta.url), 'utf8'));
  assert.deepEqual(JSON.parse(sqlite.prepare('SELECT menu_permissions FROM hr_system_users WHERE email=?').get('a@test').menu_permissions), ['dashboard','attendance','submissions']);
  assert.equal(sqlite.prepare('SELECT menu_permissions FROM hr_system_users WHERE email=?').get('b@test').menu_permissions, '[]');
  assert.deepEqual(JSON.parse(sqlite.prepare('SELECT menu_permissions FROM hr_system_users WHERE email=?').get('c@test').menu_permissions), ['dashboard','submissions']);
  const db = { prepare(sql) { let args = []; const stmt = {
    bind(...values) { args = values; return stmt; },
    first() { return sqlite.prepare(sql).get(...args) ?? null; },
    all() { return { results: sqlite.prepare(sql).all(...args) }; },
    run() { const r = sqlite.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid) } }; },
  }; return stmt; } };
  const code = ts.transpileModule(readFileSync(new URL('../db/work-submissions.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const api = {}; new Function('require','exports',code)(() => ({ getD1: () => db }), api);
  const a = { email: 'A@test', employeeId: 'A', displayName: 'A' };
  const b = { email: 'b@test', employeeId: 'B', displayName: 'B' };
  const input = { keyword: ' คีย์ไทย ', website: 'example.com', date: '2026-10-03', parentWebsite: 'parent.com', type: 'new', employeeId: 'B', team: 'ทีม 2', author_email: 'b@test' };
  await api.createWorkSubmission(a, input);
  await api.createWorkSubmission(b, { ...input, type: '301', date: '2026-10-02' });
  const saved = sqlite.prepare('SELECT * FROM hr_work_submissions WHERE id=1').get();
  assert.equal(saved.author_email, 'a@test'); assert.equal(saved.employee_id, 'A'); assert.equal(saved.team, 'ทีม 1'); assert.equal(saved.keyword, 'คีย์ไทย');
  let result = await api.getWorkSubmissions(a, new URLSearchParams());
  assert.equal(result.total, 1); assert.equal(result.items[0].type, 'new'); assert.equal(result.currentUser.team, 'ทีม 1');
  result = await api.getWorkSubmissions(a, new URLSearchParams('scope=team&team=ทีม 2'));
  assert.equal(result.total, 1); assert.equal(result.items[0].type, '301');
  result = await api.getWorkSubmissions(a, new URLSearchParams('scope=all'));
  assert.equal(result.total, 2); assert.equal(result.items[0].date, '2026-10-03');
  for (const bad of [{date:'2026-02-30'}, {date:'not-a-date'}, {type:'other'}, {keyword:''}, {website:'x'.repeat(501)}, {parentWebsite:''}]) {
    await assert.rejects(api.createWorkSubmission(a, { ...input, ...bad }));
  }
  await assert.rejects(api.createWorkSubmission(a, null));
  await assert.rejects(api.getWorkSubmissions(a, new URLSearchParams('scope=team')));
  await assert.rejects(api.getWorkSubmissions(a, new URLSearchParams('scope=wrong')));
  await assert.rejects(api.getWorkSubmissions(a, new URLSearchParams('page=-1')));
  result = await api.getWorkSubmissions(a, new URLSearchParams("scope=team&team=' OR 1=1 --"));
  assert.equal(result.total, 0);
  const unlinked = { email:'hr@test',employeeId:null,displayName:'HR' };
  await api.createWorkSubmission(unlinked, { ...input, type:'301_new' });
  result = await api.getWorkSubmissions(unlinked, new URLSearchParams('scope=team&team=__unassigned__'));
  assert.equal(result.total, 1); assert.equal(result.items[0].type, '301_new');
  for (let i=0; i<100; i++) await api.createWorkSubmission(a, { ...input, keyword:String(i) });
  result = await api.getWorkSubmissions(a, new URLSearchParams());
  assert.equal(result.total, 101); assert.equal(result.items.length, 100);
  const second = await api.getWorkSubmissions(a, new URLSearchParams('page=2'));
  assert.equal(second.items.length, 1); assert.equal(second.items[0].id, 1);
  assert.equal(result.items.some(row=>row.id===second.items[0].id), false);
  sqlite.close();
});
