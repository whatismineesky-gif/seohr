import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function load(path,dependencies){const exports={};const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports',code)(dependencies,exports);return exports;}
const selection=load('../lib/employee-selection.ts',()=>({}));
test('login defaults use only linked employees in permitted options and preserve explicit choices',()=>{
 const options=[{id:'A'},{id:'B'}];
 assert.equal(selection.defaultEmployeeId(options,'B'),'B');
 assert.equal(selection.defaultEmployeeId(options,null),'');
 assert.equal(selection.defaultEmployeeId(options,'outside'),'');
 assert.equal(selection.selectedEmployeeId(options,'B','A'),'A');
 assert.equal(selection.selectedEmployeeId(options,'B'),'B');
});
test('employee picker waits for async options, defaults once, and does not replace edited records or cleared values',()=>{
 let refs=[],index=0,effects=[],linked='B';
 const react={createContext:()=>({Provider:'provider'}),useContext:()=>linked,useRef:(value)=>refs[index++]??(refs[index-1]={current:value}),useState:(value)=>[value,()=>{}],useEffect:(effect)=>effects.push(effect)};
 const ui=load('../components/searchable-employee-select.tsx',name=>name==='react'?react:name==='react/jsx-runtime'?require(name):name==='@/lib/employee-selection'?selection:name==='@/lib/utils'?{cn:()=>''}:{});
 let value='',calls=[];
 const change=(id)=>{value=id;calls.push(id);};
 function render(options){index=0;effects=[];ui.SearchableEmployeeSelect({employees:options,value,onChange:change});effects.forEach(effect=>effect());}
 render([]);assert.deepEqual(calls,[]);
 render([{id:'A'},{id:'B'}]);assert.equal(value,'B');assert.deepEqual(calls,['B']);
 value='A';render([{id:'A'},{id:'B'}]);assert.equal(value,'A');
 value='';render([{id:'A'},{id:'B'}]);assert.equal(value,'');assert.deepEqual(calls,['B']);
 refs=[];value='A';calls=[];render([{id:'A'},{id:'B'}]);assert.equal(value,'A');assert.deepEqual(calls,[]);
});
