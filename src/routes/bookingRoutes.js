const express = require("express");
const bookingController = require("../controllers/bookingController");
const { requireAuth } = require("../middleware/auth");
const { validateBody, validateQuery } = require("../middleware/validate");
const { createBookingSchema, listBookingsQuerySchema } = require("../schemas");

const router = express.Router();

router.use(requireAuth); // every booking route requires a logged-in user

/**
 * @openapi
 * /bookings:
 *   post:
 *     tags: [Bookings]
 *     summary: Book a diagnostic test
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [testId, appointmentDatetime]
 *             properties:
 *               testId: { type: string, format: uuid }
 *               appointmentDatetime: { type: string, format: date-time }
 *     responses:
 *       201: { description: Booking created with status PENDING }
 *       404: { description: Test not found }
 *   get:
 *     tags: [Bookings]
 *     summary: List the current user's bookings
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, CONFIRMED, FAILED, CANCELLED] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated bookings }
 */
router.post("/", validateBody(createBookingSchema), bookingController.createBooking);
router.get("/", validateQuery(listBookingsQuerySchema), bookingController.listBookings);

/**
 * @openapi
 * /bookings/{id}:
 *   get:
 *     tags: [Bookings]
 *     summary: Get a booking by id (owner only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Booking found }
 *       403: { description: Not the owner of this booking }
 *       404: { description: Booking not found }
 */
router.get("/:id", bookingController.getBooking);

/**
 * @openapi
 * /bookings/{id}/cancel:
 *   post:
 *     tags: [Bookings]
 *     summary: Cancel a booking (owner only; not allowed once CONFIRMED)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Booking cancelled (or already was) }
 *       403: { description: Not the owner of this booking }
 *       404: { description: Booking not found }
 *       409: { description: Booking already confirmed/paid }
 */
router.post("/:id/cancel", bookingController.cancelBooking);

module.exports = router;
