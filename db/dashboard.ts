import { getD1 } from "./index";
import type { SystemUser } from "./attendance";
import type { MenuId } from "./access";
import { monthRange, employedOn, requiresWorkReview } from "../lib/dashboard-month";

type Row = Record<string, unknown>;
export type DashboardSection = { title: string; menu: string; recorded: number; metrics: { label: string; value: number; unit: string; tone?: string }[]; teams?: { name: string; count: number }[] };
export async function getMonthlyDashboard(user: SystemUser, permissions: MenuId[], value: string, now = new Date()) {
  const range = monthRange(value, now), db = getD1();
  const own = user.role === "employee";
  const rows = async (sql: string, ...args: (string | number)[]) => (await db.prepare(sql).bind(...args).all<Row>()).results;
  const scope = own ? " AND employee_id = ?" : "";
  const scopedArgs = own ? [user.employeeId ?? ""] : [];
  const employees = await rows(`SELECT id, nickname, team, position, employment, status, start_date, end_date FROM hr_employees${own ? " WHERE id = ?" : ""}`, ...scopedArgs);
  const monthEmployees = employees.filter(e => range.dates.some(date => employedOn(e, date)));
  const sections: DashboardSection[] = [];
  const followups: { label: string; count: number; unit: string; menu: string }[] = [];
  const metric = (label: string, value: number, unit = "รายการ", tone?: string) => ({ label, value, unit, tone });
  const add = (label: string, count: number, unit: string, menu: string) => { if (count > 0) followups.push({ label, count, unit, menu }); };
  if (permissions.includes("submissions")) {
    const submissions = await rows(`SELECT submission_type, team FROM hr_work_submissions WHERE work_date >= ? AND work_date < ?${own ? " AND author_email = ? COLLATE NOCASE" : ""}`, range.start, range.end, ...(own ? [user.email] : []));
    const teams = new Map<string, number>(); submissions.forEach(r => teams.set(String(r.team || "ไม่ระบุทีม"), (teams.get(String(r.team || "ไม่ระบุทีม")) ?? 0) + 1));
    sections.push({ title: "การส่งงานเว็บ", menu: "submissions", recorded: submissions.length, metrics: [metric("รวมส่งงาน", submissions.length, "เว็บ"), ...["new", "301", "301_new"].map((type, i) => metric(["เว็บใหม่", "เว็บ 301", "เว็บ 301 ขึ้นใหม่"][i], submissions.filter(r => r.submission_type === type).length, "เว็บ"))], teams: Array.from(teams, ([name, count]) => ({ name, count })).sort((a,b) => a.name.localeCompare(b.name,"th",{numeric:true})) });
  }
  if (permissions.includes("attendance")) {
    const [attendance, reviews, config, rules] = await Promise.all([
      rows(`SELECT employee_id, record_date, record_type, source_type FROM hr_attendance_records WHERE record_date >= ? AND record_date < ?${scope}`, range.start, range.end, ...scopedArgs),
      rows(`SELECT employee_id, review_date, result_status FROM hr_daily_work_reviews WHERE review_date >= ? AND review_date < ?${scope}`, range.start, range.end, ...scopedArgs),
      rows("SELECT included_statuses FROM hr_daily_work_status_config WHERE id = 1"),
      rows("SELECT event_type, action_value FROM hr_attendance_rules WHERE active = 1 AND action_type = 'limit'"),
    ]);
    const statuses = config.length ? JSON.parse(String(config[0].included_statuses)) as string[] : ["working", "meeting_leave"];
    const reviewed = new Map(reviews.map(r => [`${r.employee_id}/${r.review_date}`, r]));
    const attendanceByDay = new Map<string, Row[]>();
    for (const row of attendance) { const key = `${row.employee_id}/${row.record_date}`; attendanceByDay.set(key, [...(attendanceByDay.get(key) ?? []), row]); }
    let pending = 0;
    for (const employee of employees) for (const date of range.dates) if (requiresWorkReview(employee, date, attendanceByDay.get(`${employee.id}/${date}`) ?? [], statuses) && !reviewed.has(`${employee.id}/${date}`)) pending++;
    sections.push({ title: "ผลตรวจส่งงานรายวัน", menu: "attendance", recorded: reviews.length, metrics: [metric("ส่งครบ", reviews.filter(r => r.result_status === "complete").length, "คน-วัน", "green"), metric("ส่งไม่ครบ", reviews.filter(r => r.result_status === "incomplete").length, "คน-วัน", "amber"), metric("ไม่ส่ง", reviews.filter(r => r.result_status === "none").length, "คน-วัน", "red"), metric("ยังไม่ตรวจ", pending, "คน-วัน", "amber")] });
    const overQuota = employees.filter(e => rules.some(rule => attendance.filter(r => r.employee_id === e.id && r.record_type === rule.event_type).length > Number(rule.action_value))).length;
    sections.push({ title: "ลงเวลางาน", menu: "attendance", recorded: attendance.length, metrics: [...["absence", "meeting_leave", "late", "admin", "true"].map((type, i) => metric(["หยุด", "ลา", "สาย", "แอดมิน", "ทรู"][i], attendance.filter(r => r.record_type === type).length)), metric("เกินสิทธิ์ตามกฎ", overQuota, "คน", "red")] });
    add("ยังไม่ตรวจส่งงาน", pending, "คน-วัน", "attendance"); add("ส่งไม่ครบ / ไม่ส่ง", reviews.filter(r => ["incomplete", "none"].includes(String(r.result_status))).length, "คน-วัน", "attendance"); add("หยุดหรือลาเกินสิทธิ์", overQuota, "คน", "attendance");
  }
  if (permissions.includes("warnings")) {
    const deposits = await rows(`SELECT employee_id, deposit_count, result_type FROM hr_monthly_deposit_results WHERE result_month = ?${scope}`, range.month, ...scopedArgs);
    const missing = monthEmployees.filter(e => !deposits.some(r => r.employee_id === e.id)).length;
    sections.push({ title: "ยอดฝากและใบเตือน", menu: "warnings", recorded: deposits.length, metrics: [metric("ยอดฝากรวม", deposits.reduce((sum,r) => sum + Number(r.deposit_count),0)), ...["winloss", "yellow", "red"].map((type,i) => metric(["ผ่าน / WINLOSS", "ใบเหลือง", "ใบแดง"][i], deposits.filter(r => r.result_type === type).length,"คน",["green","amber","red"][i])), metric("ยังไม่บันทึกยอดฝาก", missing,"คน","amber")] });
    add("ยังไม่บันทึกยอดฝาก",missing,"คน","warnings"); add("ผลยอดฝากใบแดง",deposits.filter(r => r.result_type === "red").length,"คน","warnings");
  }
  if (permissions.includes("payroll")) {
    const payroll = await rows(`SELECT employee_id, net_salary FROM hr_payroll_records WHERE payroll_month = ?${scope}`,range.month,...scopedArgs);
    const missing = monthEmployees.filter(e => !payroll.some(r => r.employee_id === e.id)).length;
    sections.push({title:"เงินเดือนที่บันทึกจริง",menu:"payroll",recorded:payroll.length,metrics:[metric("บันทึกแล้ว",payroll.length,"คน","green"),metric("ยังไม่บันทึก",missing,"คน","amber"),metric("เงินเดือนสุทธิที่บันทึก",payroll.reduce((sum,r)=>sum+Number(r.net_salary),0),"บาท")]}); add("ยังไม่บันทึกเงินเดือน",missing,"คน","payroll");
  }
  if (permissions.includes("advances")) {
    const installments = await rows(`SELECT i.amount, i.status FROM hr_advance_installments i JOIN hr_employee_advances a ON a.id = i.advance_id WHERE i.due_month = ?${own ? " AND a.employee_id = ?" : ""}`,range.month,...scopedArgs);
    const pending = installments.filter(r=>r.status==="pending");
    sections.push({title:"ยอดผ่อนและเงินเบิกล่วงหน้า",menu:"advances",recorded:installments.length,metrics:[metric("ยอดครบกำหนด",installments.filter(r=>r.status!=="skipped").reduce((sum,r)=>sum+Number(r.amount),0),"บาท"),metric("หักเงินเดือนแล้ว",installments.filter(r=>r.status==="deducted").reduce((sum,r)=>sum+Number(r.amount),0),"บาท","green"),metric("ยังไม่ดึงเข้าเงินเดือน",pending.reduce((sum,r)=>sum+Number(r.amount),0),"บาท","amber"),metric("เลื่อนไปเดือนถัดไป",installments.filter(r=>r.status==="skipped").length)]}); add("งวดที่ยังไม่ดึงเข้าเงินเดือน",pending.length,"งวด","advances");
  }
  return {month:range.month,scope:own ? "ข้อมูลของฉัน" : "ข้อมูลทั้งหมดตามสิทธิ์",sections,followups};
}
