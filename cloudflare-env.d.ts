declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    HYPERDRIVE?: Hyperdrive;
    DATABASE_PROVIDER?: 'd1' | 'postgres';
    MAINTENANCE_MODE?: '0' | '1';
    BUCKET?: R2Bucket;
  }
}
