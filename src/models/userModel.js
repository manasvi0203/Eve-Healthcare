const { pool } = require("../db");

async function createUser({ email, fullName, passwordHash }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, full_name, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email, full_name, created_at`,
    [email.toLowerCase().trim(), fullName, passwordHash]
  );
  return rows[0];
}

async function findByEmail(email) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [
    email.toLowerCase().trim(),
  ]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT id, email, full_name, created_at FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { createUser, findByEmail, findById };
