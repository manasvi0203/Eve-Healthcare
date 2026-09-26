const express = require("express");
const centreController = require("../controllers/centreController");
const { validateQuery } = require("../middleware/validate");
const { listCentresQuerySchema } = require("../schemas");

const router = express.Router();

/**
 * @openapi
 * /tests:
 *   get:
 *     tags: [Centres]
 *     summary: List all diagnostic tests across every centre (paginated)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated list of tests }
 */
router.get("/", validateQuery(listCentresQuerySchema), centreController.listAllTests);

module.exports = router;
