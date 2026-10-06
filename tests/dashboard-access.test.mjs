import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
function load(path, require) {
  const result={};
  const permissionModule = {}; new Function('exports',ts.transpileModule(readFileSync(new URL('../lib/work-submission-permissions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(permissionModule);
  const dependency = name => name.includes('work-submission-permissions') ? permissionModule : require(name);
  new Function('require','exports',ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(dependency,result);
  return result;
}

test('legacy, default and malformed menu settings deny dashboard for all roles', async()=>{
  for (const role of ['hr','employee','audit']) {
    for (const permissions of ['["dashboard","payroll","submissions"]','[]','broken',null,'["work_submission_editor"]']) {
      const user={role,email:'test@example.test'};
      const db={prepare(){const stmt={bind(){return stmt;},first(){return {menu_permissions:permissions};}};return stmt;}};
      const api=load('../db/access.ts',name=>name==='./index'?{getD1:()=>db}:name==='./attendance'?{ensureAttendanceSetup:async()=>user}:{});
      const access=await api.getSystemAccess(user);
      assert.equal(access.permissions.includes('dashboard'),false);
      assert.equal(access.permissions.includes('checkin'),true);
      if(permissions?.includes('payroll')) assert.equal(access.permissions.includes('payroll'),true);
    }
  }
});

test('saving user access strips requested dashboard for every role', async()=>{
  for(const role of ['hr','employee','audit']) {
    let saved;
    const db={prepare(sql){let args;const stmt={bind(...values){args=values;return stmt;},first(){return sql.includes('FROM users')?{id:'existing-account'}:null;},run(){if(sql.includes('INSERT INTO hr_system_users'))saved=args;return {};}};return stmt;}};
    const api=load('../db/access.ts',()=>({getD1:()=>db}));
    await api.saveAccessUser({role:'hr'},{email:'test@example.test',loginUsername:'testuser',role,permissions:['dashboard','submissions']});
    assert.equal(saved[2],role);
    const permissions=JSON.parse(saved[4]);
    assert.equal(permissions.includes('dashboard'),false);
    assert.equal(permissions.includes('checkin'),true);
    assert.equal(permissions.includes('submissions'),true);
  }
});

test('disabled dashboard API does not authorize or query the database', async()=>{
  const route=load('../app/api/dashboard/route.ts',()=>{throw new Error('Dashboard must not load dependencies or query data');});
  assert.equal((await route.GET(new Request('https://example.test/api/dashboard'))).status,410);
});

test('saving menu permissions preserves a separately configured editor grant', async()=>{
  let saved;
  const db={prepare(sql){let args;const stmt={bind(...values){args=values;return stmt;},first(){return sql.includes('FROM users')?{id:'existing-account'}:sql.includes('menu_permissions')?{menu_permissions:'["submissions","work_submission_editor"]'}:null;},run(){if(sql.includes('INSERT INTO hr_system_users'))saved=args;return {};}};return stmt;}};
  const api=load('../db/access.ts',()=>({getD1:()=>db}));
  await api.saveAccessUser({role:'hr'},{email:'test@example.test',loginUsername:'testuser',role:'employee',permissions:['attendance','submissions']});
  assert.deepEqual(JSON.parse(saved[4]),['checkin','attendance','submissions','work_submission_editor']);
});
