import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import ts from 'typescript';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE hr_employees(id TEXT PRIMARY KEY, nickname TEXT, team TEXT);
    CREATE TABLE hr_system_users(email TEXT, menu_permissions TEXT);
    INSERT INTO hr_employees VALUES ('A','เอ','ทีม 1'),('B','บี','ทีม 2');`);
  for (const migration of ['1022_work_submissions.sql','1023_work_submission_integrations.sql','1026_work_submission_backfill.sql']) {
    sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  }
  sqlite.exec(`INSERT INTO hr_work_submissions (keyword,website,work_date,parent_website,submission_type,employee_id,author_email,author_name)
    VALUES ('คีย์','example.com','2026-10-03','parent.com','new','A','a@test','เอ');`);
  let databaseNow = '2026-10-03T07:00:00.000Z';
  let beforeDelete = () => {};
  sqlite.function('strftime', { varargs: true }, () => databaseNow);
  const db = { prepare(sql) {
    let args = [];
    const stmt = {
      bind(...values) { args = values; return stmt; },
      first() { return sqlite.prepare(sql).get(...args) ?? null; },
      all() { return { results: sqlite.prepare(sql).all(...args) }; },
      run() { if (sql.startsWith('DELETE')) beforeDelete(); const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    };
    return stmt;
  } };
  const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const period = {};
  new Function('exports', compile('../lib/work-submission-window.ts'))(period);
  const api = {};
  new Function('require','exports',compile('../db/work-submissions.ts'))(name => name.includes('work-submission-window') ? period : { getD1: () => db }, api);
  return { sqlite, api, setTime(time) { databaseNow = time; }, beforeDelete(fn) { beforeDelete = fn; }, count() { return sqlite.prepare('SELECT COUNT(*) AS n FROM hr_work_submissions').get().n; } };
}
const owner = {email:'A@test', employeeId:'A'};
const clock = time => () => new Date(time);

test('delete allows own work only from 14:00 inclusive until 10:00 exclusive, using stored work date', async () => {
  for (const [time, allowed] of [
    ['2026-10-03T06:59:59.999Z',false], ['2026-10-03T07:00:00.000Z',true],
    ['2026-10-04T02:59:59.999Z',true], ['2026-10-04T03:00:00.000Z',false],
  ]) {
    const f = fixture(); f.setTime(time);
    const action = () => f.api.deleteWorkSubmission(owner, { id:1, date:'2026-10-04', author_email:'b@test' }, clock(time));
    if (allowed) { assert.deepEqual(await action(), {id:1}); assert.equal(f.count(),0); }
    else { await assert.rejects(action); assert.equal(f.count(),1); }
    f.sqlite.close();
  }
});

test('delete rejects foreign, missing and malformed IDs, including HR deleting another author', async () => {
  const f = fixture();
  for (const user of [{email:'b@test',employeeId:'B'}, {email:'hr@test',role:'hr'}]) {
    await assert.rejects(f.api.deleteWorkSubmission(user,{id:1},clock('2026-10-03T07:00:00Z')), /ไม่มีสิทธิ์/);
  }
  for (const id of [0,-1,1.5,'bad',9999]) await assert.rejects(f.api.deleteWorkSubmission(owner,{id},clock('2026-10-03T07:00:00Z')));
  await assert.rejects(f.api.deleteWorkSubmission(owner,null));
  assert.equal(f.count(),1); f.sqlite.close();
});

function grant(f, scope='all', target='') {
  f.sqlite.exec("UPDATE hr_work_submissions SET work_date='2026-10-01'");
  f.sqlite.prepare(`INSERT INTO hr_work_submission_backfill_grants
    (start_date,end_date,scope,employee_id,team,closes_at,reason,created_by_email)
    VALUES ('2026-10-01','2026-10-02',?,?,?,'2026-10-04T03:00:00.000Z','test','hr@test')`)
    .run(scope,scope==='employee'?target:'',scope==='team'?target:'');
}

test('backfill deletion respects all, employee and team scope, expiry, revocation and stored date', async () => {
  for (const [scope,target,allowed] of [['all','',true],['employee','A',true],['employee','B',false],['team','ทีม 1',true],['team','ทีม 2',false]]) {
    const f = fixture(); grant(f,scope,target); f.setTime('2026-10-04T02:00:00.000Z');
    const action=()=>f.api.deleteWorkSubmission(owner,{id:1},clock('2026-10-04T02:00:00Z'));
    if (allowed) await action(); else await assert.rejects(action);
    assert.equal(f.count(),allowed?0:1); f.sqlite.close();
  }
  for (const mode of ['expired','revoked','wrong-date']) {
    const f=fixture(); grant(f); f.setTime('2026-10-04T03:00:00.000Z');
    if(mode==='revoked') f.sqlite.exec("UPDATE hr_work_submission_backfill_grants SET revoked_at='2026-10-04T01:00:00Z'");
    if(mode==='wrong-date') f.sqlite.exec("UPDATE hr_work_submissions SET work_date='2026-09-30'");
    await assert.rejects(f.api.deleteWorkSubmission(owner,{id:1},clock(mode==='expired'?'2026-10-04T03:00:00Z':'2026-10-04T02:00:00Z')));
    assert.equal(f.count(),1); f.sqlite.close();
  }
});

test('database rejects a deadline crossed, grant revoked or work date changed immediately before deletion', async () => {
  for (const mode of ['deadline','revoked','date-changed']) {
    const f = fixture();
    if(mode==='revoked') grant(f);
    f.beforeDelete(() => {
      if(mode==='deadline') f.setTime('2026-10-04T03:00:00.000Z');
      if(mode==='revoked') f.sqlite.exec("UPDATE hr_work_submission_backfill_grants SET revoked_at='2026-10-04T02:00:00Z'");
      if(mode==='date-changed') f.sqlite.exec("UPDATE hr_work_submissions SET work_date='2026-09-30'");
    });
    await assert.rejects(f.api.deleteWorkSubmission(owner,{id:1},clock('2026-10-04T02:00:00Z')), /กรุณาโหลดข้อมูลใหม่/);
    assert.equal(f.count(),1); f.sqlite.close();
  }
  const f=fixture(); let ticks=0;
  await assert.rejects(f.api.deleteWorkSubmission(owner,{id:1},()=>new Date(ticks++ ? '2026-10-04T03:00:00Z':'2026-10-04T02:59:59.999Z')));
  assert.equal(f.count(),1); f.sqlite.close();
});

test('DELETE endpoint requires submission permission and passes authenticated identity to the database', async () => {
  const compile = () => ts.transpileModule(readFileSync(new URL('../app/api/work-submissions/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  let called = false;
  const blocked = {};
  new Function('require','exports',compile())(name=>name.includes('/auth') ? {authorizeApi:async()=>({ok:false,response:new Response(null,{status:403})})} : {deleteWorkSubmission:async()=>{called=true;}},blocked);
  assert.equal((await blocked.DELETE(new Request('https://example.test/api/work-submissions',{method:'DELETE'}))).status,403);
  assert.equal(called,false);
  const allowed = {};
  new Function('require','exports',compile())(name=>name.includes('/auth') ? {authorizeApi:async(_request,options)=>{assert.deepEqual(options,{anyPermissions:['submissions']});return {ok:true,access:{user:owner}};}} : {deleteWorkSubmission:async(user,input)=>{assert.equal(user,owner);assert.equal(input.id,1);return {id:1};}},allowed);
  const response=await allowed.DELETE(new Request('https://example.test/api/work-submissions',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id:1})}));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{id:1});
});
