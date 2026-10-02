export function previousBangkokMonth(now = new Date()) {
  const local = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}
export function monthRange(value: string, now = new Date()) {
  const month = value || previousBangkokMonth(now);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1900 || Number(month.slice(0, 4)) > 9998) throw new Error("กรุณาเลือกเดือนให้ถูกต้อง");
  const [year, index] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, index, 1)).toISOString().slice(0, 10);
  const today = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const dates: string[] = [];
  for (let day = 1; day <= 31; day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    if (date >= end || day > new Date(Date.UTC(year, index, 0)).getUTCDate() || date > today) break;
    dates.push(date);
  }
  return { month, start: `${month}-01`, end, dates };
}
export function isoEmployeeDate(value: unknown) {
  const text = String(value ?? "");
  return /^\d{2}\/\d{2}\/\d{4}$/.test(text) ? `${text.slice(6)}-${text.slice(3, 5)}-${text.slice(0, 2)}` : text;
}
export function employedOn(row: Record<string, unknown>, date: string) {
  const start = isoEmployeeDate(row.start_date), end = isoEmployeeDate(row.end_date);
  return (!start || start <= date) && (row.status !== "ลาออก" || !end || end >= date);
}
export function requiresWorkReview(employee: Record<string, unknown>, date: string, records: Record<string, unknown>[], statuses: string[]) {
  const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[- ]/g, "");
  if (!employedOn(employee, date) || [employee.position, employee.employment].some(value => ["parttime", "freelancer"].includes(normalize(value)))) return false;
  const manual = records.filter(row => row.employee_id === employee.id && row.record_date === date && row.source_type !== "work_audit" && ["absence", "meeting_leave", "admin", "true"].includes(String(row.record_type)));
  return (statuses.includes("working") && manual.length === 0) || manual.some(row => statuses.includes(String(row.record_type)));
}
