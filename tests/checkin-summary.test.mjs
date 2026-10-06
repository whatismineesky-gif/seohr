import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
function load(path,require=()=>({})){const result={};new Function('require','exports',ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(require,result);return result;}
const month=load('../lib/dashboard-month.ts');
const helper=load('../lib/checkin-monthly-summary.ts',()=>month);
const clock=new Date('2026-10-06T03:29:00Z');
test('monthly attendance counts distinct days per status, includes all requested statuses, counts work days once, and sorts by team/name',()=>{
 const employees=[{id:'B',nickname:'Bob',team:'ทีม 10'},{id:'A',nickname:'Alice',team:'ทีม 2'}];
 const records=[['absence','2026-09-01'],['absence','2026-09-01'],['absence','2026-09-02'],['meeting_leave','2026-09-03'],['late','2026-09-03'],['late','2026-09-03'],['true','2026-09-04'],['admin','2026-09-05'],['working','2026-09-06'],['absence','2026-10-01']].map(([type,date])=>({employee_id:'A',record_type:type,record_date:date}));
 const report=helper.summarizeAttendance('2026-09',employees,records,clock);
 assert.equal(report.throughDate,'2026-09-30');assert.deepEqual(report.rows.map(r=>r.employeeId),['A','B']);
 assert.deepEqual(report.rows[0],{employeeId:'A',nickname:'Alice',team:'ทีม 2',calendarDays:30,absence:2,meetingLeave:1,late:1,trueDays:1,adminDays:1,workingDays:28});
 assert.equal(report.rows[1].workingDays,30);
});
test('current month stops at Bangkok today, employment dates bound each employee, and leap February has 29 days',()=>{
 const report=helper.summarizeAttendance('2026-10',[{id:'A',start_date:'04/10/2026'},{id:'B',status:'ลาออก',end_date:'2026-10-02'},{id:'C',start_date:'2026-10-07'},{id:'D',status:'ลาออก',end_date:'2026-09-30'}],[{employee_id:'A',record_type:'absence',record_date:'2026-10-07'}],clock);
 assert.equal(report.throughDate,'2026-10-06');assert.deepEqual(report.rows.map(r=>[r.employeeId,r.calendarDays,r.workingDays]),[['A',3,3],['B',2,2]]);
 assert.equal(helper.summarizeAttendance('2024-02',[{id:'A'}],[],clock).rows[0].workingDays,29);
 assert.throws(()=>helper.summarizeAttendance('2026-11',[],[],clock),/เดือนไม่เกิน/);
});
test('monthly database endpoint rejects non-HR before reading and queries records only for selected month',async()=>{
 let calls=0;
 const db={prepare(sql){calls++;let args;return {bind(...v){args=v;return this;},all(){if(sql.includes('hr_employees'))return {results:[{id:'A'}]};assert.deepEqual(args,['2026-09-01','2026-10-01']);return {results:[{employee_id:'A',record_type:'absence',record_date:'2026-09-02'}]};}};}};
 const api=load('../db/checkin-summary.ts',name=>name==='./index'?{getD1:()=>db}:name.includes('checkin-monthly-summary')?helper:month);
 for(const role of ['employee','audit'])await assert.rejects(api.getCheckinMonthlySummary({role},'2026-09',clock),/เฉพาะ HR/);
 assert.equal(calls,0);const report=await api.getCheckinMonthlySummary({role:'hr'},'2026-09',clock);assert.equal(report.rows[0].workingDays,29);
});
test('monthly report and export require HR, and XLSX preserves numeric counts and treats formula-looking names as text',async()=>{
 const XLSX=await import('xlsx');
 let permitted=false,calls=0;
 const report=helper.summarizeAttendance('2026-09',[{id:'001',nickname:'=SUM(1,1)',team:'ทีม 1'}],[{employee_id:'001',record_type:'late',record_date:'2026-09-03'}],clock);
 const route=load('../app/api/checkin/summary/route.ts',name=>name==='xlsx'?XLSX:name.includes('/auth')?{authorizeApi:async(_r,options)=>{assert.deepEqual(options,{roles:['hr'],anyPermissions:['checkin']});return permitted?{ok:true,access:{user:{role:'hr'}}}:{ok:false,response:new Response(null,{status:403})};},safeApiError:error=>{throw error;}}:{getCheckinMonthlySummary:async(_user,m)=>{calls++;assert.equal(m,'2026-09');return report;}});
 const req=new Request('https://example.test/api/checkin/summary?month=2026-09&export=xlsx');assert.equal((await route.GET(req)).status,403);assert.equal(calls,0);permitted=true;
 const response=await route.GET(req);assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attendance-summary-2026-09.xlsx/);
 const book=XLSX.read(await response.arrayBuffer(),{type:'array'});const sheet=book.Sheets[book.SheetNames[0]];assert.equal(sheet.B6.v,'001');assert.equal(sheet.C6.v,'=SUM(1,1)');assert.equal(sheet.C6.f,undefined);assert.equal(sheet.G6.v,1);assert.equal(sheet.J6.v,30);
 const json=await route.GET(new Request('https://example.test/api/checkin/summary?month=2026-09'));assert.deepEqual((await json.json()).rows,report.rows);
});
