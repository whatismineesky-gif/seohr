import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import ts from 'typescript';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE hr_employees(id TEXT PRIMARY KEY, nickname TEXT, team TEXT);
    CREATE TABLE hr_system_users(email TEXT, menu_permissions TEXT, display_name TEXT, employee_id TEXT, updated_at TEXT);
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
      run() { if (sql.startsWith('DELETE') || sql.startsWith('UPDATE hr_work_submissions')) beforeDelete(); const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    };
    return stmt;
  } };
  const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const period = {};
  new Function('exports', compile('../lib/work-submission-window.ts'))(period);
  const permissions = {}; new Function('exports', ts.transpileModule(readFileSync(new URL('../lib/work-submission-permissions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(permissions);
  const api = {};
  new Function('require','exports',compile('../db/work-submissions.ts'))(name => name.includes('work-submission-permissions') ? permissions : name.includes('work-submission-window') ? period : { getD1: () => db }, api);
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

const editor = {email:'b@test',employeeId:'B',role:'employee'};
const editInput = {id:1,keyword:'edited',website:'edited.test',parentWebsite:'parent.test',date:'2026-10-03',type:'301'};
function allowEditor(f, raw='["submissions","work_submission_editor"]') {
  f.sqlite.prepare('INSERT INTO hr_system_users(email,menu_permissions,display_name,employee_id) VALUES (?,?,?,?)').run('b@test',raw,'บี','B');
}

test('explicit editor can edit/delete foreign work, list exposes controls, and author metadata stays unchanged', async () => {
  const f=fixture();allowEditor(f);
  let list=await f.api.getWorkSubmissions(editor,new URLSearchParams('scope=all'));
  assert.equal(list.items[0].canEdit,true);
  await f.api.editWorkSubmission(editor,{...editInput,author_email:'b@test',employeeId:'B',team:'ทีม 2'},clock('2026-10-03T07:00:00Z'));
  const row=f.sqlite.prepare('SELECT * FROM hr_work_submissions WHERE id=1').get();
  assert.equal(row.keyword,'edited');assert.equal(row.author_email,'a@test');assert.equal(row.employee_id,'A');
  f.sqlite.exec(`UPDATE hr_system_users SET menu_permissions='["submissions"]'`);
  list=await f.api.getWorkSubmissions(editor,new URLSearchParams('scope=all'));
  assert.equal(list.items[0].canEdit,false);
  await assert.rejects(f.api.editWorkSubmission(editor,editInput,clock('2026-10-03T07:00:00Z')),/ไม่มีสิทธิ์/);
  await assert.rejects(f.api.deleteWorkSubmission(editor,{id:1},clock('2026-10-03T07:00:00Z')),/ไม่มีสิทธิ์/);
  f.sqlite.exec(`UPDATE hr_system_users SET menu_permissions='["submissions","work_submission_editor"]'`);
  await f.api.deleteWorkSubmission(editor,{id:1},clock('2026-10-03T07:00:00Z'));
  assert.equal(f.count(),0);f.sqlite.close();
});

test('editor edits and deletes at any time; malformed or revoked editor rights are denied', async () => {
  for (const operation of ['edit','delete']) {
    for(const raw of ['broken work_submission_editor','{"work_submission_editor":true}','["work_submission_editor_extra"]']) {
      const f=fixture();allowEditor(f,raw);
      await assert.rejects(operation==='edit'?f.api.editWorkSubmission(editor,editInput,clock('2026-10-03T07:00:00Z')):f.api.deleteWorkSubmission(editor,{id:1},clock('2026-10-03T07:00:00Z')),/ไม่มีสิทธิ์/);f.sqlite.close();
    }
    for(const mode of ['deadline','permission-revoked','backfill-wrong-scope','backfill-allowed','backfill-revoked']) {
      const f=fixture();allowEditor(f);
      const date=mode.startsWith('backfill')?'2026-10-01':'2026-10-03';
      if(mode.startsWith('backfill'))grant(f,'employee',mode==='backfill-wrong-scope'?'A':'B');
      f.setTime('2026-10-04T02:00:00.000Z');
      f.beforeDelete(()=>{
        if(mode==='deadline')f.setTime('2026-10-04T03:00:00.000Z');
        if(mode==='permission-revoked')f.sqlite.exec(`UPDATE hr_system_users SET menu_permissions='["submissions"]'`);
        if(mode==='backfill-revoked')f.sqlite.exec("UPDATE hr_work_submission_backfill_grants SET revoked_at='2026-10-04T02:00:00Z'");
      });
      const action=()=>operation==='edit'?f.api.editWorkSubmission(editor,{...editInput,date},clock('2026-10-04T02:00:00Z')):f.api.deleteWorkSubmission(editor,{id:1},clock('2026-10-04T02:00:00Z'));
      const allowed = mode!=='permission-revoked';
      if(allowed)await action();else await assert.rejects(action);
      if(operation==='edit')assert.equal(f.sqlite.prepare('SELECT keyword FROM hr_work_submissions').get().keyword,allowed?'edited':'คีย์');
      else assert.equal(f.count(),allowed?0:1);
      f.sqlite.close();
    }
  }
});

test('only HR can configure per-account editor flag; grant and revoke preserve menu access and handle empty defaults', async () => {
  const f=fixture();allowEditor(f,'["submissions","attendance"]');
  const hr={email:'hr@test',role:'hr'};
  for(const role of ['employee','audit']) {
    await assert.rejects(f.api.getWorkSubmissionEditorConfig({...hr,role}),/เฉพาะ HR/);
    await assert.rejects(f.api.saveWorkSubmissionEditorConfig({...hr,role},{email:'b@test',enabled:true}),/เฉพาะ HR/);
  }
  for(const input of [{email:'missing@test',enabled:true},{email:'b@test',enabled:'true'},{}])await assert.rejects(f.api.saveWorkSubmissionEditorConfig(hr,input));
  await f.api.saveWorkSubmissionEditorConfig(hr,{email:'B@test',enabled:true});
  assert.deepEqual(JSON.parse(f.sqlite.prepare('SELECT menu_permissions FROM hr_system_users').get().menu_permissions),['submissions','attendance','work_submission_editor']);
  assert.equal((await f.api.getWorkSubmissionEditorConfig(hr)).users[0].enabled,true);
  await f.api.saveWorkSubmissionEditorConfig(hr,{email:'b@test',enabled:false});
  assert.deepEqual(JSON.parse(f.sqlite.prepare('SELECT menu_permissions FROM hr_system_users').get().menu_permissions),['submissions','attendance']);
  f.sqlite.exec("UPDATE hr_system_users SET menu_permissions='[]'");
  await f.api.saveWorkSubmissionEditorConfig(hr,{email:'b@test',enabled:true});
  await f.api.saveWorkSubmissionEditorConfig(hr,{email:'b@test',enabled:false});
  assert.equal(f.sqlite.prepare('SELECT menu_permissions FROM hr_system_users').get().menu_permissions,'[]');f.sqlite.close();
});

test('editor configuration API requires HR for both reading and saving', async()=>{
  const compile=ts.transpileModule(readFileSync(new URL('../app/api/work-submissions/editors/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  let called=false;
  const blocked={};
  new Function('require','exports',compile)(name=>name.includes('/auth')?{authorizeApi:async(_req,options)=>{assert.deepEqual(options,{anyPermissions:['submissions'],roles:['hr']});return {ok:false,response:new Response(null,{status:403})};}}:{getWorkSubmissionEditorConfig:()=>{called=true;},saveWorkSubmissionEditorConfig:()=>{called=true;}},blocked);
  for(const method of ['GET','POST'])assert.equal((await blocked[method](new Request('https://test/api/work-submissions/editors',{method}))).status,403);
  assert.equal(called,false);
});

test('editor creates batches on past and future dates; ordinary accounts remain restricted and revocation takes effect', async()=>{
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE hr_employees(id TEXT PRIMARY KEY,nickname TEXT,team TEXT);
    CREATE TABLE hr_system_users(email TEXT,menu_permissions TEXT);
    INSERT INTO hr_employees VALUES ('B','บี','ทีม 2');
    INSERT INTO hr_system_users VALUES ('b@test','["submissions","work_submission_editor"]');
    CREATE TABLE hr_notifications(id INTEGER PRIMARY KEY, employee_id TEXT,source_kind TEXT,source_id INTEGER,actor_email TEXT,actor_user_id TEXT,actor_name TEXT,event_date TEXT,action TEXT,details TEXT);`);
  for(const migration of ['1022_work_submissions.sql','1023_work_submission_integrations.sql','1026_work_submission_backfill.sql'])sqlite.exec(readFileSync(new URL(`../migrations/${migration}`,import.meta.url),'utf8'));
  const db={batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}},prepare(sql){let args=[];const stmt={bind(...values){args=values;return stmt;},first(){return sqlite.prepare(sql).get(...args)??null;},all(){return {results:sqlite.prepare(sql).all(...args)};},run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}};return stmt;}};
  const compile=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const period={},permissions={},api={};new Function('exports',compile('../lib/work-submission-window.ts'))(period);new Function('exports',compile('../lib/work-submission-permissions.ts'))(permissions);
  new Function('require','exports',compile('../db/work-submissions.ts'))(name=>name.includes('work-submission-permissions')?permissions:name.includes('work-submission-window')?period:{getD1:()=>db},api);
  const now=clock('2026-10-06T04:00:00Z');
  const items=[{...editInput,date:'2026-10-01'},{...editInput,date:'2026-10-07'}];
  assert.equal((await api.createWorkSubmission(editor,{items},now)).count,2);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM hr_work_submissions').get().n,2);
  assert.equal(JSON.parse(sqlite.prepare('SELECT details FROM hr_notifications').get().details).count,2);
  await assert.rejects(api.createWorkSubmission({...editor,email:'other@test'}, {items},now));
  await assert.rejects(api.createWorkSubmission(editor,{items:[{...editInput,date:'2026-02-30'}]},now));
  sqlite.exec(`UPDATE hr_system_users SET menu_permissions='["submissions"]'`);
  await assert.rejects(api.createWorkSubmission(editor,{items},now));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM hr_work_submissions').get().n,2);sqlite.close();
});
