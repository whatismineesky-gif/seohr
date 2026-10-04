import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRuntimeConfig } from './runtime-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = process.env.PEOPLE_OS_CONFIG ?? resolve(root, 'config/runtime.json');
const config = loadRuntimeConfig(configPath);
const require = createRequire(import.meta.url);
const logDirectory = resolve(root, 'logs');
mkdirSync(logDirectory, { recursive: true });
const logFile = resolve(logDirectory, 'web.log');
function log(chunk) {
  if (existsSync(logFile) && statSync(logFile).size > 10 * 1024 * 1024) {
    if (existsSync(`${logFile}.5`)) unlinkSync(`${logFile}.5`);
    for (let i=4; i>=1; i--) if (existsSync(`${logFile}.${i}`)) renameSync(`${logFile}.${i}`, `${logFile}.${i+1}`);
    renameSync(logFile, `${logFile}.1`);
  }
  appendFileSync(logFile, chunk);
  process.stdout.write(chunk);
}
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3000'], {
  cwd: root, windowsHide: true, stdio: ['ignore','pipe','pipe'],
  env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    PEOPLE_OS_CONFIG: configPath, APP_ORIGIN: config.origin, MAINTENANCE_MODE: config.maintenance ? '1' : '0' },
});
child.stdout.on('data', log);
child.stderr.on('data', log);
let stopping = false;
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { stopping=true; child.kill(signal); });
child.on('error', () => { log('Web process failed to start\n'); process.exit(1); });
child.on('exit', code => process.exit(stopping ? 0 : code || 1));
