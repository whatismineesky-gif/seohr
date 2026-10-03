const dayMs = 86400000;

export function defaultSubmissionDate(now = new Date()) {
  const thai = new Date(now.getTime() + 7 * 3600000);
  if (thai.getUTCHours() < 10) thai.setUTCDate(thai.getUTCDate() - 1);
  return thai.toISOString().slice(0, 10);
}

export function workSubmissionWindow(date: string, now = new Date()) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '1900-01-01' && date <= '9998-12-31'
    && Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!valid) return { date, opensAt: '', closesAt: '', serverNow: now.toISOString(), canSubmit: false };
  const opensAt = `${date}T14:00:00+07:00`;
  const nextDate = new Date(Date.parse(`${date}T00:00:00Z`) + dayMs).toISOString().slice(0, 10);
  const closesAt = `${nextDate}T10:00:00+07:00`;
  return { date, opensAt, closesAt, serverNow: now.toISOString(),
    canSubmit: now.getTime() >= Date.parse(opensAt) && now.getTime() < Date.parse(closesAt) };
}
