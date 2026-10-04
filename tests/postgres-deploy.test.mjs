import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('PostgreSQL deployment reopens the app and never executes D1 migrations', () => {
  const code = readFileSync(new URL('../scripts/deploy-cloudflare.mjs', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  const calls = [];
  let config;
  new Function('execFileSync', 'readFileSync', 'writeFileSync', code)(
    (_binary, args) => { calls.push(args); return ''; },
    () => JSON.stringify({ compatibility_flags: ['nodejs_compat'], vars: { EXISTING: 'preserved' } }),
    (_path, content) => { config = JSON.parse(content); },
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(1), ['deploy', '--config', 'dist/server/wrangler.json']);
  assert.equal(config.vars.DATABASE_PROVIDER, 'postgres');
  assert.equal(config.vars.MAINTENANCE_MODE, '0');
  assert.equal(config.vars.EXISTING, 'preserved');
  assert.equal(config.hyperdrive[0].id, 'd788523963fc47e4a0eb262772b6cb92');
  assert.equal(config.d1_databases[0].database_id, 'd5336781-88a9-4708-b3cd-9f261d3734ba');
  assert.deepEqual(config.compatibility_flags, ['nodejs_compat']);
});
