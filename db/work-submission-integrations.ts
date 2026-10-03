import { getD1 } from './index';
import type { SystemUser } from './attendance';

export class IntegrationError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) { super(message); }
}
const tokenPattern = /^hrws_[a-f0-9]{64}$/;
const labels: Record<string, string> = { new: 'เว็บใหม่', '301': 'เว็บ 301', '301_new': 'เว็บ 301 ขึ้นใหม่' };
const iso = (value: unknown) => value ? new Date(String(value).includes('T') ? String(value) : `${String(value).replace(' ', 'T')}Z`).toISOString() : null;
function requireHr(user: SystemUser) { if (user.role !== 'hr') throw new IntegrationError(403, 'เฉพาะ HR เท่านั้นที่จัดการ API Key ได้'); }
function dateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9998-12-31' || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) !== value) throw new IntegrationError(400, 'กรุณาระบุวันที่รูปแบบ YYYY-MM-DD ให้ถูกต้อง');
  return value;
}
async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2,'0')).join('');
}
export async function listIntegrationKeys(user: SystemUser) {
  requireHr(user);
  const db = getD1();
  const [keys, teams] = await Promise.all([
    db.prepare(`SELECT id, name, token_prefix, scope, team, expires_at, created_by_email, created_at, revoked_at, revoked_by_email, last_used_at FROM hr_integration_api_keys ORDER BY id DESC`).all<Record<string, unknown>>(),
    db.prepare("SELECT team FROM hr_employees WHERE team <> '' UNION SELECT team FROM hr_work_submissions").all<{ team: string }>(),
  ]);
  return { keys: keys.results.map(row => ({ id: Number(row.id), name: String(row.name), prefix: String(row.token_prefix), scope: String(row.scope), team: String(row.team), expiresAt: iso(row.expires_at), createdBy: String(row.created_by_email), createdAt: iso(row.created_at), revokedAt: iso(row.revoked_at), revokedBy: row.revoked_by_email ? String(row.revoked_by_email) : null, lastUsedAt: iso(row.last_used_at) })),
    teams: teams.results.map(row => ({ value: row.team || '__unassigned__', label: row.team || 'ยังไม่ระบุทีม' })).sort((a,b) => a.label.localeCompare(b.label,'th',{numeric:true})) };
}
export async function createIntegrationKey(user: SystemUser, input: Record<string, unknown>, now = new Date()) {
  requireHr(user);
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 80 || /[\r\n\u0000]/.test(name)) throw new IntegrationError(400, 'กรุณาระบุชื่อระบบไม่เกิน 80 ตัวอักษร');
  const scope = String(input.scope ?? '');
  if (!['all','team'].includes(scope)) throw new IntegrationError(400,'กรุณาเลือกสิทธิ์ทั้งหมดหรือเฉพาะทีม');
  let team = '';
  if (scope === 'team') {
    const value = String(input.team ?? '');
    if (!value || value.length > 250) throw new IntegrationError(400,'กรุณาเลือกทีม');
    team = value === '__unassigned__' ? '' : value;
    const exists = await getD1().prepare("SELECT team FROM hr_employees WHERE team = ? UNION SELECT team FROM hr_work_submissions WHERE team = ? LIMIT 1").bind(team,team).first();
    if (!exists) throw new IntegrationError(400,'ไม่พบทีมที่เลือก');
  }
  let expiresAt: string | null = null;
  if (input.expiresOn) {
    const date = dateValue(String(input.expiresOn));
    expiresAt = new Date(`${date}T23:59:59+07:00`).toISOString();
    if (Date.parse(expiresAt) <= now.getTime()) throw new IntegrationError(400,'กรุณาเลือกวันหมดอายุที่ยังไม่ผ่านมา');
  }
  const token = `hrws_${Array.from(crypto.getRandomValues(new Uint8Array(32)),value => value.toString(16).padStart(2,'0')).join('')}`;
  const result = await getD1().prepare(`INSERT INTO hr_integration_api_keys (name,token_hash,token_prefix,scope,team,expires_at,created_by_email) VALUES (?,?,?,?,?,?,?)`).bind(name,await tokenHash(token),token.slice(0,13),scope,team,expiresAt,user.email.toLowerCase()).run();
  return { id: Number(result.meta.last_row_id), token, name, scope, team, expiresAt };
}
export async function revokeIntegrationKey(user: SystemUser, value: unknown) {
  requireHr(user);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new IntegrationError(400,'ไม่พบ API Key');
  const result = await getD1().prepare(`UPDATE hr_integration_api_keys SET revoked_at = CURRENT_TIMESTAMP, revoked_by_email = ? WHERE id = ? AND revoked_at IS NULL RETURNING id`).bind(user.email.toLowerCase(),id).first<{ id: number }>();
  if (!result) throw new IntegrationError(404,'ไม่พบ API Key ที่เปิดใช้งาน');
  return { id, revoked: true };
}
export async function authorizeIntegration(header: string | null, now = new Date()) {
  const match = /^Bearer (hrws_[a-f0-9]{64})$/i.exec(header ?? '');
  if (!match || !tokenPattern.test(match[1])) throw new IntegrationError(401,'API Key ไม่ถูกต้องหรือไม่ได้ระบุ');
  const hash = await tokenHash(match[1]);
  const db = getD1();
  const key = await db.prepare(`SELECT id FROM hr_integration_api_keys WHERE token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`).bind(hash,now.toISOString()).first<{ id: number }>();
  if (!key) throw new IntegrationError(401,'API Key ไม่ถูกต้อง ถูกปิดใช้งาน หรือหมดอายุ');
  const minute = Math.floor(now.getTime()/60000);
  const allowed = await db.prepare(`UPDATE hr_integration_api_keys SET request_count = CASE WHEN request_minute = ? THEN request_count + 1 ELSE 1 END, request_minute = ?, last_used_at = ? WHERE id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?) RETURNING id, scope, team, request_count`).bind(minute,minute,now.toISOString(),key.id,now.toISOString()).first<{ id: number; scope: string; team: string; request_count: number }>();
  if (!allowed) throw new IntegrationError(401,'API Key ไม่ถูกต้อง ถูกปิดใช้งาน หรือหมดอายุ');
  if (allowed.request_count > 60) throw new IntegrationError(429,'เรียก API เกิน 60 ครั้งต่อนาที',60-now.getUTCSeconds());
  return { id: allowed.id, scope: allowed.scope, team: allowed.team };
}
export async function getIntegrationSubmissions(key: { scope: string; team: string }, params: URLSearchParams) {
  const supported = ['date','submittedDate','team','page'];
  for (const parameter of params.keys()) if (!supported.includes(parameter) || params.getAll(parameter).length !== 1) throw new IntegrationError(400,'ตัวกรองไม่ถูกต้อง รองรับ date, submittedDate, team, page');
  const date = params.get('date'), submittedDate = params.get('submittedDate');
  if (!date && !submittedDate) throw new IntegrationError(400,'กรุณาระบุ date หรือ submittedDate อย่างน้อยหนึ่งค่า');
  const pageText = params.get('page') ?? '1';
  if (!/^[1-9]\d*$/.test(pageText) || Number(pageText) > 100000) throw new IntegrationError(400,'กรุณาระบุหน้ารายการให้ถูกต้อง');
  const page = Number(pageText), clauses: string[] = [], args: (string | number)[] = [];
  if (date !== null) { clauses.push('work_date = ?'); args.push(dateValue(date)); }
  if (submittedDate !== null) {
    dateValue(submittedDate);
    const start = new Date(`${submittedDate}T00:00:00+07:00`);
    const end = new Date(start.getTime()+86400000);
    clauses.push('created_at >= ? AND created_at < ?');
    args.push(start.toISOString().slice(0,19).replace('T',' '),end.toISOString().slice(0,19).replace('T',' '));
  }
  const requestedTeam = params.get('team');
  if (requestedTeam !== null && (!requestedTeam || requestedTeam.length > 250)) throw new IntegrationError(400,'กรุณาระบุทีมให้ถูกต้อง');
  const team = requestedTeam === '__unassigned__' ? '' : requestedTeam;
  if (key.scope === 'team') {
    if (team !== null && team !== key.team) throw new IntegrationError(403,'ไม่มีสิทธิ์ดึงข้อมูลทีมนี้');
    clauses.push('team = ?'); args.push(key.team);
  } else if (key.scope === 'all') { if (team !== null) { clauses.push('team = ?'); args.push(team); } }
  else throw new IntegrationError(403,'ไม่มีสิทธิ์ดึงข้อมูล');
  const db = getD1(), where = `WHERE ${clauses.join(' AND ')}`;
  // One D1 batch keeps the page and count in the same database snapshot.
  const results = await db.batch([
    db.prepare(`SELECT id, employee_id, author_name, team, keyword, website, work_date, parent_website, submission_type, created_at, updated_at FROM hr_work_submissions ${where} ORDER BY id ASC LIMIT 100 OFFSET ?`).bind(...args,(page-1)*100),
    db.prepare(`SELECT COUNT(*) AS total FROM hr_work_submissions ${where}`).bind(...args),
  ]);
  const rows = results[0].results as Record<string, unknown>[];
  const total = Number((results[1].results[0] as { total: number }).total);
  return { items: rows.map(row => ({ id: Number(row.id), employeeId: row.employee_id ? String(row.employee_id) : null, name: String(row.author_name), team: String(row.team), keyword: String(row.keyword), website: String(row.website), date: String(row.work_date), parentWebsite: String(row.parent_website), type: String(row.submission_type), typeLabel: labels[String(row.submission_type)], submittedAt: iso(row.created_at), updatedAt: iso(row.updated_at || row.created_at) })), date, submittedDate, timezone: 'Asia/Bangkok', page, pageSize: 100, total, totalPages: Math.ceil(total/100), hasMore: page*100 < total, nextPage: page*100 < total ? page+1 : null };
}
