import { monthRange, isoEmployeeDate } from './dashboard-month';
export type SummaryEmployee = {id:unknown;nickname?:unknown;team?:unknown;status?:unknown;start_date?:unknown;end_date?:unknown};
export type SummaryRecord = {employee_id?:unknown;record_date?:unknown;record_type?:unknown};
export function summarizeAttendance(month: string, employees: SummaryEmployee[], records: SummaryRecord[], now = new Date()) {
  const range = monthRange(month, now);
  const today = new Date(now.getTime()+7*3600000).toISOString().slice(0,10);
  if (range.month > today.slice(0,7)) throw new Error('กรุณาเลือกเดือนไม่เกินเดือนปัจจุบัน');
  const rows = employees.flatMap(employee=>{
    const start = isoEmployeeDate(employee.start_date), end = isoEmployeeDate(employee.end_date);
    const dates = range.dates.filter(date=>(!start||date>=start)&&(employee.status!=='ลาออก'||Boolean(end&&date<=end)));
    if (!dates.length) return [];
    const eligible = new Set(dates);
    const byType = new Map<string,Set<string>>();
    for (const record of records) {
      const date = String(record.record_date ?? '');
      if (String(record.employee_id)!==String(employee.id)||!eligible.has(date)) continue;
      const type = String(record.record_type ?? '');
      if (!byType.has(type)) byType.set(type,new Set());
      byType.get(type)!.add(date);
    }
    const count = (type:string)=>byType.get(type)?.size??0;
    const absence = count('absence');
    return [{employeeId:String(employee.id),nickname:String(employee.nickname??''),team:String(employee.team??''),calendarDays:dates.length,absence,meetingLeave:count('meeting_leave'),late:count('late'),trueDays:count('true'),adminDays:count('admin'),workingDays:dates.length-absence}];
  }).sort((a,b)=>a.team.localeCompare(b.team,'th',{numeric:true})||a.nickname.localeCompare(b.nickname,'th')||a.employeeId.localeCompare(b.employeeId,'th',{numeric:true}));
  return {month:range.month,throughDate:range.dates.at(-1)??range.start,rows};
}
