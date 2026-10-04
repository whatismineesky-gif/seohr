import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const configPath = "dist/server/wrangler.json";
const databaseName = "people-os";
const workerName = "people-os-api";

function wrangler(...args) {
  return execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", ...args], {
    encoding: "utf8",
    stdio: args.includes("--json") ? ["ignore", "pipe", "inherit"] : "inherit",
  });
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
config.name = workerName;
config.hyperdrive = [{ binding: 'HYPERDRIVE', id: 'd788523963fc47e4a0eb262772b6cb92' }];
// Activate only after the final frozen snapshot has been synchronized and verified.
// Keep D1 bound as a frozen archive; application reads and writes use PostgreSQL.
config.vars = { ...config.vars, DATABASE_PROVIDER: 'postgres', MAINTENANCE_MODE: '0' };
config.routes = [{ pattern: "dev.member-seo.com", custom_domain: true }];
config.d1_databases = [{
  binding: "DB",
  database_name: databaseName,
  database_id: 'd5336781-88a9-4708-b3cd-9f261d3734ba',
  migrations_dir: "../../migrations",
}];
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

// SQLite migrations must not be executed against the archived D1 or PostgreSQL.
// Apply reviewed PostgreSQL schema migrations on the VPS before future schema changes.
wrangler("deploy", "--config", configPath);
