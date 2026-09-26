/**
 * Tiny "migration" runner: this project's schema is simple enough to keep as
 * a single, idempotent schema.sql (every statement is IF NOT EXISTS / handles
 * duplicate_object). Running this script is safe on a fresh DB or a DB that
 * already has the schema applied.
 *
 * A real production project would use a proper migration tool
 * (node-pg-migrate, Knex migrations, Prisma Migrate, etc.) so that schema
 * changes are versioned one-by-one instead of living in one file. See the
 * README "What I'd improve" section.
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const config = require("../src/config");

async function main() {
  const pool = new Pool({ connectionString: config.databaseUrl });
  console.log(`Applying schema to: ${config.databaseUrl}`);
  const sql = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
  try {
    await pool.query(sql);
    console.log("Schema applied successfully.");
  } catch (err) {
    console.error("Failed to apply schema:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
