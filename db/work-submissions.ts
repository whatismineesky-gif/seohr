import { getD1 } from './index';
import type { SystemUser } from './attendance';

export const submissionTypes = ['new', '301', '301_new'] as const;

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

export async function createWorkSubmission(user: SystemUser, input: Record<string, unknown>) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('ข้อมูลส่งงานไม่ถูกต้อง');
  const keyword = requiredText(input.keyword, 'คีย์', 250);
  const website = requiredText(input.website, 'เว็บ', 500);
  const parent = requiredText(input.parentWebsite, 'เว็บแม่', 500);
  const date = String(input.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error('กรุณาระบุวันที่ให้ถูกต้อง');
  }
  const type = String(input.type ?? '');
  if (!submissionTypes.some(value => value === type)) throw new Error('ประเภทการส่งงานไม่ถูกต้อง');
  const employee = await employeeInfo(user);
  const result = await getD1().prepare(`INSERT INTO hr_work_submissions
    (keyword, website, work_date, parent_website, submission_type, employee_id, team, author_email, author_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(keyword, website, date, parent, type,
      employee?.id ?? null, employee?.team ?? '', user.email.toLowerCase(), employee?.nickname || user.displayName || user.email).run();
  return { id: result.meta.last_row_id };
}

export async function getWorkSubmissions(user: SystemUser, params: URLSearchParams) {
  const scope = params.get('scope') ?? 'mine';
  if (!['mine', 'team', 'all'].includes(scope)) throw new Error('ตัวกรองไม่ถูกต้อง');
  const page = Number(params.get('page') ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new Error('หน้ารายการไม่ถูกต้อง');
  const team = params.get('team') ?? '';
  if (scope === 'team' && (!team || team.length > 250)) throw new Error('กรุณาเลือกทีม');
  const where = scope === 'mine' ? 'WHERE author_email = ? COLLATE NOCASE' : scope === 'team' ? 'WHERE team = ?' : '';
  const args = scope === 'mine' ? [user.email] : scope === 'team' ? [team === '__unassigned__' ? '' : team] : [];
  const db = getD1();
  const [rows, count, teams, employee] = await Promise.all([
    db.prepare(`SELECT id, keyword, website, work_date, parent_website, submission_type FROM hr_work_submissions ${where}
      ORDER BY work_date DESC, id DESC LIMIT 100 OFFSET ?`).bind(...args, (page - 1) * 100).all<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS total FROM hr_work_submissions ${where}`).bind(...args).first<{ total: number }>(),
    db.prepare(`SELECT team FROM hr_employees WHERE team <> '' UNION SELECT team FROM hr_work_submissions ORDER BY team`).all<{ team: string }>(),
    employeeInfo(user),
  ]);
  return { items: rows.results.map(row => ({ id: Number(row.id), keyword: String(row.keyword), website: String(row.website),
    date: String(row.work_date), parentWebsite: String(row.parent_website), type: String(row.submission_type) })),
    total: Number(count?.total ?? 0), page, pageSize: 100,
    teams: teams.results.map(row => ({ value: row.team || '__unassigned__', label: row.team || 'ยังไม่ระบุทีม' })),
    currentUser: { name: employee?.nickname || user.displayName || user.email, team: employee?.team ?? '' } };
}
