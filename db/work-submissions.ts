import { defaultSubmissionDate, workSubmissionWindow } from '../lib/work-submission-window';
import { getD1 } from './index';
import type { SystemUser } from './attendance';

export const submissionTypes = ['new', '301', '301_new'] as const;

export function submissionWindow(now = new Date(), date = defaultSubmissionDate(now)) {
  return workSubmissionWindow(date, now);
}

async function activeBackfillGrants(user: SystemUser, now: Date) {
  const employee = await employeeInfo(user);
  const result = await getD1().prepare(`SELECT id, start_date, end_date, closes_at FROM hr_work_submission_backfill_grants
    WHERE revoked_at IS NULL AND closes_at > ? AND
    (scope = 'all' OR (scope = 'employee' AND employee_id = ?) OR (scope = 'team' AND team = ?))
    ORDER BY closes_at DESC, id DESC`).bind(now.toISOString(), employee?.id ?? '', employee?.team ?? '')
    .all<{ id: number; start_date: string; end_date: string; closes_at: string }>();
  return result.results;
}

async function assertOpenDates(user: SystemUser, dates: string[], now: Date) {
  const grants = dates.some(date => !submissionWindow(now, date).canSubmit) ? await activeBackfillGrants(user, now) : [];
  return dates.map(date => {
    if (submissionWindow(now, date).canSubmit) return null;
    const grant = grants.find(item => date >= item.start_date && date <= item.end_date);
    if (!grant) throw new Error(`วันที่ ${date} ส่งและแก้ไขงานได้ตั้งแต่ 14:00 น. ของวันนั้น ถึงก่อน 10:00 น. ของวันถัดไป เวลาไทย หรือช่วงส่งย้อนหลังที่ HR เปิดให้`);
    return Number(grant.id);
  });
}

function requiredText(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\r\n\u0000]/.test(value)) {
    throw new Error(`กรุณาระบุ${label}ให้ถูกต้อง (ไม่เกิน ${max} ตัวอักษร)`);
  }
  return value.trim();
}

async function employeeInfo(user: SystemUser) {
  return user.employeeId ? getD1().prepare('SELECT id, nickname, team FROM hr_employees WHERE id = ?')
    .bind(user.employeeId).first<{ id: string; nickname: string; team: string }>() : null;
}

function validateSubmission(input: Record<string, unknown>) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('ข้อมูลส่งงานไม่ถูกต้อง');
  const keyword = requiredText(input.keyword, 'คีย์', 250);
  const website = requiredText(input.website, 'เว็บ', 500);
  const parent = requiredText(input.parentWebsite, 'เว็บแม่', 500);
  const date = String(input.date ?? '');
  validateDate(date);
  const type = String(input.type ?? '');
  if (!submissionTypes.some(value => value === type)) throw new Error('ประเภทการส่งงานไม่ถูกต้อง');
  return { keyword, website, parent, date, type };
}

function validateDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || date > '9998-12-31' || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error('กรุณาระบุวันที่ให้ถูกต้อง');
  }
}

export async function createWorkSubmission(user: SystemUser, input: Record<string, unknown>, clock = () => new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('ข้อมูลส่งงานไม่ถูกต้อง');
  const entries = input.items === undefined ? [input] : input.items;
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 100) throw new Error('กรุณาส่งงานครั้งละ 1–100 รายการ');
  const validated = entries.map(validateSubmission);
  const startedAt = clock();
  await assertOpenDates(user, validated.map(item => item.date), startedAt);
  const employee = await employeeInfo(user);
  const db = getD1();
  const now = clock();
  const grantIds = await assertOpenDates(user, validated.map(item => item.date), now);
  const statements = validated.map(({ keyword, website, parent, date, type }, index) => db.prepare(`INSERT INTO hr_work_submissions
    (keyword, website, work_date, parent_website, submission_type, employee_id, team, author_email, author_name, updated_at, backfill_grant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`).bind(keyword, website, date, parent, type,
      employee?.id ?? null, employee?.team ?? '', user.email.toLowerCase(), employee?.nickname || user.displayName || user.email, grantIds[index]));
  statements.push(db.prepare(`INSERT INTO hr_notifications
    (employee_id, source_kind, source_id, actor_email, actor_user_id, actor_name, event_date, action, details)
    VALUES (?, 'work_submission', last_insert_rowid(), ?, ?, ?, ?, 'submitted', ?)`)
    .bind(employee?.id ?? '', user.email.toLowerCase(), user.userId ?? '', employee?.nickname || user.displayName || user.email,
      new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10), JSON.stringify({ count: validated.length })));
  const results = await db.batch(statements);
  return { count: validated.length, id: results[validated.length - 1].meta.last_row_id };
}

