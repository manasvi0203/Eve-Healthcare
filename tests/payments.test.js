const request = require("supertest");
const { app, resetDb, closeDb } = require("./testUtils");
const { pool } = require("../src/db");

beforeEach(resetDb);
afterAll(closeDb);

async function setupBooking(email) {
  await request(app)
    .post("/api/auth/signup")
    .send({ email, fullName: "User", password: "password123" });
  const loginRes = await request(app).post("/api/auth/login").send({ email, password: "password123" });
  const token = loginRes.body.accessToken;

  const centreRes = await request(app)
    .post("/api/centres")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Test Centre", location: "Delhi", tests: [{ name: "CBC", price: 499 }] });
  const testId = centreRes.body.centre.tests[0].id;

  const bookingRes = await request(app)
    .post("/api/bookings")
    .set("Authorization", `Bearer ${token}`)
    .send({ testId, appointmentDatetime: new Date(Date.now() + 86400000).toISOString() });

  return { token, bookingId: bookingRes.body.booking.id };
}

describe("Payments (synchronous simulate endpoint)", () => {
  test("a forced SUCCESS payment confirms the booking", async () => {
    const { token, bookingId } = await setupBooking("payer1@example.org");

    const res = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingId, forceOutcome: "SUCCESS" });

    expect(res.status).toBe(201);
    expect(res.body.payment.status).toBe("SUCCESS");
    expect(res.body.booking.status).toBe("CONFIRMED");
  });

  test("a forced FAILED payment marks the booking FAILED", async () => {
    const { token, bookingId } = await setupBooking("payer2@example.org");

    const res = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingId, forceOutcome: "FAILED" });

    expect(res.status).toBe(201);
    expect(res.body.payment.status).toBe("FAILED");
    expect(res.body.booking.status).toBe("FAILED");
  });

  test("a FAILED booking can be retried and confirmed on a later successful attempt", async () => {
    const { token, bookingId } = await setupBooking("payer3@example.org");

    await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingId, forceOutcome: "FAILED" });

    const retry = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingId, forceOutcome: "SUCCESS" });

    expect(retry.status).toBe(201);
    expect(retry.body.booking.status).toBe("CONFIRMED");

    const { rows } = await pool.query("SELECT * FROM payments WHERE booking_id = $1", [bookingId]);
    expect(rows).toHaveLength(2); // one FAILED attempt + one SUCCESS attempt, not overwritten
  });

  test("paying an already-CONFIRMED booking again does not double-charge", async () => {
    const { token, bookingId } = await setupBooking("payer4@example.org");

    const first = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingId, forceOutcome: "SUCCESS" });
    const second = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingId, forceOutcome: "SUCCESS" });

    expect(second.status).toBe(200); // 200, not 201: no new charge was created
    expect(second.body.payment.id).toBe(first.body.payment.id);

    const { rows } = await pool.query("SELECT * FROM payments WHERE booking_id = $1", [bookingId]);
    expect(rows).toHaveLength(1);
  });

  test("cannot pay for a CANCELLED booking", async () => {
    const { token, bookingId } = await setupBooking("payer5@example.org");
    await request(app).post(`/api/bookings/${bookingId}/cancel`).set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingId, forceOutcome: "SUCCESS" });

    expect(res.status).toBe(409);
  });

  test("cannot pay for someone else's booking", async () => {
    const { bookingId } = await setupBooking("owner2@example.org");
    await request(app)
      .post("/api/auth/signup")
      .send({ email: "intruder2@example.org", fullName: "Intruder", password: "password123" });
    const intruderLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "intruder2@example.org", password: "password123" });

    const res = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${intruderLogin.body.accessToken}`)
      .send({ bookingId, forceOutcome: "SUCCESS" });

    expect(res.status).toBe(403);
  });

  test("404s when paying for a non-existent booking", async () => {
    const { token } = await setupBooking("payer6@example.org");
    const res = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingId: "00000000-0000-0000-0000-000000000000", forceOutcome: "SUCCESS" });

    expect(res.status).toBe(404);
  });
});

describe("Payment webhook (idempotency)", () => {
  async function createPendingPayment(bookingId, providerReference) {
    await pool.query(
      `INSERT INTO payments (booking_id, amount, status, provider_reference)
       VALUES ($1, 499.00, 'PENDING', $2)`,
      [bookingId, providerReference]
    );
  }

  test("a fresh webhook event confirms a PENDING payment and its booking", async () => {
    const { bookingId } = await setupBooking("wh1@example.org");
    const ref = "sim_ref_1";
    await createPendingPayment(bookingId, ref);

    const res = await request(app)
      .post("/api/payments/webhook")
      .send({ eventId: "evt_1", providerReference: ref, status: "SUCCESS" });

    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe("SUCCESS");
    expect(res.body.booking.status).toBe("CONFIRMED");
  });

  test("replaying the exact same event_id is a no-op (does not re-apply or error)", async () => {
    const { bookingId } = await setupBooking("wh2@example.org");
    const ref = "sim_ref_2";
    await createPendingPayment(bookingId, ref);

    const first = await request(app)
      .post("/api/payments/webhook")
      .send({ eventId: "evt_2", providerReference: ref, status: "SUCCESS" });
    // Attacker/provider retries the same event, even with a (hypothetically) different status --
    // it must still be ignored, because event_id has already been recorded.
    const replay = await request(app)
      .post("/api/payments/webhook")
      .send({ eventId: "evt_2", providerReference: ref, status: "FAILED" });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);

    const { rows } = await pool.query("SELECT status FROM bookings WHERE id = $1", [bookingId]);
    expect(rows[0].status).toBe("CONFIRMED"); // unaffected by the replayed event

    const events = await pool.query("SELECT COUNT(*)::int AS c FROM webhook_events WHERE event_id = $1", [
      "evt_2",
    ]);
    expect(events.rows[0].c).toBe(1); // exactly one row, not duplicated
  });

  test("a second, differently-idd event for an already-resolved payment is also a no-op", async () => {
    const { bookingId } = await setupBooking("wh3@example.org");
    const ref = "sim_ref_3";
    await createPendingPayment(bookingId, ref);

    await request(app)
      .post("/api/payments/webhook")
      .send({ eventId: "evt_3a", providerReference: ref, status: "SUCCESS" });

    // A different event id, but for a payment that is no longer PENDING --
    // e.g. the provider fired a genuinely new "reminder" event after we'd
    // already resolved things via the synchronous /payments/ call.
    const res = await request(app)
      .post("/api/payments/webhook")
      .send({ eventId: "evt_3b", providerReference: ref, status: "FAILED" });

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);

    const { rows } = await pool.query("SELECT status FROM bookings WHERE id = $1", [bookingId]);
    expect(rows[0].status).toBe("CONFIRMED"); // still confirmed, not flipped to FAILED
  });

  test("webhook does not create duplicate payment rows for repeated delivery", async () => {
    const { bookingId } = await setupBooking("wh4@example.org");
    const ref = "sim_ref_4";
    await createPendingPayment(bookingId, ref);

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(app)
        .post("/api/payments/webhook")
        .send({ eventId: "evt_4", providerReference: ref, status: "SUCCESS" });
    }

    const { rows } = await pool.query("SELECT * FROM payments WHERE provider_reference = $1", [ref]);
    expect(rows).toHaveLength(1);
  });

  test("404s for a webhook referencing an unknown payment", async () => {
    const res = await request(app)
      .post("/api/payments/webhook")
      .send({ eventId: "evt_unknown", providerReference: "sim_does_not_exist", status: "SUCCESS" });

    expect(res.status).toBe(404);
  });

  test("rejects a malformed webhook payload with 400", async () => {
    const res = await request(app).post("/api/payments/webhook").send({ eventId: "evt_bad" });
    expect(res.status).toBe(400);
  });
});
