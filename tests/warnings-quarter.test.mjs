import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import ts from 'typescript';

test('quarter view includes every recorded quarter and active employees without deposits', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE hr_employees (id TEXT PRIMARY KEY, nickname TEXT, team TEXT, start_date TEXT, status TEXT, sequence INTEGER);
    CREATE TABLE hr_warning_configs (tenure_month INTEGER PRIMARY KEY, mid_value INTEGER, min_value INTEGER);
    CREATE TABLE hr_monthly_deposit_results (employee_id TEXT, result_month TEXT, tenure_month INTEGER,
      deposit_count INTEGER, mid_value INTEGER, min_value INTEGER, result_type TEXT, tenure_quarter INTEGER, quarter_month INTEGER);
    INSERT INTO hr_employees VALUES ('A','A','SEO 1','2026-01-01','ยังทำงานอยู่',1),('B','B','SEO 2','2026-02-01','ยังทำงานอยู่',2),
      ('C','C','SEO 3','2026-01-01','ยังทำงานอยู่',3),
      ('D','D','SEO 4','2026-01-01','ลาออก',4);
    INSERT INTO hr_monthly_deposit_results VALUES
      ('A','2026-01',1,2,3,0,'yellow',1,1),
      ('A','2026-02',2,0,30,25,'red',1,2),
      ('A','2026-03',3,60,55,50,'winloss',1,3),
      ('A','2026-04',4,90,75,65,'winloss',2,1),
      ('A','2026-07',7,250,220,200,'winloss',3,1),
      ('B','2026-04',3,10,50,45,'red',1,3),
      ('D','2026-01',1,0,3,0,'red',1,1);`);
  const database = {
    prepare(sql) {
      let values=[];
      const statement={
        bind(...args) { values=args;return statement; },
        all() {return {results:sqlite.prepare(sql).all(...values)};},
        first() {return sqlite.prepare(sql).get(...values)??null;},
        execute() {sqlite.prepare(sql).run(...values);return {results:[]};},
      };return statement;
    },
    async batch(statements) {return statements.map(s=>s.execute());},
  };
  const code=ts.transpileModule(readFileSync(new URL('../db/warnings.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const exports={};
  new Function('require','exports',code)(name=>name==='./index'?{getD1:()=>database}:name==='./employees'?{ensureEmployeesSeeded:async()=>{}}:{},exports);
  const result=await exports.getWarningData('2026-04');
  assert.equal(result.quarterSummary.length,6);
  const blank=result.quarterSummary.find(r=>r.employeeId==='C');
  assert.equal(blank.tenureQuarter,2);
  assert.equal(blank.recordedMonths,0);
  assert.equal(blank.depositTotal,0);
  assert.equal(blank.minTotal,65+100+140);
  assert.deepEqual(blank.months.map(r=>r.depositCount),[null,null,null]);
  assert.deepEqual(blank.months.map(r=>r.resultType),[null,null,null]);
  assert.deepEqual(blank.months.map(r=>r.resultMonth),['2026-04','2026-05','2026-06']);
  assert.equal(result.quarterSummary.find(r=>r.employeeId==='D').recordedMonths,1);
  assert.equal(result.rows.some(r=>r.employeeId==='D'),false);
  const previous=await exports.getWarningData('2026-03');
  const first=previous.quarterSummary.find(r=>r.employeeId==='A'&&r.tenureQuarter===1);
  assert.equal(first.minTotal,75);
  assert.equal(first.depositTotal,62);
  assert.equal(first.recordedMonths,3);
  assert.equal(first.yellowCount,1);
  assert.equal(first.redCount,1);
  assert.deepEqual(first.months.map(r=>r.resultType),['yellow','red','winloss']);
  assert.deepEqual(first.months.map(r=>r.resultMonth),['2026-01','2026-02','2026-03']);
  const second=result.quarterSummary.find(r=>r.employeeId==='A'&&r.tenureQuarter===2);
  assert.equal(second.minTotal,65+100+140);
  assert.equal(second.recordedMonths,1);
  assert.deepEqual(second.months.map(r=>r.depositCount),[90,null,null]);
  assert.deepEqual(second.months.map(r=>r.resultMonth),['2026-04','2026-05','2026-06']);
  const offset=result.quarterSummary.find(r=>r.employeeId==='B');
  assert.deepEqual(offset.months.map(r=>r.resultMonth),['2026-02','2026-03','2026-04']);
  assert.equal(offset.minTotal,70);
  assert.equal(offset.months[2].depositCount,10);
  const next=await exports.getWarningData('2026-07');
  assert.deepEqual(next.quarterSummary.filter(r=>r.employeeId==='A').map(r=>r.tenureQuarter).sort(),[1,2,3]);
  assert.equal(next.quarterSummary.find(r=>r.employeeId==='C').tenureQuarter,3);
  const newYear=await exports.getWarningData('2027-01');
  assert.deepEqual(newYear.quarterSummary.find(r=>r.employeeId==='C').months.map(r=>r.resultMonth),['2027-01','2027-02','2027-03']);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM hr_monthly_deposit_results').get().count,7);
  sqlite.close();
});
