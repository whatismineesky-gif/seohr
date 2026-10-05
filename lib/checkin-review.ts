export function reviewDate(value: unknown, now = new Date()) {
  const today = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const date = String(value || today);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || date > today || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('กรุณาเลือกวันที่ที่ถูกต้อง ไม่เกินวันนี้');
  return { date, today };
}
export function dailyCheckinStatus(date: string, config: { systemEnabled: boolean; meetingLateAfter: string }, session: { meeting_started_at?: unknown; meeting_late?: unknown } | undefined, records: { record_type?: unknown; source_type?: unknown }[], now = new Date()) {
  const manual = records.filter(record => record.source_type !== 'work_audit');
  if (manual.some(record => ['absence', 'meeting_leave'].includes(String(record.record_type)))) return 'exempt';
  if (manual.some(record => record.record_type === 'working')) return 'working';
  if (manual.some(record => record.record_type === 'late')) return 'late';
  if (session?.meeting_started_at) return session.meeting_late ? 'late' : 'checked';
  const local = new Date(now.getTime() + 7 * 3600000);
  const today = local.toISOString().slice(0, 10);
  const [hour, minute] = config.meetingLateAfter.split(':').map(Number);
  if (config.systemEnabled && (date < today || (date === today && local.getUTCHours() * 60 + local.getUTCMinutes() > hour * 60 + minute))) return 'late';
  return config.systemEnabled ? 'waiting' : 'disabled';
}
