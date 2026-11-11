import { config } from "dotenv";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import pg from "pg";

const root = fileURLToPath(new URL("../../", import.meta.url));
config({ path: resolve(root, ".env") });
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Missing DATABASE_URL in root .env");
const pool = new pg.Pool({ connectionString: url, max: 1,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined });
const dir = resolve(root, "db/migrations");
const client = await pool.connect();
try {
  // Session-level advisory lock prevents concurrent migrators.
  await client.query("SELECT pg_advisory_lock(87342119)");
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const names = (await readdir(dir)).filter((n) => /^\d+_.*\.sql$/.test(n)).sort();
    for (const name of names) {
      const sql = await readFile(resolve(dir, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE filename = $1", [name]);
      if (existing.rows.length) {
        if (existing.rows[0]?.checksum !== checksum) throw new Error(`Migration changed after application: ${name}`);
        console.log(`SKIP ${name}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(filename, checksum) VALUES ($1,$2)", [name, checksum]);
        await client.query("COMMIT");
        console.log(`APPLIED ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    console.log("Migrations complete.");
  } finally {
    await client.query("SELECT pg_advisory_unlock(87342119)");
  }
} finally {
  client.release();
  await pool.end();
}