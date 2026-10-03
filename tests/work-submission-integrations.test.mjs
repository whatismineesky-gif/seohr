import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import ts from 'typescript';
function load(path, require) { const exports={};new Function('require','exports',ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,exports);return exports; }
function setup() {
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(`PRAGMA foreign_keys=ON;CREATE TABLE hr_employees(id TEXT PRIMARY KEY,team TEXT);CREATE TABLE hr_system_users(menu_permissions TEXT);INSERT INTO hr_employees VALUES('A','ทีม 1'),('B','ทีม 2');`);
 for(const file of ['1022_work_submissions.sql','1023_work_submission_integrations.sql'])sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const db={prepare(sql){let args=[];const statement={bind(...values){args=values;return statement;},first(){return sqlite.prepare(sql).get(...args)??null;},all(){return {results:sqlite.prepare(sql).all(...args)};},run(){const r=sqlite.prepare(sql).run(...args);return {meta:{last_row_id:Number(r.lastInsertRowid)}};}};return statement;},batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>s.all());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const api=load('../db/work-submission-integrations.ts',()=>({getD1:()=>db}));return {sqlite,api};
}
const hr={role:'hr',email:'HR@TEST'},now=new Date('2026-10-03T06:00:00Z');
const status=value=>error=>error.status===value;
test('API keys are hashed, scoped, expiring, revocable and limited atomically',async()=>{
 const {sqlite,api}=setup();
 await assert.rejects(api.createIntegrationKey({role:'employee'},{name:'x',scope:'all'},now),status(403));
 await assert.rejects(api.listIntegrationKeys({role:'audit'}),status(403));
 await assert.rejects(api.revokeIntegrationKey({role:'employee'},1),status(403));
 for(const input of [{name:'',scope:'all'},{name:'x',scope:'mine'},{name:'x',scope:'team',team:'missing'},{name:'x',scope:'team'},{name:'x',scope:'all',expiresOn:'2026-02-30'},{name:'x',scope:'all',expiresOn:'2026-10-02'}])await assert.rejects(api.createIntegrationKey(hr,input,now),status(400));
 const key=await api.createIntegrationKey(hr,{name:'Reports',scope:'team',team:'ทีม 1',expiresOn:'2026-10-03'},now);
 assert.match(key.token,/^hrws_[a-f0-9]{64}$/);assert.equal(key.expiresAt,'2026-10-03T16:59:59.000Z');
 const stored=sqlite.prepare('SELECT * FROM hr_integration_api_keys').get();assert.match(stored.token_hash,/^[a-f0-9]{64}$/);assert.equal(stored.created_by_email,'hr@test');assert.equal(Object.values(stored).includes(key.token),false);
 const list=await api.listIntegrationKeys(hr);assert.equal(JSON.stringify(list).includes(key.token),false);assert.equal(JSON.stringify(list).includes(stored.token_hash),false);
 for(const header of [null,'Bearer fake',`Bearer ${key.token}x`,`Bearer ${key.token}, extra`])await assert.rejects(api.authorizeIntegration(header,now),status(401));
 const calls=await Promise.allSettled(Array.from({length:61},()=>api.authorizeIntegration(`Bearer ${key.token}`,now)));
 assert.equal(calls.filter(r=>r.status==='fulfilled').length,60);assert.equal(calls.find(r=>r.status==='rejected').reason.status,429);assert.equal(calls.find(r=>r.status==='rejected').reason.retryAfter,60);
 const allowed=await api.authorizeIntegration(`Bearer ${key.token}`,new Date(now.getTime()+60000));assert.equal(allowed.team,'ทีม 1');assert.equal(allowed.scope,'team');
 await assert.rejects(api.authorizeIntegration(`Bearer ${key.token}`,new Date(key.expiresAt)),status(401));
 await api.revokeIntegrationKey(hr,key.id);await assert.rejects(api.authorizeIntegration(`Bearer ${key.token}`,now),status(401));assert.equal((await api.listIntegrationKeys(hr)).keys[0].revokedAt!==null,true);
 await assert.rejects(api.revokeIntegrationKey(hr,key.id),status(404));
 const other=await api.createIntegrationKey(hr,{name:'Other',scope:'all'},now);assert.notEqual(other.token,key.token);assert.equal((await api.authorizeIntegration(`Bearer ${other.token}`,now)).scope,'all');
});
test('integration reads filter both dates, Bangkok midnight, team scope, paging and safe response fields',async()=>{
 const {sqlite,api}=setup();const insert=sqlite.prepare(`INSERT INTO hr_work_submissions(keyword,website,work_date,parent_website,submission_type,employee_id,team,author_email,author_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`);
 insert.run('A','a.com','2026-10-03','parent.com','new','A','ทีม 1','secret-a@test','เอ','2026-10-02 16:59:59');
 insert.run('B','b.com','2026-10-03','parent.com','301','B','ทีม 2','secret-b@test','บี','2026-10-02 17:00:00');
 insert.run('C','c.com','2026-10-02','parent.com','301_new','A','ทีม 1','secret-a@test','เอ','2026-10-03 16:59:59');
 insert.run('D','d.com','2026-10-03','parent.com','new','A','ทีม 1','secret-a@test','เอ','2026-10-03 17:00:00');
 const all={scope:'all',team:''},team={scope:'team',team:'ทีม 1'};
 const get=(key,query)=>api.getIntegrationSubmissions(key,new URLSearchParams(query));
 let result=await get(all,'date=2026-10-03');assert.deepEqual(result.items.map(r=>r.id),[1,2,4]);assert.equal(result.total,3);assert.equal(result.items[0].submittedAt,'2026-10-02T16:59:59.000Z');assert.equal(result.items[0].updatedAt,result.items[0].submittedAt);assert.equal(result.items[0].employeeId,'A');assert.equal(result.items[0].name,'เอ');assert.equal(result.items[1].typeLabel,'เว็บ 301');assert.equal(JSON.stringify(result).includes('secret-'),false);
 result=await get(all,'submittedDate=2026-10-03');assert.deepEqual(result.items.map(r=>r.id),[2,3]);assert.equal(result.timezone,'Asia/Bangkok');
 result=await get(all,'date=2026-10-03&submittedDate=2026-10-03');assert.deepEqual(result.items.map(r=>r.id),[2]);
 result=await get(team,'submittedDate=2026-10-03');assert.deepEqual(result.items.map(r=>r.id),[3]);
 await assert.rejects(get(team,'date=2026-10-03&team=ทีม 2'),status(403));
 result=await get(all,"date=2026-10-03&team=' OR 1=1 --");assert.equal(result.total,0);
 for(const query of ['', 'date=', 'date=2026-02-30','submittedDate=invalid','date=2026-10-03&page=0','date=2026-10-03&page=1.5','date=2026-10-03&scope=all','date=2026-10-03&date=2026-10-02','date=2026-10-03&team='])await assert.rejects(get(all,query),status(400));
 for(let i=0;i<101;i++)insert.run(String(i),'x.com','2026-10-01','p.com','new',null,'','secret@test','Unlinked','2026-10-01 00:00:00');
 result=await get(all,'date=2026-10-01');assert.equal(result.items.length,100);assert.equal(result.total,101);assert.equal(result.nextPage,2);assert.equal(result.hasMore,true);assert.equal(result.totalPages,2);
 const second=await get(all,'date=2026-10-01&page=2');assert.equal(second.items.length,1);assert.equal(second.nextPage,null);assert.equal(second.hasMore,false);assert.ok(result.items.every(r=>r.id!==second.items[0].id));
 result=await get({scope:'team',team:''},'date=2026-10-01&team=__unassigned__');assert.equal(result.total,101);
 sqlite.prepare("UPDATE hr_work_submissions SET keyword='edited',updated_at='2026-10-03 02:00:00' WHERE id=2").run();result=await get(all,'submittedDate=2026-10-03');assert.equal(result.items[0].keyword,'edited');assert.equal(result.items[0].updatedAt,'2026-10-03T02:00:00.000Z');
});
test('external route uses bearer authentication only and returns private, read-only responses',async()=>{
 const {api}=setup();const route=load('../app/api/integrations/work-submissions/route.ts',()=>api);
 for(const method of ['POST','PUT','PATCH','DELETE']) { const response=route[method]();assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET'); }
 const response=await route.GET(new Request('https://example.test/api/integrations/work-submissions?date=2026-10-03'));
 assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('www-authenticate'),'Bearer');
 const key=await api.createIntegrationKey(hr,{name:'External',scope:'all'});
 const success=await route.GET(new Request('https://example.test/api/integrations/work-submissions?date=2026-10-03',{headers:{authorization:`Bearer ${key.token}`}}));assert.equal(success.status,200);assert.equal((await success.json()).items.length,0);
 const noDate=await route.GET(new Request('https://example.test/api/integrations/work-submissions',{headers:{authorization:`Bearer ${key.token}`}}));assert.equal(noDate.status,400);
 const blocked=load('../app/api/integration-keys/route.ts',path=>path.includes('/auth')?{authorizeApi:async()=>({ok:false,response:new Response(null,{status:403})})}:api);
 assert.equal((await blocked.GET(new Request('https://example.test'))).status,403);assert.equal((await blocked.POST(new Request('https://example.test',{method:'POST'}))).status,403);
});
