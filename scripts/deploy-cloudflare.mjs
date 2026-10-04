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

const databases = JSON.parse(wrangler("d1", "list", "--json"));
const database = databases.find((item) => item.name === databaseName);
if (!database?.uuid) throw new Error(`ไม่พบ D1 ชื่อ ${databaseName} ในบัญชี Cloudflare นี้`);

const config = JSON.parse(readFileSync(configPath, "utf8"));
config.name = workerName;
config.hyperdrive = [{ binding: 'HYPERDRIVE', id: 'd788523963fc47e4a0eb262772b6cb92' }];
// Stage PostgreSQL connectivity while D1 remains authoritative. Switch only
// after freezing writes and importing a fresh, reconciled D1 snapshot.
config.vars = { ...config.vars, DATABASE_PROVIDER: 'd1' };
config.routes = [{ pattern: "dev.member-seo.com", custom_domain: true }];
config.d1_databases = [{
  binding: "DB",
  database_name: databaseName,
  database_id: database.uuid,
  migrations_dir: "../../migrations",
}];
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

wrangler("d1", "migrations", "apply", databaseName, "--remote", "--config", configPath);
wrangler("deploy", "--config", configPath);
