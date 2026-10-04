import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function validateRuntimeConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid VPS configuration');
  const origin = new URL(String(input.origin ?? ''));
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('VPS origin must be an HTTPS origin');
  const database = input.database;
  if (!database || typeof database !== 'object' || !['127.0.0.1','localhost'].includes(database.host)) throw new Error('PostgreSQL must listen on loopback');
  if (!Number.isInteger(database.port) || database.port < 1 || database.port > 65535) throw new Error('Invalid PostgreSQL port');
  if (database.name !== 'people_os' || database.user !== 'people_os_app' || typeof database.password !== 'string' || !database.password) throw new Error('Use the existing people_os database and people_os_app role');
  if (!['verify-full','disable'].includes(database.sslMode)) throw new Error('Invalid database TLS mode');
  if (database.sslMode === 'verify-full' && (typeof database.caPath !== 'string' || !database.caPath)) throw new Error('Database CA certificate is required');
  const poolMax = database.poolMax ?? 10;
  if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 20) throw new Error('Database pool must have 1–20 connections');
  return { origin: origin.origin, maintenance: input.maintenance === true, database: { ...database, poolMax } };
}

export function loadRuntimeConfig(file = process.env.PEOPLE_OS_CONFIG ?? resolve('config/runtime.json')) {
  try { return validateRuntimeConfig(JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))); }
  catch { throw new Error('VPS configuration is unavailable or invalid; run Configure-VPS.ps1'); }
}

export function databaseOptions(config) {
  const db = config.database;
  return {
    host: db.host, port: db.port, database: db.name, user: db.user, password: db.password,
    ssl: db.sslMode === 'verify-full' ? { rejectUnauthorized: true, ca: readFileSync(db.caPath, 'utf8') } : false,
    max: db.poolMax, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000,
    query_timeout: 30000, statement_timeout: 30000, application_name: 'people-os-vps',
  };
}
