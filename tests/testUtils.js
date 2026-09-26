process.env.NODE_ENV = "test";

const { pool } = require("../src/db");
const createApp = require("../src/app");

const app = createApp();

/** Wipes all tables between tests so each test starts from a clean slate. */
async function resetDb() {
  await pool.query(`
    TRUNCATE TABLE webhook_events, payments, bookings, diagnostic_tests, diagnostic_centres, users
    RESTART IDENTITY CASCADE
  `);
}

async function closeDb() {
  await pool.end();
}

module.exports = { app, resetDb, closeDb };
