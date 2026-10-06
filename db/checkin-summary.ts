import { getD1 } from './index';
import type { SystemUser } from './attendance';
import { summarizeAttendance, type SummaryEmployee, type SummaryRecord } from '../lib/checkin-monthly-summary';
import { monthRange } from '../lib/dashboard-month';
export async function getCheckinMonthlySummary(user:SystemUser,value:string,now=new Date()) {
  if (user.role!=='hr') throw new Error('เฉพาะ HR เท่านั้นที่ดูรายงานสรุปได้');
  const month = value || new Date(now.getTime()+7*3600000).toISOString().slice(0,7);
  const range = monthRange(month,now);
  if(month>new Date(now.getTime()+7*3600000).toISOString().slice(0,7))throw new Error('กรุณาเลือกเดือนไม่เกินเดือนปัจจุบัน');
  const db=getD1();
  const employees=(await db.prepare('SELECT id,nickname,team,status,start_date,end_date FROM hr_employees').all<SummaryEmployee>()).results;
  const records=(await db.prepare('SELECT employee_id,record_date,record_type FROM hr_attendance_records WHERE record_date >= ? AND record_date < ?').bind(range.start,range.end).all<SummaryRecord>()).results;
  return summarizeAttendance(month,employees,records,now);
}
