const bookingModel = require("../models/bookingModel");
const centreModel = require("../models/centreModel");
const { withTransaction } = require("../db");
const { NotFoundError, ForbiddenError, ConflictError, BadRequestError } = require("../utils/errors");
const asyncHandler = require("../utils/asyncHandler");

const createBooking = asyncHandler(async (req, res) => {
  const { testId, appointmentDatetime } = req.body;

  const test = await centreModel.getTestById(testId);
  if (!test) {
    throw new NotFoundError("Diagnostic test not found.");
  }

  // Snapshot the price now, so it stays fixed for this booking even if the
  // centre changes the test's price later.
  const booking = await withTransaction((client) =>
    bookingModel.createBooking(client, {
      userId: req.user.id,
      testId: test.id,
      centreId: test.centre_id,
      appointmentDatetime,
      amount: test.price,
    })
  );

  res.status(201).json({ booking });
});

const listBookings = asyncHandler(async (req, res) => {
  const { status, page, pageSize } = req.query;
  const { total, items } = await bookingModel.listBookingsForUser(req.user.id, {
    status,
    page,
    pageSize,
  });
  res.json({ total, page, pageSize, items });
});

async function loadOwnedBooking(req) {
  const booking = await bookingModel.getBookingById(req.params.id);
  if (!booking) throw new NotFoundError("Booking not found.");
  if (booking.user_id !== req.user.id) {
    throw new ForbiddenError("You do not have access to this booking.");
  }
  return booking;
}

const getBooking = asyncHandler(async (req, res) => {
  const booking = await loadOwnedBooking(req);
  res.json({ booking });
});

const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await loadOwnedBooking(req);

  if (booking.status === "CANCELLED") {
    // Cancelling an already-cancelled booking is a no-op, not an error --
    // makes the endpoint safe to retry.
    return res.json({ booking });
  }
  if (booking.status === "CONFIRMED") {
    throw new ConflictError("A confirmed (paid) booking cannot be cancelled here.");
  }

  const updated = await bookingModel.updateBookingStatus(null, booking.id, "CANCELLED");
  res.json({ booking: updated });
});

module.exports = { createBooking, listBookings, getBooking, cancelBooking, loadOwnedBooking };
