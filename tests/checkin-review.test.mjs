import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
function load(path,require=()=>({})) {const result={};new Function('require','exports',ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(require,result);return result;}
const helper=load('../lib/checkin-review.ts');
const config={systemEnabled:true,meetingLateAfter:'13:05'};
const day='2026-10-05';
const before=new Date('2026-10-05T06:05:59Z'),after=new Date('2026-10-05T06:06:00Z');
test('missing check-in becomes late only after Bangkok cutoff; past dates, disabled system and checked employees are distinguished',()=>{
 assert.equal(helper.dailyCheckinStatus(day,config,undefined,[],before),'waiting');
 assert.equal(helper.dailyCheckinStatus(day,config,undefined,[],after),'late');
 assert.equal(helper.dailyCheckinStatus('2026-10-04',config,undefined,[],before),'late');
 assert.equal(helper.dailyCheckinStatus(day,{...config,systemEnabled:false},undefined,[],after),'disabled');
 assert.equal(helper.dailyCheckinStatus(day,config,{meeting_started_at:'2026-10-05T06:00:00Z',meeting_late:0},[],after),'checked');
 assert.equal(helper.dailyCheckinStatus(day,config,{meeting_started_at:'2026-10-05T06:10:00Z',meeting_late:1},[],after),'late');
});
test('leave, absence and HR confirmed work override late; submission audit does not exempt check-in',()=>{
 for(const type of ['absence','meeting_leave']) assert.equal(helper.dailyCheckinStatus(day,config,{meeting_started_at:'time',meeting_late:1},[{record_type:type,source_type:'manual'}],after),'exempt');
 assert.equal(helper.dailyCheckinStatus(day,config,undefined,[{record_type:'working',source_type:'manual'}],after),'working');
 assert.equal(helper.dailyCheckinStatus(day,config,undefined,[{record_type:'absence',source_type:'work_audit'}],after),'late');
 for(const type of ['admin','true'])assert.equal(helper.dailyCheckinStatus(day,config,undefined,[{record_type:type}],after),'late');
});
test('review dates reject invalid, impossible and future dates and default to Bangkok day',()=>{
 assert.equal(helper.reviewDate('',new Date('2026-10-05T18:00:00Z')).date,'2026-10-06');
 for(const date of ['2026-02-30','2026-13-01','2026-10-07','bad'])assert.throws(()=>helper.reviewDate(date,after));
});
function checkin(db,attendance={}) {return load('../db/checkin.ts',name=>name==='./index'?{getD1:()=>db}:name==='./attendance'?attendance:name.includes('checkin-review')?helper:name.includes('dashboard-month')?{isoEmployeeDate:v=>String(v??'')}:{});}
test('HR review denies other roles before database reads or writes',async()=>{
 const api=checkin({prepare(){throw Error('must not query');}});
 for(const role of ['employee','audit']) {await assert.rejects(api.getDailyCheckinReview({role},day),/เฉพาะ HR/);await assert.rejects(api.saveDailyCheckinReview({role},{recordDate:day}),/เฉพาะ HR/);}
});
test('daily review joins selected-date records and excludes staff outside employment dates without writes',async()=>{
 const now=new Date('2026-10-05T06:06:00Z');
 const db={prepare(sql){let date;return {bind(v){date=v;return this;},async run(){assert.match(sql,/hr_checkin_config/);return {};},async first(){return {system_enabled:1,meeting_late_after:'13:05'};},async all(){if(sql.includes('FROM hr_employees'))return {results:[{id:'A',nickname:'A',status:'ยังทำงานอยู่'},{id:'B',nickname:'B',status:'ลาออก',end_date:'2026-10-04'},{id:'C',nickname:'C',start_date:'2026-10-06'},{id:'D',nickname:'D',status:'ลาออก',end_date:day}]};assert.equal(date,day);return {results:sql.includes('hr_employee_checkins')?[]:[{id:1,employee_id:'A',record_type:'absence',source_type:'manual',reason:'leave'}]};}};}};
 const result=await checkin(db).getDailyCheckinReview({role:'hr'},day,now);
 assert.deepEqual(result.items.map(i=>[i.employeeId,i.status]),[['A','exempt'],['D','late']]);
});
test('HR save refuses foreign employee/date and submission-audit records, and keeps actor from authenticated user',async()=>{
 const user={role:'hr',email:'hr@example.test'};let record={employee_id:'B',record_date:day,source_type:'manual'},saved;
 const db={prepare(sql){return {bind(){return this;},async first(){if(sql.includes('FROM hr_employees'))return {id:'A',status:'ยังทำงานอยู่'};if(sql.includes('WHERE id = ?'))return record;return null;}};}};
 const api=checkin(db,{updateAttendanceRecord:async(actor,input)=>{saved={actor,input};return {id:1};}});
 const input={id:1,employeeId:'A',recordDate:day,recordType:'working',reason:'urgent',email:'forged@example.test'};
 await assert.rejects(api.saveDailyCheckinReview(user,input),/ไม่มีสิทธิ์/);
 for(const other of [{employee_id:'A',record_date:'2026-10-04',source_type:'manual'},{employee_id:'A',record_date:day,source_type:'work_audit'}]){record=other;await assert.rejects(api.saveDailyCheckinReview(user,input),/ไม่มีสิทธิ์/);}
 record={employee_id:'A',record_date:day,source_type:'checkin'};await api.saveDailyCheckinReview(user,input);assert.equal(saved.actor,user);assert.equal(saved.input.recordType,'working');assert.equal(saved.input.recordDate,day);
});
test('review API applies HR authorization to both read and write before any work',async()=>{
 let calls=0;const route=load('../app/api/checkin/review/route.ts',name=>name.includes('/auth')?{authorizeApi:async(_r,options)=>{assert.deepEqual(options,{roles:['hr'],anyPermissions:['checkin']});return {ok:false,response:new Response(null,{status:403})};}}:{getDailyCheckinReview(){calls++;},saveDailyCheckinReview(){calls++;}});
 assert.equal((await route.GET(new Request('https://example.test/api/checkin/review'))).status,403);
 assert.equal((await route.POST(new Request('https://example.test/api/checkin/review',{method:'POST'}))).status,403);assert.equal(calls,0);
});
