import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadRuntimeConfig, validateRuntimeConfig } from './runtime-config.mjs';
const file=process.env.PEOPLE_OS_CONFIG ?? resolve('config/runtime.json');
const config=validateRuntimeConfig({...loadRuntimeConfig(file),origin:process.argv[2]});
writeFileSync(file,JSON.stringify(config,null,2)+'\n',{mode:0o600});
console.log(`Origin updated to ${config.origin}. Restart PeopleOS-Web to apply.`);
