import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
function load(path, require) {
  const result={};
  new Function('require','exports',ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(require,result);
  return result;
}

test('legacy, default and malformed menu settings grant dashboard only to HR', async()=>{
  for (const role of ['hr','employee','audit']) {
    for (const permissions of ['["dashboard","payroll","submissions"]','[]','broken',null]) {
      const user={role,email:'test@example.test'};
      const db={prepare(){const stmt={bind(){return stmt;},first(){return {menu_permissions:permissions};}};return stmt;}};
      const api=load('../db/access.ts',name=>name==='./index'?{getD1:()=>db}:name==='./attendance'?{ensureAttendanceSetup:async()=>user}:{});
      const access=await api.getSystemAccess(user);
      assert.equal(access.permissions.includes('dashboard'),role==='hr');
      assert.equal(access.permissions.includes('checkin'),true);
      if(permissions?.includes('payroll')) assert.equal(access.permissions.includes('payroll'),true);
    }
  }
});

test('saving user access strips requested dashboard for non-HR and keeps HR dashboard', async()=>{
  for(const role of ['hr','employee','audit']) {
    let saved;
    const db={prepare(sql){let args;const stmt={bind(...values){args=values;return stmt;},first(){return sql.includes('FROM users')?{id:'existing-account'}:null;},run(){if(sql.includes('INSERT INTO hr_system_users'))saved=args;return {};}};return stmt;}};
    const api=load('../db/access.ts',()=>({getD1:()=>db}));
    await api.saveAccessUser({role:'hr'},{email:'test@example.test',loginUsername:'testuser',role,permissions:['dashboard','submissions']});
    assert.equal(saved[2],role);
    const permissions=JSON.parse(saved[4]);
    assert.equal(permissions.includes('dashboard'),role==='hr');
    assert.equal(permissions.includes('checkin'),true);
    assert.equal(permissions.includes('submissions'),true);
  }
});

test('dashboard API requires HR role even if a legacy dashboard permission is present', async()=>{
  let queried=false;
  const route=load('../app/api/dashboard/route.ts',name=>name.includes('/auth')?{
    authorizeApi:async(_request,options)=>{assert.deepEqual(options.roles,['hr']);assert.deepEqual(options.anyPermissions,['dashboard']);return {ok:false,response:new Response(null,{status:403})};},
  }:{getMonthlyDashboard:async()=>{queried=true;}});
  assert.equal((await route.GET(new Request('https://example.test/api/dashboard'))).status,403);
  assert.equal(queried,false);
});
