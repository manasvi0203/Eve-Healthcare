const { pool, withTransaction } = require("../db");

async function createCentre({ name, location, tests = [] }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO diagnostic_centres (name, location) VALUES ($1, $2) RETURNING *`,
      [name, location]
    );
    const centre = rows[0];

    const createdTests = [];
    for (const t of tests) {
      const { rows: testRows } = await client.query(
        `INSERT INTO diagnostic_tests (centre_id, name, price) VALUES ($1, $2, $3) RETURNING *`,
        [centre.id, t.name, t.price]
      );
      createdTests.push(testRows[0]);
    }
    return { ...centre, tests: createdTests };
  });
}

async function listCentres({ location, page = 1, pageSize = 20 }) {
  const offset = (page - 1) * pageSize;
  const conditions = [];
  const values = [];

  if (location) {
    values.push(`%${location.toLowerCase()}%`);
    conditions.push(`LOWER(location) LIKE $${values.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM diagnostic_centres ${whereClause}`,
    values
  );

  values.push(pageSize, offset);
  const { rows } = await pool.query(
    `SELECT * FROM diagnostic_centres ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  return { total: countResult.rows[0].total, items: rows };
}

async function getCentreById(id) {
  const { rows } = await pool.query(`SELECT * FROM diagnostic_centres WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function getTestsForCentre(centreId) {
  const { rows } = await pool.query(
    `SELECT * FROM diagnostic_tests WHERE centre_id = $1 ORDER BY name`,
    [centreId]
  );
  return rows;
}

async function addTestToCentre(centreId, { name, price }) {
  const { rows } = await pool.query(
    `INSERT INTO diagnostic_tests (centre_id, name, price) VALUES ($1, $2, $3) RETURNING *`,
    [centreId, name, price]
  );
  return rows[0];
}

async function getTestById(testId) {
  const { rows } = await pool.query(`SELECT * FROM diagnostic_tests WHERE id = $1`, [testId]);
  return rows[0] || null;
}

async function listAllTests({ page = 1, pageSize = 20 }) {
  const offset = (page - 1) * pageSize;
  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM diagnostic_tests`);
  const { rows } = await pool.query(
    `SELECT t.*, c.name AS centre_name, c.location AS centre_location
     FROM diagnostic_tests t
     JOIN diagnostic_centres c ON c.id = t.centre_id
     ORDER BY t.created_at DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );
  return { total: countResult.rows[0].total, items: rows };
}

module.exports = {
  createCentre,
  listCentres,
  getCentreById,
  getTestsForCentre,
  addTestToCentre,
  getTestById,
  listAllTests,
};
