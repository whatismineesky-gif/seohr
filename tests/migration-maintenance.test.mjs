import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const api = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../lib/migration-maintenance.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(api);
const request = (path, method = 'GET', accept = 'application/json') => new Request('https://dev.member-seo.com' + path, { method, headers: { accept } });

test('migration gate blocks all database routes including login, notifications and integration reads', async () => {
  for (const path of ['/api/session', '/api/notifications', '/api/integrations/work-submissions', '/api/work-submissions', '/api/database-status']) {
    for (const method of ['GET', 'POST', 'DELETE', 'OPTIONS']) {
      const result = api.migrationMaintenance(request(path, method), true);
      assert.equal(result.status, 503);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.equal((await result.json()).maintenance, true);
    }
  }
  assert.equal(api.migrationMaintenance(request('/api/session', 'POST'), false), null);
});

test('maintenance document is visible, status uses no database and only asset reads bypass', async () => {
  const document = api.migrationMaintenance(request('/', 'GET', 'text/html'), true);
  assert.equal(document.status, 503);
  assert.match(await document.text(), /ปิดปรับปรุงระบบ/);
  const status = api.migrationMaintenance(request('/api/migration-status'), true);
  assert.deepEqual(await status.json(), { maintenance: true });
  assert.equal(api.migrationMaintenance(request('/_next/static/app.js'), true), null);
  assert.equal(api.migrationMaintenance(request('/_next/static/app.js', 'POST'), true).status, 503);
  assert.equal(api.migrationMaintenance(request('/api/submissions.csv'), true).status, 503);
});
