import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { Client, types } from "pg";
import { PostgresDatabase } from "./postgres";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(getD1(), { schema });
}

export function getD1(): D1Database {
  if (env.MAINTENANCE_MODE === '1') throw new Error('ระบบกำลังย้ายฐานข้อมูล');
  if (env.DATABASE_PROVIDER === 'postgres') return getPostgres();
  if (env.DATABASE_PROVIDER && env.DATABASE_PROVIDER !== 'd1') throw new Error('Database provider is not configured correctly');
  if (!env.DB) {
    throw new Error("ฐานข้อมูลพนักงานยังไม่พร้อมใช้งาน");
  }
  return env.DB;
}

export function getPostgres(): D1Database {
  if (env.MAINTENANCE_MODE === '1') throw new Error('ระบบกำลังย้ายฐานข้อมูล');
  if (!env.HYPERDRIVE?.connectionString) throw new Error('PostgreSQL binding is unavailable');
  // Hyperdrive owns the connection pool. Never share live sockets across requests.
  // Keep timestamps as strings to preserve existing API payloads and date handling.
  return new PostgresDatabase(() => new Client({
    connectionString: env.HYPERDRIVE!.connectionString,
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
    types: { getTypeParser: (oid, format) => [1114, 1184].includes(oid) && format !== 'binary'
      ? (value: string) => value : types.getTypeParser(oid, format) },
  })) as unknown as D1Database;
}
