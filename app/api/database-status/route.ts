import { env } from 'cloudflare:workers';
import { authorizeApi } from '@/app/api/auth';
import { getPostgres } from '@/db';

export async function GET(request: Request) {
  const auth = await authorizeApi(request, { roles: ['hr'] });
  if (!auth.ok) return auth.response;
  const headers = { 'cache-control': 'no-store' };
  try {
    const row = await getPostgres().prepare(`SELECT
      (SELECT COUNT(*) FROM hr_employees) AS employees,
      (SELECT COUNT(*) FROM hr_work_submissions) AS submissions,
      (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tables,
      (SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal) AS notification_triggers`).first();
    return Response.json({ ok: true, activeDatabase: env.DATABASE_PROVIDER ?? 'd1', postgres: row }, { headers });
  } catch {
    // Do not expose connection strings, credentials or server errors to the browser.
    return Response.json({ ok: false, error: 'เชื่อมต่อฐานข้อมูล VPS ไม่สำเร็จ' }, { status: 503, headers });
  }
}