export async function editWorkSubmission(user: SystemUser, input: Record<string, unknown>, clock = () => new Date()) {
  const fields = validateSubmission(input);
  await assertOpenDates(user, [fields.date], clock());
  const id = Number(input.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('รายการส่งงานไม่ถูกต้อง');
  const db = getD1();
  const owned = await db.prepare('SELECT id, work_date FROM hr_work_submissions WHERE id = ? AND author_email = ? COLLATE NOCASE')
    .bind(id, user.email).first<{ id: number; work_date: string }>();
  if (!owned) throw new Error('ไม่พบรายการหรือไม่มีสิทธิ์แก้ไขรายการนี้');
  const now = clock();
  await assertOpenDates(user, [owned.work_date, fields.date], now);
  await db.prepare(`UPDATE hr_work_submissions SET keyword = ?, website = ?, work_date = ?, parent_website = ?, submission_type = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND author_email = ? COLLATE NOCASE`)
    .bind(fields.keyword, fields.website, fields.date, fields.parent, fields.type, id, user.email).run();
  return { id };
}

function filters(user: SystemUser, params: URLSearchParams) {
  const scope = params.get('scope') ?? 'mine';
  if (!['mine', 'team', 'all'].includes(scope)) throw new Error('ตัวกรองไม่ถูกต้อง');
  const page = Number(params.get('page') ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new Error('หน้ารายการไม่ถูกต้อง');
  const team = params.get('team') ?? '';
  if (scope === 'team' && (!team || team.length > 250)) throw new Error('กรุณาเลือกทีม');
  const clauses = scope === 'mine' ? ['author_email = ? COLLATE NOCASE'] : scope === 'team' ? ['team = ?'] : [];
  const args = scope === 'mine' ? [user.email] : scope === 'team' ? [team === '__unassigned__' ? '' : team] : [];
  const date = params.get('date') ?? '';
  if (date) { validateDate(date); clauses.push('work_date = ?'); args.push(date); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, args, page };
}

export async function getWorkSubmissions(user: SystemUser, params: URLSearchParams) {
  const { where, args, page } = filters(user, params);
  const db = getD1();
  const [rows, count, teams, employee, backfillGrants] = await Promise.all([
    db.prepare(`SELECT id, keyword, website, work_date, parent_website, submission_type, employee_id, author_name, team, author_email, created_at, backfill_grant_id FROM hr_work_submissions ${where}
      ORDER BY work_date DESC, id DESC LIMIT 100 OFFSET ?`).bind(...args, (page - 1) * 100).all<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS total FROM hr_work_submissions ${where}`).bind(...args).first<{ total: number }>(),
    db.prepare(`SELECT team FROM hr_employees WHERE team <> '' UNION SELECT team FROM hr_work_submissions ORDER BY team`).all<{ team: string }>(),
    employeeInfo(user),
    activeBackfillGrants(user, new Date()),
  ]);
  return { items: rows.results.map(row => ({ id: Number(row.id), keyword: String(row.keyword), website: String(row.website),
    employeeId: String(row.employee_id ?? ''), authorName: String(row.author_name ?? ''), team: String(row.team ?? ''),
    submittedAt: String(row.created_at).replace(' ', 'T') + 'Z', isBackfill: row.backfill_grant_id != null,
    date: String(row.work_date), parentWebsite: String(row.parent_website), type: String(row.submission_type), canEdit: String(row.author_email).toLowerCase() === user.email.toLowerCase() })),
    total: Number(count?.total ?? 0), page, pageSize: 100,
    window: submissionWindow(),
    backfillGrants: backfillGrants.map(item => ({ id: Number(item.id), startDate: item.start_date, endDate: item.end_date, closesAt: item.closes_at })),
    teams: teams.results.map(row => ({ value: row.team || '__unassigned__', label: row.team || 'ยังไม่ระบุทีม' }))
      .sort((a, b) => a.label.localeCompare(b.label, 'th', { numeric: true })),
    currentUser: { role: user.role, name: employee?.nickname || user.displayName || user.email, team: employee?.team ?? '' } };
}

export async function workSubmissionReport(user: SystemUser, params: URLSearchParams) {
  const { where, args } = filters(user, params);
  const rows = await getD1().prepare(`SELECT * FROM hr_work_submissions ${where}`).bind(...args).all<Record<string, unknown>>();
  rows.results.sort((a, b) => String(a.team).localeCompare(String(b.team), 'th', { numeric: true })
    || String(a.author_name).localeCompare(String(b.author_name), 'th', { numeric: true })
    || String(a.work_date).localeCompare(String(b.work_date)) || Number(a.id) - Number(b.id));
  const labels: Record<string, string> = { new: 'เว็บใหม่', '301': 'เว็บ 301', '301_new': 'เว็บ 301 ขึ้นใหม่' };
  return [['ทีม', 'ชื่อ', 'คีย์', 'เว็บ', 'วันที่', 'เว็บแม่', 'ประเภท'], ...rows.results.map(row =>
    [String(row.team || 'ยังไม่ระบุทีม'), String(row.author_name), String(row.keyword), String(row.website), String(row.work_date), String(row.parent_website), labels[String(row.submission_type)]])];
}

export async function exportWorkSubmissions(user: SystemUser, params: URLSearchParams) {
  const rows = await workSubmissionReport(user, params);
  function cell(value: unknown) {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}


function requireBackfillHr(user: SystemUser) {
  if (user.role !== 'hr') throw new Error('เฉพาะ HR เท่านั้นที่เปิดหรือปิดรับส่งงานย้อนหลังได้');
}

export async function getWorkSubmissionBackfillConfig(user: SystemUser) {
  requireBackfillHr(user);
  const db = getD1();
  const [grants, employees] = await Promise.all([
    db.prepare(`SELECT g.*, e.nickname FROM hr_work_submission_backfill_grants g
      LEFT JOIN hr_employees e ON e.id = g.employee_id ORDER BY g.id DESC LIMIT 100`).all<Record<string, unknown>>(),
    db.prepare('SELECT id, nickname, team FROM hr_employees ORDER BY team, nickname').all<{id: string; nickname: string; team: string}>(),
  ]);
  return { grants: grants.results.map(row => ({ id: Number(row.id), startDate: String(row.start_date), endDate: String(row.end_date),
    scope: String(row.scope), team: String(row.team), employeeId: String(row.employee_id), employeeName: String(row.nickname ?? ''),
    closesAt: String(row.closes_at), reason: String(row.reason), createdBy: String(row.created_by_email), createdAt: String(row.created_at),
    revokedAt: row.revoked_at ? String(row.revoked_at) : null, revokedBy: String(row.revoked_by_email ?? '') })),
    employees: employees.results, serverNow: new Date().toISOString() };
}

export async function saveWorkSubmissionBackfill(user: SystemUser, input: Record<string, unknown>, now = new Date()) {
  requireBackfillHr(user);
  const db = getD1();
  if (input.action === 'revoke') {
    const id = Number(input.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('ไม่พบช่วงส่งงานย้อนหลัง');
    await db.prepare(`UPDATE hr_work_submission_backfill_grants SET revoked_at = ?, revoked_by_email = ?
      WHERE id = ? AND revoked_at IS NULL`).bind(now.toISOString(), user.email, id).run();
    return { id };
  }
  if (input.action !== 'create') throw new Error('คำสั่งไม่ถูกต้อง');
  const startDate = String(input.startDate ?? ''), endDate = String(input.endDate ?? '');
  validateDate(startDate); validateDate(endDate);
  const today = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0,10);
  if (startDate > endDate || endDate >= today) throw new Error('กรุณาเลือกช่วงวันที่ผ่านมาแล้ว และวันเริ่มไม่เกินวันสิ้นสุด');
  const deadline = String(input.closesAt ?? '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(deadline)) throw new Error('กรุณาระบุเวลาปิดรับ เวลาไทย');
  validateDate(deadline.slice(0,10));
  if (Number(deadline.slice(11,13)) > 23 || Number(deadline.slice(14,16)) > 59) throw new Error('เวลาปิดรับไม่ถูกต้อง');
  const closesAt = new Date(`${deadline}:00+07:00`).toISOString();
  if (Date.parse(closesAt) <= now.getTime()) throw new Error('กรุณาตั้งเวลาปิดรับให้เป็นเวลาในอนาคต');
  const scope = String(input.scope ?? 'all');
  if (!['all','team','employee'].includes(scope)) throw new Error('กรุณาเลือกผู้ที่ส่งย้อนหลังได้');
  const team = scope === 'team' ? requiredText(input.team, 'ทีม', 250) : '';
  const employeeId = scope === 'employee' ? requiredText(input.employeeId, 'รหัสพนักงาน', 100) : '';
  if (scope === 'team' && !await db.prepare('SELECT id FROM hr_employees WHERE team = ? LIMIT 1').bind(team).first()) throw new Error('ไม่พบทีมที่เลือก');
  if (scope === 'employee' && !await db.prepare('SELECT id FROM hr_employees WHERE id = ?').bind(employeeId).first()) throw new Error('ไม่พบพนักงานที่เลือก');
  const reason = requiredText(input.reason, 'เหตุผลเปิดย้อนหลัง', 500);
  const result = await db.prepare(`INSERT INTO hr_work_submission_backfill_grants
    (start_date, end_date, scope, team, employee_id, closes_at, reason, created_by_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(startDate,endDate,scope,team,employeeId,closesAt,reason,user.email).run();
  return { id: Number(result.meta.last_row_id) };
}
