import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import ts from 'typescript';

test('past-date attendance changes notify other HR only, atomically, with Bangkok dates and independent read receipts', async () => {
 const sqlite = new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE hr_employees(id TEXT,nickname TEXT,team TEXT);
 INSERT INTO hr_employees VALUES('A','Alice','ทีม 1');
 CREATE TABLE hr_attendance_records(id INTEGER PRIMARY KEY,employee_id TEXT,record_date TEXT,record_type TEXT,reason TEXT,recorder_email TEXT,recorder_user_id TEXT,source_type TEXT DEFAULT 'manual');
 CREATE TABLE hr_attendance_audit_logs(id INTEGER PRIMARY KEY,attendance_record_id INTEGER,employee_id TEXT,employee_nickname TEXT,action TEXT,previous_record_date TEXT,new_record_date TEXT,previous_record_type TEXT,new_record_type TEXT,previous_reason TEXT,new_reason TEXT,actor_email TEXT,actor_user_id TEXT,actor_display_name TEXT,created_at TEXT);
 CREATE TABLE hr_daily_work_review_logs(id INTEGER);
 CREATE TABLE hr_employee_daily_work_target_logs(id INTEGER);`);
 sqlite.exec(readFileSync(new URL('../migrations/1021_personal_notifications.sql', import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../migrations/1027_system_announcements.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../migrations/1025_retrospective_attendance_notifications.sql', import.meta.url),'utf8'));
 const insert = sqlite.prepare('INSERT INTO hr_attendance_audit_logs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 const add=(id, oldDate,newDate,createdAt, action='edit',oldStatus='absence',newStatus='true',oldReason='old',newReason='new',recordId=99)=>insert.run(id,recordId,'A','Alice',action,oldDate,newDate,oldStatus,newStatus,oldReason,newReason,'hr1@test','hr1','HR1',createdAt);
 add(1,'2026-10-03','2026-10-03','2026-10-03 16:59:59'); // same Bangkok date
 add(2,'2026-10-03','2026-10-03','2026-10-03 17:00:00'); // midnight Bangkok
 add(3,'2026-10-04','2026-10-04','2026-10-03 17:00:00'); // today
 add(4,'2026-10-05','2026-10-05','2026-10-03 17:00:00'); // future
 add(5,'2026-10-03','2026-10-05','2026-10-03 17:00:00'); // move past to future
 add(6,'2026-10-05','2026-10-03','2026-10-03 17:00:00'); // move future to past
 add(7,'2026-10-03','2026-10-03','2026-10-03 17:00:00','edit','absence','absence','same','same'); // no op
 add(8,'2026-10-03',null,'2026-10-03 17:00:00','delete','absence',null);
 add(9,'2026-10-03','2026-10-03','2026-10-03 17:00:00','edit','absence','absence'); // reason edit
 sqlite.exec("INSERT INTO hr_attendance_records VALUES(100,'A','2026-10-03','absence','auto','hr1@test','hr1','work_audit')");
 add(10,'2026-10-03','2026-10-03','2026-10-03 17:00:00','edit','absence','true','old','new',100);
 add(11,'2026-10-03',null,'2026-10-03 17:00:00','delete','true',null); // another status remains
 const retro=()=>sqlite.prepare("SELECT * FROM hr_notifications WHERE source_kind='attendance_retro' ORDER BY source_id").all();
 assert.deepEqual(retro().map(r=>r.source_id),[2,5,6,8,9,11]);
 const first=JSON.parse(retro()[0].details);
 assert.equal(first.employeeName,'Alice'); assert.equal(first.employeeId,'A'); assert.equal(first.team,'ทีม 1');
 assert.equal(JSON.parse(retro().find(r=>r.source_id===8).details).newStatus,'working');
 assert.equal(JSON.parse(retro().find(r=>r.source_id===11).details).newStatus,'remaining');
 sqlite.exec('BEGIN'); add(12,'2026-10-03',null,'2026-10-03 17:00:00','delete','true',null); sqlite.exec('ROLLBACK');
 assert.equal(retro().length,6);
 const database={prepare(sql){let args=[]; const stmt={bind(...v){args=v;return stmt},all(){return {results:sqlite.prepare(sql).all(...args)}},first(){return sqlite.prepare(sql).get(...args)||null},run(){return sqlite.prepare(sql).run(...args)}};return stmt;}};
 const code=ts.transpileModule(readFileSync(new URL('../db/notifications.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const api={};new Function('require','exports',code)(()=>({getD1:()=>database}),api);
 const hr2={role:'hr',email:'HR2@test',userId:'hr2',employeeId:null};
 const hr3={role:'hr',email:'hr3@test',userId:'hr3',employeeId:null};
 assert.equal((await api.getNotifications(hr2)).unreadCount,6);
 assert.equal((await api.getNotifications({role:'hr',email:'HR1@test',userId:'hr1',employeeId:null})).unreadCount,0);
 for(const role of ['employee','audit']){
  const user={role,email:'x@test',userId:'x',employeeId:null};
  assert.equal((await api.getNotifications(user)).unreadCount,0);
  await api.readNotifications(user,{action:'read',id:retro()[0].id});
 }
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM hr_notification_reads').get().n,0);
 await api.readNotifications(hr2,{action:'read_all'});
 assert.equal((await api.getNotifications(hr2)).unreadCount,0);
 assert.equal((await api.getNotifications(hr3)).unreadCount,6);
 assert.equal((await api.getNotifications({role:'employee',email:'a@test',userId:'a',employeeId:'A'})).items.some(n=>n.kind==='attendance_retro'),false);
 sqlite.close();
});
