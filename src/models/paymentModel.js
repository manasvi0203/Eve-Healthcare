const { pool } = require("../db");

async function createPayment(client, { bookingId, amount, status, providerReference }) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `INSERT INTO payments (booking_id, amount, status, provider_reference)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [bookingId, amount, status, providerReference]
  );
  return rows[0];
}

async function getPaymentByProviderReference(client, providerReference) {
  const runner = client || pool;
  const { rows } = await runner.query(`SELECT * FROM payments WHERE provider_reference = $1`, [
    providerReference,
  ]);
  return rows[0] || null;
}

/** Same as above but locks the row -- used inside webhook transactions. */
async function getPaymentByProviderReferenceForUpdate(client, providerReference) {
  const { rows } = await client.query(
    `SELECT * FROM payments WHERE provider_reference = $1 FOR UPDATE`,
    [providerReference]
  );
  return rows[0] || null;
}

async function updatePaymentStatus(client, id, status) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `UPDATE payments SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return rows[0] || null;
}

async function listPaymentsForBooking(bookingId) {
  const { rows } = await pool.query(
    `SELECT * FROM payments WHERE booking_id = $1 ORDER BY created_at DESC`,
    [bookingId]
  );
  return rows;
}

// ---- Webhook idempotency ledger ----

async function recordWebhookEvent(client, eventId, payload) {
  // ON CONFLICT DO NOTHING makes this safe to call even outside a guarded
  // check; RETURNING * lets the caller tell "recorded now" from "already seen"
  // by checking whether a row came back.
  const { rows } = await client.query(
    `INSERT INTO webhook_events (event_id, payload)
     VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING *`,
    [eventId, payload]
  );
  return rows[0] || null; // null => this event_id was already processed before
}

module.exports = {
  createPayment,
  getPaymentByProviderReference,
  getPaymentByProviderReferenceForUpdate,
  updatePaymentStatus,
  listPaymentsForBooking,
  recordWebhookEvent,
};
