const { z } = require("zod");

// zod's built-in .email() got noticeably stricter/buggier across recent 3.x
// point releases (rejects plenty of valid addresses). A simple, well-known
// RFC-5322-ish check is more predictable here.
const emailSchema = z
  .string()
  .min(3)
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address");

const signupSchema = z.object({
  email: emailSchema,
  fullName: z.string().min(1).max(120),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

const testInputSchema = z.object({
  name: z.string().min(1).max(120),
  price: z.number().positive(),
});

const createCentreSchema = z.object({
  name: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  tests: z.array(testInputSchema).optional().default([]),
});

const addTestSchema = testInputSchema;

const listCentresQuerySchema = z.object({
  location: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});

const createBookingSchema = z.object({
  testId: z.string().uuid("testId must be a valid UUID"),
  appointmentDatetime: z
    .string()
    .datetime({ message: "appointmentDatetime must be an ISO-8601 datetime string" })
    .refine((val) => new Date(val).getTime() > Date.now(), {
      message: "appointmentDatetime must be in the future",
    }),
});

const listBookingsQuerySchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "FAILED", "CANCELLED"]).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});

const createPaymentSchema = z.object({
  bookingId: z.string().uuid("bookingId must be a valid UUID"),
  // Test/demo-only override; see README for why this exists.
  forceOutcome: z.enum(["SUCCESS", "FAILED"]).optional(),
});

const webhookPayloadSchema = z.object({
  eventId: z.string().min(1),
  providerReference: z.string().min(1),
  status: z.enum(["SUCCESS", "FAILED"]),
});

module.exports = {
  signupSchema,
  loginSchema,
  createCentreSchema,
  addTestSchema,
  listCentresQuerySchema,
  createBookingSchema,
  listBookingsQuerySchema,
  createPaymentSchema,
  webhookPayloadSchema,
};
