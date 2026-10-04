import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { validateRuntimeConfig } from '../scripts/runtime-config.mjs';
function load(path, require) {const out={};new Function('require','exports',ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(require,out);return out;}

test('VPS configuration requires HTTPS and restricts the database to loopback with the existing application role',()=>{
  const config={origin:'https://vps.member-seo.com',database:{host:'127.0.0.1',port:5432,name:'people_os',user:'people_os_app',password:'test-only',sslMode:'verify-full',caPath:'test.crt'}};
  assert.equal(validateRuntimeConfig(config).database.poolMax,10);
  for(const patch of [{origin:'http://vps.member-seo.com'},{origin:'https://vps.member-seo.com/path'},{origin:'https://user:pass@vps.member-seo.com'}, {database:{...config.database,host:'0.0.0.0'}},{database:{...config.database,user:'postgres'}},{database:{...config.database,sslMode:'require'}},{database:{...config.database,caPath:''}},{database:{...config.database,poolMax:0}}]) assert.throws(()=>validateRuntimeConfig({...config,...patch}));
});

test('mutation origin uses configured HTTPS origin and rejects forwarded-header spoofing',()=>{
  const previous=process.env.APP_ORIGIN;process.env.APP_ORIGIN='https://vps.member-seo.com';
  try {
    const api=load('../lib/request-origin.ts',()=>{});
    const request=(origin,forwarded='vps.member-seo.com')=>new Request('http://localhost:3000/api/session',{headers:{...(origin?{origin}:{}),'x-forwarded-host':forwarded,'x-forwarded-proto':'https'}});
    assert.equal(api.sameApplicationOrigin(request('https://vps.member-seo.com')),true);
    assert.equal(api.sameApplicationOrigin(request('https://evil.test','evil.test')),false);
    assert.equal(api.sameApplicationOrigin(request()),false);
  } finally {if(previous===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=previous;}
});

test('localhost and Tunnel requests cannot bypass login through the former QA identity',async()=>{
  const api=load('../app/api/auth.ts',name=>name.includes('request-origin')?{sameApplicationOrigin:()=>true}:name.includes('chatgpt-auth')?{getChatGPTUser:async()=>null}:name.includes('system-announcements')?{}:{getSystemAccess:async()=>{throw new Error('Must not authorize anonymous user');}});
  for(const host of ['localhost','127.0.0.1','terminal.local','vps.member-seo.com']) {
    const result=await api.authorizeApi(new Request(`http://${host}/api/access`));
    assert.equal(result.ok,false);assert.equal(result.response.status,401);
  }
});

test('direct PostgreSQL reuses the pool and releases transaction clients after success and failure',async()=>{
  delete globalThis.peopleOsPool; delete globalThis.peopleOsDatabase;
  let pools=0,acquired=0,released=0;const queries=[];
  class Pool {constructor(){pools++;}on(){}async connect(){acquired++;return {async query(sql){queries.push(sql);if(sql==='BROKEN')throw new Error('test failure');return {rows:sql==='SELECT 1 AS n'?[{n:1}]:[],rowCount:0,command:sql.split(' ')[0]};},release(){released++;}};}}
  const adapter=load('../db/postgres.ts',()=>{});
  const api=load('../db/index.ts',name=>name==='pg'?{Pool,types:{getTypeParser:()=>v=>v}}:name==='./postgres'?adapter:name.includes('runtime-config')?{loadRuntimeConfig:()=>({}),databaseOptions:()=>({})}:{});
  const db=api.getD1();assert.equal(api.getPostgres(),db);
  assert.equal((await db.prepare('SELECT 1 AS n').first()).n,1);
  await assert.rejects(db.prepare('BROKEN').run());
  assert.equal(pools,1);assert.equal(acquired,2);assert.equal(released,2);
  assert.ok(queries.includes('ROLLBACK'));
  delete globalThis.peopleOsPool; delete globalThis.peopleOsDatabase;
});
