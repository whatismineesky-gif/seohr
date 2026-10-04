import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import ts from 'typescript';
function fixture() {
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE hr_employees(id TEXT PRIMARY KEY,nickname TEXT,team TEXT,position TEXT,status TEXT);
 INSERT INTO hr_employees VALUES('A','Alice','ทีม 1','Staff','active'),('B','Bob','ทีม 2','Head','active');
 CREATE TABLE hr_attendance_records(id INTEGER PRIMARY KEY,employee_id TEXT,record_date TEXT,record_type TEXT,reason TEXT,recorder_user_id TEXT,recorder_email TEXT,recorder_role TEXT,source_type TEXT DEFAULT 'manual',source_id INTEGER);
 CREATE UNIQUE INDEX checkin_record ON hr_attendance_records(source_type,source_id,record_type);`);
 for(const file of ['1016_employee_checkin.sql','1017_disable_checkin_until_approved.sql'])sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 sqlite.exec('UPDATE hr_checkin_config SET system_enabled=1');
 const db={prepare(sql){let args=[];const stmt={bind(...v){args=v;return stmt},first(){return sqlite.prepare(sql).get(...args)||null},all(){return {results:sqlite.prepare(sql).all(...args)}},run(){return sqlite.prepare(sql).run(...args)}};return stmt},async batch(statements){return statements.map(s=>s.all())}};
 const payroll=[];const api={};const code=ts.transpileModule(readFileSync(new URL('../db/checkin.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','exports',code)(name=>name==='./index'?{getD1:()=>db}:{syncAttendanceToPayroll:async(...args)=>payroll.push(args)},api);
 return {sqlite,payroll,...api};
}
const user={userId:'a',email:'a@test',employeeId:'A',displayName:'Alice',role:'employee'};
const afterCutoff=()=>new Date('2026-10-04T07:00:00Z'); // 14:00 Bangkok

test('absence or meeting leave on the check-in date suppress late flag, attendance and payroll sync',async()=>{
 for(const type of ['absence','meeting_leave']){
  const f=fixture(); f.sqlite.prepare('INSERT INTO hr_attendance_records(employee_id,record_date,record_type,reason) VALUES(?,?,?,?)').run('A','2026-10-04',type,'planned');
  const info=await f.getCheckinData(user,afterCutoff);
  assert.equal(info.availability.meetingLateExempt,true);assert.equal(info.availability.meetingWouldBeLate,false);assert.equal(info.availability.meetingCanStart,true);
  assert.equal((await f.startMeeting(user,afterCutoff)).late,false);
  assert.equal(f.sqlite.prepare('SELECT meeting_late FROM hr_employee_checkins').get().meeting_late,0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM hr_attendance_records WHERE record_type='late'").get().n,0);
  assert.equal(f.sqlite.prepare('SELECT record_type FROM hr_attendance_records').get().record_type,type);
  assert.deepEqual(f.payroll,[]);
  await assert.rejects(f.startMeeting(user,afterCutoff),/กดเข้าประชุมวันนี้แล้ว/);
  f.sqlite.close();
 }
});

test('other dates, other employees and non-exempt statuses still generate late attendance',async()=>{
 for(const [id,date,type] of [['A','2026-10-03','absence'],['A','2026-10-05','meeting_leave'],['B','2026-10-04','absence'],['A','2026-10-04','admin'],['A','2026-10-04','true']]){
  const f=fixture();f.sqlite.prepare('INSERT INTO hr_attendance_records(employee_id,record_date,record_type) VALUES(?,?,?)').run(id,date,type);
  const info=await f.getCheckinData(user,afterCutoff);assert.equal(info.availability.meetingLateExempt,false);assert.equal(info.availability.meetingWouldBeLate,true);
  assert.equal((await f.startMeeting(user,afterCutoff)).late,true);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM hr_attendance_records WHERE employee_id='A' AND record_date='2026-10-04' AND record_type='late' AND source_type='checkin'").get().n,1);
  assert.deepEqual(f.payroll,[['A','2026-10']]);f.sqlite.close();
 }
});

test('exemption rechecks current records at submission and preserves check-in opening rules',async()=>{
 const f=fixture();f.sqlite.exec("INSERT INTO hr_attendance_records(employee_id,record_date,record_type) VALUES('A','2026-10-04','meeting_leave')");
 await assert.rejects(f.startMeeting(user,()=>new Date('2026-10-04T05:59:00Z')),/กดเข้าประชุมได้ตั้งแต่/);
 assert.equal((await f.getCheckinData(user,afterCutoff)).availability.meetingWouldBeLate,false);
 f.sqlite.exec('DELETE FROM hr_attendance_records');
 assert.equal((await f.startMeeting(user,afterCutoff)).late,true);
 f.sqlite.close();
});
