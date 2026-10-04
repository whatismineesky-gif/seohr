import { getD1 } from './index';
import type { SystemUser } from './attendance';
export const announcementMenus = [
 {value:'all',label:'ทั้งระบบ'}, {value:'checkin',label:'เช็คชื่อ'}, {value:'attendance',label:'ลงเวลางาน / ตรวจส่งงาน'},
 {value:'submissions',label:'ตารางส่งงานใหม่'}, {value:'employees',label:'พนักงาน'}, {value:'members',label:'MEMBER'},
 {value:'advances',label:'รายการเบิก'}, {value:'warnings',label:'ใบเตือน / ยอดฝาก'}, {value:'payroll',label:'เงินเดือน'},
 {value:'resignations',label:'แจ้งลาออก'}, {value:'data',label:'นำเข้าและตรวจข้อมูล'}, {value:'access',label:'สิทธิ์ผู้ใช้งาน'}, {value:'dashboard',label:'ภาพรวม'},
];
function map(row: Record<string,unknown>, now: Date) {
 return {id:Number(row.id),title:String(row.title),message:String(row.message),showAt:String(row.show_at),startsAt:String(row.starts_at),estimatedEndsAt:String(row.estimated_ends_at),
  affectedMenus:JSON.parse(String(row.affected_menus)) as string[],pauseWrites:Boolean(row.pause_writes),status:String(row.status),
  phase:row.status==='completed'?'completed':Date.parse(String(row.starts_at))<=now.getTime()?'deploying':'scheduled',
  createdBy:String(row.created_by_email),createdAt:String(row.created_at),completedAt:row.completed_at?String(row.completed_at):null};
}
function requireHr(user:SystemUser){if(user.role!=='hr')throw new Error('เฉพาะ HR เท่านั้นที่จัดการประกาศได้');}
export async function getSystemAnnouncements(user:SystemUser,manage=false,now=new Date()) {
 if(manage)requireHr(user);
 const rows=await getD1().prepare(manage?'SELECT * FROM hr_system_announcements ORDER BY id DESC LIMIT 100':
  `SELECT * FROM hr_system_announcements WHERE show_at <= ? AND (status = 'published' OR
    (status = 'completed' AND completed_at > ?)) ORDER BY CASE status WHEN 'published' THEN 0 ELSE 1 END, starts_at DESC LIMIT 20`)
  .bind(...(manage?[]:[now.toISOString(),new Date(now.getTime()-86400000).toISOString()])).all<Record<string,unknown>>();
 return {items:rows.results.map(row=>map(row,now)),menus:announcementMenus,serverNow:now.toISOString()};
}
function text(value:unknown,label:string,max:number){const s=String(value??'').trim();if(!s||s.length>max)throw new Error(`กรุณาระบุ${label} ไม่เกิน ${max} ตัวอักษร`);return s;}
function thaiTime(value:unknown){const s=String(value??'');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s))throw new Error('กรุณาระบุวันเวลาไทยให้ถูกต้อง');
 const time=new Date(s+':00+07:00');if(!Number.isFinite(time.getTime())||new Date(time.getTime()+7*3600000).toISOString().slice(0,16)!==s)throw new Error('กรุณาระบุวันเวลาไทยให้ถูกต้อง');return time.toISOString();}
export async function saveSystemAnnouncement(user:SystemUser,input:Record<string,unknown>,now=new Date()) {
 requireHr(user);const db=getD1();
 if(input.action==='complete'||input.action==='cancel'){
  const id=Number(input.id);if(!Number.isSafeInteger(id)||id<1)throw new Error('ไม่พบประกาศ');
  const row=await db.prepare('SELECT status FROM hr_system_announcements WHERE id = ?').bind(id).first<{status:string}>();
  if(!row||row.status==='cancelled'||(input.action==='complete'&&row.status!=='published'))throw new Error('ไม่พบประกาศที่ดำเนินการได้');
  const completed=input.action==='complete';await db.prepare(`UPDATE hr_system_announcements SET status = ?, ${completed?'completed_at':'cancelled_at'} = ?, updated_by_email = ? WHERE id = ? AND status = ?`)
   .bind(completed?'completed':'cancelled',now.toISOString(),user.email,id,row.status).run();return {id};
 }
 if(input.action!=='publish')throw new Error('คำสั่งไม่ถูกต้อง');
 const title=text(input.title,'หัวข้อ',150),message=text(input.message,'ข้อความประกาศ',2000);
 const showAt=thaiTime(input.showAt),startsAt=thaiTime(input.startsAt),endsAt=thaiTime(input.estimatedEndsAt);
 if(showAt>startsAt||startsAt>=endsAt||endsAt<=now.toISOString())throw new Error('กรุณาตั้งเวลาเริ่มประกาศไม่เกินเวลาเริ่มอัปเดต และเวลาสิ้นสุดโดยประมาณต้องอยู่หลังเวลาเริ่มและเวลาปัจจุบัน');
 const affected=[...new Set(Array.isArray(input.affectedMenus)?input.affectedMenus.map(String):[])];
 if(!affected.length||affected.some(menu=>!announcementMenus.some(m=>m.value===menu)))throw new Error('กรุณาเลือกส่วนที่ได้รับผลกระทบ');
 const result=await db.prepare(`INSERT INTO hr_system_announcements(title,message,show_at,starts_at,estimated_ends_at,affected_menus,pause_writes,created_by_email,created_by_name)
   VALUES(?,?,?,?,?,?,?,?,?)`).bind(title,message,showAt,startsAt,endsAt,JSON.stringify(affected.includes('all')?['all']:affected),input.pauseWrites===true?1:0,user.email,user.displayName).run();
 return {id:Number(result.meta.last_row_id)};
}
export async function pausedAnnouncement(permissions: readonly string[],now=new Date()) {
 const rows=await getD1().prepare(`SELECT title,affected_menus FROM hr_system_announcements WHERE status='published' AND pause_writes=1 AND starts_at <= ?`).bind(now.toISOString()).all<{title:string;affected_menus:string}>();
 return rows.results.find(row=>{const menus=JSON.parse(row.affected_menus) as string[];return menus.includes('all')||permissions.some(menu=>menus.includes(menu));})??null;
}
