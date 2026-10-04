import pg from 'pg';
import { databaseOptions, loadRuntimeConfig } from './runtime-config.mjs';
const client = new pg.Client(databaseOptions(loadRuntimeConfig()));
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const result = await client.query(`SELECT current_database() AS database, current_user AS role,
    (SELECT COUNT(*)::integer FROM hr_employees) AS employees,
    (SELECT COUNT(*)::integer FROM hr_work_submissions) AS submissions,
    (SELECT COUNT(*)::integer FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS tables,
    (SELECT COUNT(*)::integer FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) AS notification_triggers,
    (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls`);
  await client.query('COMMIT');
  const row=result.rows[0];
  if (row.database !== 'people_os' || row.role !== 'people_os_app' || row.tables !== 54 || row.notification_triggers !== 7) throw new Error('Schema does not match');
  console.log(JSON.stringify({ok:true,...row},null,2));
} catch {
  console.error('Database verification failed. Check PostgreSQL, password, certificate and the existing 54-table schema.');
  process.exitCode=1;
} finally { await client.end(); }
