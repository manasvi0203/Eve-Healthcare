const bookingModel = require("../models/bookingModel");
const paymentModel = require("../models/paymentModel");
const paymentService = require("../services/paymentService");
const { withTransaction } = require("../db");
const { NotFoundError, ForbiddenError, ConflictError, BadRequestError } = require("../utils/errors");
const asyncHandler = require("../utils/asyncHandler");

/**
 * POST /payments/
 *
 * Simulates a synchronous payment attempt for a booking:
 *   - Locks the booking row so two concurrent pay attempts on the same
 *     booking can't both succeed.
 *   - Refuses to charge a CANCELLED booking.
 *   - If the booking is already CONFIRMED, this is treated as an idempotent
 *     retry: we return the existing successful payment instead of creating
 *     a second charge.
 *   - Otherwise creates a new Payment row, "calls" the simulated provider
 *     (decideOutcome), and updates the booking to CONFIRMED or FAILED to
 *     match.
 */
const pay = asyncHandler(async (req, res) => {
  const { bookingId, forceOutcome } = req.body;

  const result = await withTransaction(async (client) => {
    const booking = await bookingModel.getBookingByIdForUpdate(client, bookingId);
    if (!booking) throw new NotFoundError("Booking not found.");
    if (booking.user_id !== req.user.id) {
      throw new ForbiddenError("You do not have access to this booking.");
    }
    if (booking.status === "CANCELLED") {
      throw new ConflictError("Cannot pay for a cancelled booking.");
    }
    if (booking.status === "CONFIRMED") {
      // Idempotent retry: booking already paid, hand back the record of that
      // instead of charging again.
      const payments = await paymentModel.listPaymentsForBooking(booking.id);
      const successPayment = payments.find((p) => p.status === "SUCCESS") || payments[0];
      return { booking, payment: successPayment, alreadyProcessed: true };
    }

    const outcome = paymentService.decideOutcome(forceOutcome);
    const payment = await paymentModel.createPayment(client, {
      bookingId: booking.id,
      amount: booking.amount,
      status: outcome,
      providerReference: paymentService.generateProviderReference(),
    });

    const newBookingStatus = outcome === "SUCCESS" ? "CONFIRMED" : "FAILED";
    const updatedBooking = await bookingModel.updateBookingStatus(client, booking.id, newBookingStatus);

    return { booking: updatedBooking, payment, alreadyProcessed: false };
  });

  res.status(result.alreadyProcessed ? 200 : 201).json({
    booking: result.booking,
    payment: result.payment,
  });
});

/**
 * POST /payments/webhook/
 *
 * Simulates receiving an asynchronous status update from the payment
 * provider. MUST be idempotent: the same event_id delivered N times has the
 * exact same effect as delivering it once.
 *
 * Idempotency strategy (two independent layers, since a real provider may
 * reuse event ids across retries of the *same* event, or fire a fresh event
 * id for a transaction whose outcome we've already resolved by other means):
 *   1. `webhook_events.event_id` is UNIQUE. We try to record the event first;
 *      if a row with this event_id already exists, this is a byte-for-byte
 *      replay and we short-circuit as a no-op.
 *   2. Even for a *new* event_id, we lock the Payment row by
 *      provider_reference and only apply the update if it is still PENDING.
 *      If it has already been resolved (e.g. by the synchronous /payments/
 *      call, or an earlier webhook), we no-op instead of re-applying it.
 * All of this happens inside one DB transaction so a crash mid-way can never
 * leave the event recorded without its effect applied (or vice versa).
 */
const webhook = asyncHandler(async (req, res) => {
  const { eventId, providerReference, status } = req.body;

  const result = await withTransaction(async (client) => {
    const inserted = await paymentModel.recordWebhookEvent(client, eventId, req.body);
    if (!inserted) {
      return { duplicate: true };
    }

    const payment = await paymentModel.getPaymentByProviderReferenceForUpdate(client, providerReference);
    if (!payment) {
      throw new NotFoundError("No payment found for this provider_reference.");
    }

    if (payment.status !== "PENDING") {
      // Already resolved by an earlier webhook or the synchronous pay call --
      // applying this event again would be unsafe, so treat it as a no-op.
      return { duplicate: true, payment };
    }

    const updatedPayment = await paymentModel.updatePaymentStatus(client, payment.id, status);
    const newBookingStatus = status === "SUCCESS" ? "CONFIRMED" : "FAILED";
    const updatedBooking = await bookingModel.updateBookingStatus(client, payment.booking_id, newBookingStatus);

    return { duplicate: false, payment: updatedPayment, booking: updatedBooking };
  });

  if (result.duplicate) {
    return res.status(200).json({ message: "Event already processed; no action taken.", ...result });
  }
  res.status(200).json({ message: "Webhook processed.", payment: result.payment, booking: result.booking });
});

const listForBooking = asyncHandler(async (req, res) => {
  const booking = await bookingModel.getBookingById(req.params.bookingId);
  if (!booking) throw new NotFoundError("Booking not found.");
  if (booking.user_id !== req.user.id) {
    throw new ForbiddenError("You do not have access to this booking.");
  }
  const payments = await paymentModel.listPaymentsForBooking(booking.id);
  res.json({ items: payments });
});

module.exports = { pay, webhook, listForBooking };
