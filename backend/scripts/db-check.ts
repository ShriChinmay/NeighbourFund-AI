import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import pg from "pg";
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query<{ current_database: string; tables: string }>(`
    SELECT current_database(),
      (SELECT count(*)::text FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tables
  `);
  const migrations = await pool.query("SELECT filename, applied_at FROM schema_migrations ORDER BY filename");
  console.log("Database:", result.rows[0]);
  console.table(migrations.rows);
} finally { await pool.end(); }