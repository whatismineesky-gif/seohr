import { defaultSubmissionDate, workSubmissionWindow } from '../lib/work-submission-window';
import { getD1 } from './index';
import type { SystemUser } from './attendance';

export const submissionTypes = ['new', '301', '301_new'] as const;

export function submissionWindow(now = new Date(), date = defaultSubmissionDate(now)) {
  return workSubmissionWindow(date, now);
}

function assertOpen(date: string, now: Date) {
  if (!submissionWindow(now, date).canSubmit) throw new Error(`วันที่ ${date} ส่งและแก้ไขงานได้ตั้งแต่ 14:00 น. ของวันนั้น ถึงก่อน 10:00 น. ของวันถัดไป เวลาไทย`);
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
  validated.forEach(item => assertOpen(item.date, startedAt));
  const employee = await employeeInfo(user);
  const db = getD1();
  const statements = validated.map(({ keyword, website, parent, date, type }) => db.prepare(`INSERT INTO hr_work_submissions
    (keyword, website, work_date, parent_website, submission_type, employee_id, team, author_email, author_name, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).bind(keyword, website, date, parent, type,
      employee?.id ?? null, employee?.team ?? '', user.email.toLowerCase(), employee?.nickname || user.displayName || user.email));
  const now = clock();
  validated.forEach(item => assertOpen(item.date, now));
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
  assertOpen(fields.date, clock());
  const id = Number(input.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('รายการส่งงานไม่ถูกต้อง');
  const db = getD1();
  const owned = await db.prepare('SELECT id, work_date FROM hr_work_submissions WHERE id = ? AND author_email = ? COLLATE NOCASE')
    .bind(id, user.email).first<{ id: number; work_date: string }>();
  if (!owned) throw new Error('ไม่พบรายการหรือไม่มีสิทธิ์แก้ไขรายการนี้');
  const now = clock();
  assertOpen(owned.work_date, now);
  assertOpen(fields.date, now);
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
  const [rows, count, teams, employee] = await Promise.all([
    db.prepare(`SELECT id, keyword, website, work_date, parent_website, submission_type, employee_id, author_name, team, author_email FROM hr_work_submissions ${where}
      ORDER BY work_date DESC, id DESC LIMIT 100 OFFSET ?`).bind(...args, (page - 1) * 100).all<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS total FROM hr_work_submissions ${where}`).bind(...args).first<{ total: number }>(),
    db.prepare(`SELECT team FROM hr_employees WHERE team <> '' UNION SELECT team FROM hr_work_submissions ORDER BY team`).all<{ team: string }>(),
    employeeInfo(user),
  ]);
  return { items: rows.results.map(row => ({ id: Number(row.id), keyword: String(row.keyword), website: String(row.website),
    employeeId: String(row.employee_id ?? ''), authorName: String(row.author_name ?? ''), team: String(row.team ?? ''),
    date: String(row.work_date), parentWebsite: String(row.parent_website), type: String(row.submission_type), canEdit: String(row.author_email).toLowerCase() === user.email.toLowerCase() })),
    total: Number(count?.total ?? 0), page, pageSize: 100,
    window: submissionWindow(),
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
