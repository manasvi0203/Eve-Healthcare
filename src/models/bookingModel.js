const { pool } = require("../db");

async function createBooking(client, { userId, testId, centreId, appointmentDatetime, amount }) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `INSERT INTO bookings (user_id, test_id, centre_id, appointment_datetime, amount, status)
     VALUES ($1, $2, $3, $4, $5, 'PENDING')
     RETURNING *`,
    [userId, testId, centreId, appointmentDatetime, amount]
  );
  return rows[0];
}

async function getBookingById(id, client) {
  const runner = client || pool;
  const { rows } = await runner.query(`SELECT * FROM bookings WHERE id = $1`, [id]);
  return rows[0] || null;
}

/**
 * Locks the booking row for update within an existing transaction. Used by
 * the payment flow so two concurrent payment attempts for the same booking
 * can't both read PENDING and both proceed to mark it CONFIRMED/FAILED.
 */
async function getBookingByIdForUpdate(client, id) {
  const { rows } = await client.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] || null;
}

async function listBookingsForUser(userId, { status, page = 1, pageSize = 20 }) {
  const conditions = [`user_id = $1`];
  const values = [userId];

  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM bookings ${whereClause}`,
    values
  );

  values.push(pageSize, (page - 1) * pageSize);
  const { rows } = await pool.query(
    `SELECT * FROM bookings ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  return { total: countResult.rows[0].total, items: rows };
}

async function updateBookingStatus(client, id, status) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `UPDATE bookings SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return rows[0] || null;
}

module.exports = {
  createBooking,
  getBookingById,
  getBookingByIdForUpdate,
  listBookingsForUser,
  updateBookingStatus,
};
