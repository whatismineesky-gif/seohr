import { drizzle } from 'drizzle-orm/d1';
import { Pool, types, type PoolClient } from 'pg';
import { PostgresDatabase } from './postgres';
import * as schema from './schema';
import { databaseOptions, loadRuntimeConfig } from '../scripts/runtime-config.mjs';

const state = globalThis as typeof globalThis & { peopleOsPool?: Pool; peopleOsDatabase?: PostgresDatabase };
function getPool() {
  if (!state.peopleOsPool) {
    state.peopleOsPool = new Pool({ ...databaseOptions(loadRuntimeConfig()),
      types: { getTypeParser: (oid, format) => [1114, 1184].includes(oid) && format !== 'binary'
        ? (value: string) => value : types.getTypeParser(oid, format) },
    });
    state.peopleOsPool.on('error', () => console.error('PostgreSQL idle connection failed'));
  }
  return state.peopleOsPool;
}

export function getDb() { return drizzle(getD1() as unknown as D1Database, { schema }); }
export function getD1(): PostgresDatabase { return getPostgres(); }
export function getPostgres(): PostgresDatabase {
  if (process.env.MAINTENANCE_MODE === '1') throw new Error('ระบบกำลังปรับปรุง');
  state.peopleOsDatabase ??= new PostgresDatabase(() => {
    let client: PoolClient | undefined;
    return {
      async connect() { client = await getPool().connect(); },
      async query(text, values) {
        if (!client) throw new Error('Database connection is unavailable');
        return client.query(text, values);
      },
      async end() { client?.release(); client = undefined; },
    };
  });
  return state.peopleOsDatabase;
}
