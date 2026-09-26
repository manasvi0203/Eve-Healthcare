const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool({ connectionString: config.databaseUrl });

pool.on("error", (err) => {
  // Unexpected errors on idle clients (e.g. connection dropped by the server)
  // should not crash the process silently -- log loudly.
  // eslint-disable-next-line no-console
  console.error("Unexpected error on idle PG client", err);
});

/**
 * Run `fn` inside a single transaction on a dedicated client, committing on
 * success and rolling back on any thrown error. Used everywhere we need
 * multiple statements to succeed or fail together (booking creation,
 * payment processing, webhook handling).
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
