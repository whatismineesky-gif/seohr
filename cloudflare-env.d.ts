declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    HYPERDRIVE?: Hyperdrive;
    DATABASE_PROVIDER?: 'd1' | 'postgres';
    BUCKET?: R2Bucket;
  }
}
