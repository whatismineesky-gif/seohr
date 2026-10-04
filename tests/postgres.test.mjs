import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const api = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../db/postgres.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(api);

test('PostgreSQL translation preserves literals and parameter values and handles application dialect', () => {
  const value = "? COLLATE NOCASE CURRENT_TIMESTAMP ; DROP TABLE users";
  const result = api.postgresQuery("SELECT '?' AS marker, 'CURRENT_TIMESTAMP' AS literal FROM hr_employees WHERE email = ? COLLATE NOCASE AND start_date GLOB '??/??/????'", [value]);
  assert.deepEqual(result.values, [value]);
  assert.match(result.text, /'\?' AS marker/);
  assert.match(result.text, /'CURRENT_TIMESTAMP' AS literal/);
  assert.match(result.text, /lower\(email::text\) = lower\(\$1::text\)/);
  assert.match(result.text, /LIKE '__\/__\/____'/);
  assert.match(api.postgresQuery('SELECT id FROM users WHERE ? IS NOT NULL', [null]).text, /\$1::text IS NOT NULL/);
  assert.match(api.postgresQuery("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')").text, /AT TIME ZONE 'UTC'/);
  assert.match(api.postgresQuery('INSERT OR IGNORE INTO hr_warning_configs(tenure_month,mid_value,min_value) VALUES(?,?,?)', [1,3,0]).text, /ON CONFLICT DO NOTHING$/);
  assert.throws(() => api.postgresQuery('SELECT ?'), /parameter count/);
  assert.throws(() => api.postgresQuery('SELECT 1; DELETE FROM users'), /Multiple SQL/);
  assert.throws(() => api.postgresQuery('SELECT last_insert_rowid()'), /atomic batch/);
});

test('batch uses one transaction, links notification to submitted row and preserves RETURNING', async () => {
  const calls = [];
  let ended = false;
  const client = {
    async connect() { calls.push('CONNECT'); },
    async query(text, values) {
      calls.push({ text, values });
      if (text.startsWith('INSERT INTO hr_work_submissions')) return { rows: [{ id: 425 }], rowCount: 1, command: 'INSERT' };
      if (text.startsWith('INSERT INTO hr_notifications')) {
        assert.equal(values.at(-1), 425);
        return { rows: [{ id: 369 }], rowCount: 1, command: 'INSERT' };
      }
      return { rows: [], rowCount: 0, command: text };
    },
    async end() { ended = true; },
  };
  const db = new api.PostgresDatabase(() => client);
  const result = await db.batch([
    db.prepare('INSERT INTO hr_work_submissions(keyword) VALUES(?)').bind('ไทย'),
    db.prepare("INSERT INTO hr_notifications(source_id,details) VALUES(last_insert_rowid(),?)").bind('{"count":1}'),
  ]);
  assert.equal(result[0].meta.last_row_id, 425);
  assert.equal(result[1].meta.last_row_id, 369);
  assert.equal(calls.filter(c => c.text === 'BEGIN').length, 1);
  assert.equal(calls.at(-1).text, 'COMMIT');
  assert.equal(ended, true);
  assert.equal(api.postgresQuery('INSERT INTO hr_work_submissions(keyword) VALUES(?) RETURNING id', ['ไทย']).addedReturning, false);
});

test('failed batches roll back and close sockets; counts remain safe numbers', async () => {
  const calls = [];
  const db = new api.PostgresDatabase(() => ({
    async connect() {},
    async query(text) {
      calls.push(text);
      if (text.startsWith('UPDATE')) throw new Error('constraint failed');
      if (text.startsWith('SELECT')) return { rows: [{ count: '100' }], rowCount: 1, command: 'SELECT', fields: [{ name: 'count', dataTypeID: 20 }] };
      return { rows: [], rowCount: 0 };
    },
    async end() { calls.push('END'); },
  }));
  assert.deepEqual(await db.prepare('SELECT COUNT(*) AS count FROM hr_employees').first(), { count: 100 });
  await assert.rejects(db.batch([db.prepare('UPDATE hr_employees SET nickname = ?').bind('test')]), /constraint failed/);
  assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'END']);
});
