import { getD1 } from './index';
import type { SystemUser } from './attendance';
const owned = `((n.source_kind = 'work_submission' AND lower(n.actor_email) = lower(?)) OR
  (n.source_kind <> 'work_submission' AND n.employee_id <> '' AND n.employee_id = ? AND lower(n.actor_email) <> lower(?) AND (n.actor_user_id = '' OR n.actor_user_id <> ?)))`;
function bindings(user: SystemUser) { return [user.email, user.employeeId ?? '', user.email, user.userId]; }
export async function getNotifications(user: SystemUser, before = 0) {
  const db = getD1();
  const [rows, count] = await Promise.all([
    db.prepare(`SELECT n.*, r.read_at FROM hr_notifications n LEFT JOIN hr_notification_reads r ON r.notification_id = n.id AND r.user_email = ?
      WHERE ${owned} AND (? = 0 OR n.id < ?) ORDER BY n.id DESC LIMIT 51`)
      .bind(user.email.toLowerCase(), ...bindings(user), before, before).all<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS count FROM hr_notifications n WHERE ${owned}
      AND NOT EXISTS (SELECT 1 FROM hr_notification_reads r WHERE r.notification_id = n.id AND r.user_email = ?)`)
      .bind(...bindings(user), user.email.toLowerCase()).first<{ count: number }>(),
  ]);
  return { items: rows.results.slice(0, 50).map(row => ({ id: Number(row.id), kind: String(row.source_kind),
    action: String(row.action), actor: String(row.actor_name || row.actor_email), eventDate: String(row.event_date),
    details: JSON.parse(String(row.details)), createdAt: String(row.created_at), read: Boolean(row.read_at) })),
    unreadCount: Number(count?.count ?? 0), hasMore: rows.results.length > 50 };
}
export async function readNotifications(user: SystemUser, input: Record<string, unknown>) {
  const all = input.action === 'read_all';
  const id = Number(input.id);
  if (!all && (input.action !== 'read' || !Number.isSafeInteger(id) || id <= 0)) throw new Error('คำสั่งแจ้งเตือนไม่ถูกต้อง');
  await getD1().prepare(`INSERT OR IGNORE INTO hr_notification_reads(user_email, notification_id)
    SELECT ?, n.id FROM hr_notifications n WHERE ${owned} AND (? = 1 OR n.id = ?)`)
    .bind(user.email.toLowerCase(), ...bindings(user), all ? 1 : 0, all ? 0 : id).run();
  return getNotifications(user);
}
