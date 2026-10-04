export function defaultBackfillDeadline(now = new Date()) {
  const thai = new Date(now.getTime() + 7 * 3600000);
  if (thai.getUTCHours() >= 10) thai.setUTCDate(thai.getUTCDate() + 1);
  return `${thai.toISOString().slice(0, 10)}T10:00`;
}
