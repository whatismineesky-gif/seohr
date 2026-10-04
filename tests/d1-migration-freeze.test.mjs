import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

test('D1 migration fence blocks every kind of write, preserves rows and can be released', () => {
  const script = new URL('../scripts/d1-migration-freeze.mjs', import.meta.url);
  const sql = execFileSync(process.execPath, [script.pathname], { encoding: 'utf8' });
  const tables = [...new Set([...sql.matchAll(/ON "([^"]+)" BEGIN/g)].map(match => match[1]))];
  assert.equal(tables.length, 54);
  const db = new DatabaseSync(':memory:');
  for (const table of tables) db.exec(`CREATE TABLE "${table}"(id INTEGER PRIMARY KEY); INSERT INTO "${table}" VALUES(1);`);
  db.exec(sql);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger'").get().count, 162);
  for (const table of tables) {
    for (const statement of [`INSERT INTO "${table}" VALUES(2)`, `UPDATE "${table}" SET id=2`, `DELETE FROM "${table}"`]) {
      assert.throws(() => db.exec(statement), /PEOPLE_OS_MIGRATION_PAUSED/);
    }
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count, 1);
  }
  db.exec(execFileSync(process.execPath, [script.pathname, '--release'], { encoding: 'utf8' }));
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger'").get().count, 0);
  for (const table of tables) db.exec(`INSERT INTO "${table}" VALUES(2)`);
  db.close();
});
