const express = require("express");
const paymentController = require("../controllers/paymentController");
const { requireAuth } = require("../middleware/auth");
const { validateBody } = require("../middleware/validate");
const { createPaymentSchema, webhookPayloadSchema } = require("../schemas");

const router = express.Router();

/**
 * @openapi
 * /payments:
 *   post:
 *     tags: [Payments]
 *     summary: Simulate a payment attempt for a booking
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bookingId]
 *             properties:
 *               bookingId: { type: string, format: uuid }
 *               forceOutcome:
 *                 type: string
 *                 enum: [SUCCESS, FAILED]
 *                 description: Test-only override to force a deterministic outcome.
 *     responses:
 *       201: { description: Payment processed; booking updated to CONFIRMED or FAILED }
 *       200: { description: Booking was already CONFIRMED; existing payment returned }
 *       403: { description: Not the owner of this booking }
 *       404: { description: Booking not found }
 *       409: { description: Booking is CANCELLED and cannot be paid for }
 */
router.post("/", requireAuth, validateBody(createPaymentSchema), paymentController.pay);

/**
 * @openapi
 * /payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Receive an (simulated) async payment status update. Idempotent by eventId.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [eventId, providerReference, status]
 *             properties:
 *               eventId: { type: string, description: Unique id for this delivery }
 *               providerReference: { type: string }
 *               status: { type: string, enum: [SUCCESS, FAILED] }
 *     responses:
 *       200: { description: Processed (or recognized as a duplicate and skipped) }
 *       404: { description: No payment found for this provider_reference }
 */
// No requireAuth here: a real payment provider's webhook caller is not one of
// our end users. In production this would instead be protected by verifying
// a signature header the provider sends (see README "What I'd improve").
router.post("/webhook", validateBody(webhookPayloadSchema), paymentController.webhook);

/**
 * @openapi
 * /payments/booking/{bookingId}:
 *   get:
 *     tags: [Payments]
 *     summary: List payment attempts for a booking (owner only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: List of payment attempts }
 */
router.get("/booking/:bookingId", requireAuth, paymentController.listForBooking);

module.exports = router;
