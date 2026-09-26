const express = require("express");
const centreController = require("../controllers/centreController");
const { requireAuth } = require("../middleware/auth");
const { validateBody, validateQuery } = require("../middleware/validate");
const {
  createCentreSchema,
  addTestSchema,
  listCentresQuerySchema,
} = require("../schemas");

const router = express.Router();

/**
 * @openapi
 * /centres:
 *   get:
 *     tags: [Centres]
 *     summary: List diagnostic centres (paginated, filter by location)
 *     parameters:
 *       - in: query
 *         name: location
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated list of centres with their tests }
 *   post:
 *     tags: [Centres]
 *     summary: Create a diagnostic centre (optionally with its initial tests)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, location]
 *             properties:
 *               name: { type: string }
 *               location: { type: string }
 *               tests:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     price: { type: number }
 *     responses:
 *       201: { description: Centre created }
 */
router.get("/", validateQuery(listCentresQuerySchema), centreController.listCentres);
router.post("/", requireAuth, validateBody(createCentreSchema), centreController.createCentre);

/**
 * @openapi
 * /centres/{id}:
 *   get:
 *     tags: [Centres]
 *     summary: Get a single diagnostic centre with its tests
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Centre found }
 *       404: { description: Centre not found }
 */
router.get("/:id", centreController.getCentre);

/**
 * @openapi
 * /centres/{id}/tests:
 *   get:
 *     tags: [Centres]
 *     summary: List tests offered by a centre
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: List of tests }
 *       404: { description: Centre not found }
 *   post:
 *     tags: [Centres]
 *     summary: Add a test to a centre
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, price]
 *             properties:
 *               name: { type: string }
 *               price: { type: number }
 *     responses:
 *       201: { description: Test added }
 *       404: { description: Centre not found }
 */
router.get("/:id/tests", centreController.listTestsForCentre);
router.post("/:id/tests", requireAuth, validateBody(addTestSchema), centreController.addTest);

module.exports = router;
