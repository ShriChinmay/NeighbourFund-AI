import pg from "pg";
import { env } from "./env.js";

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required for database operations."
    );
  }

  pool ??= new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl:
      env.NODE_ENV === "production"
        ? { rejectUnauthorized: true }
        : undefined,
  });

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const current = pool;
    pool = undefined;
    await current.end();
  }
}
