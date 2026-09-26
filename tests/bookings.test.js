const request = require("supertest");
const { app, resetDb, closeDb } = require("./testUtils");

beforeEach(resetDb);
afterAll(closeDb);

async function setupUserWithTest(email) {
  await request(app)
    .post("/api/auth/signup")
    .send({ email, fullName: "User", password: "password123" });
  const loginRes = await request(app).post("/api/auth/login").send({ email, password: "password123" });
  const token = loginRes.body.accessToken;

  const centreRes = await request(app)
    .post("/api/centres")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Test Centre", location: "Delhi", tests: [{ name: "CBC", price: 499 }] });

  return { token, testId: centreRes.body.centre.tests[0].id };
}

function futureIso(daysAhead = 1) {
  return new Date(Date.now() + daysAhead * 86400000).toISOString();
}

describe("Bookings", () => {
  test("creates a booking with status PENDING and a price snapshot", async () => {
    const { token, testId } = await setupUserWithTest("booker1@example.org");

    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ testId, appointmentDatetime: futureIso() });

    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe("PENDING");
    expect(res.body.booking.amount).toBe("499.00");
  });

  test("rejects booking a non-existent test with 404", async () => {
    const { token } = await setupUserWithTest("booker2@example.org");

    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ testId: "00000000-0000-0000-0000-000000000000", appointmentDatetime: futureIso() });

    expect(res.status).toBe(404);
  });

  test("rejects an appointment time in the past", async () => {
    const { token, testId } = await setupUserWithTest("booker3@example.org");

    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ testId, appointmentDatetime: "2020-01-01T00:00:00.000Z" });

    expect(res.status).toBe(400);
  });

  test("rejects an invalid testId format", async () => {
    const { token } = await setupUserWithTest("booker4@example.org");

    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ testId: "not-a-uuid", appointmentDatetime: futureIso() });

    expect(res.status).toBe(400);
  });

  test("a user cannot view another user's booking (403)", async () => {
    const owner = await setupUserWithTest("owner@example.org");
    const bookingRes = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ testId: owner.testId, appointmentDatetime: futureIso() });

    await request(app)
      .post("/api/auth/signup")
      .send({ email: "intruder@example.org", fullName: "Intruder", password: "password123" });
    const intruderLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "intruder@example.org", password: "password123" });

    const res = await request(app)
      .get(`/api/bookings/${bookingRes.body.booking.id}`)
      .set("Authorization", `Bearer ${intruderLogin.body.accessToken}`);

    expect(res.status).toBe(403);
  });

  test("returns 404 for a well-formed but non-existent booking id", async () => {
    const { token } = await setupUserWithTest("booker5@example.org");
    const res = await request(app)
      .get("/api/bookings/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test("returns 400 (not 500) for a malformed booking id", async () => {
    const { token } = await setupUserWithTest("booker6@example.org");
    const res = await request(app).get("/api/bookings/not-a-uuid").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test("cancels a PENDING booking", async () => {
    const { token, testId } = await setupUserWithTest("booker7@example.org");
    const bookingRes = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ testId, appointmentDatetime: futureIso() });

    const res = await request(app)
      .post(`/api/bookings/${bookingRes.body.booking.id}/cancel`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe("CANCELLED");
  });

  test("cancelling an already-cancelled booking is a harmless no-op", async () => {
    const { token, testId } = await setupUserWithTest("booker8@example.org");
    const bookingRes = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ testId, appointmentDatetime: futureIso() });
    const bookingId = bookingRes.body.booking.id;

    await request(app).post(`/api/bookings/${bookingId}/cancel`).set("Authorization", `Bearer ${token}`);
    const res = await request(app)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe("CANCELLED");
  });

  test("cannot cancel a CONFIRMED (paid) booking", async () => {
    const { token, testId } = await setupUserWithTest("booker9@example.org");
    const bookingRes = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ testId, appointmentDatetime: futureIso() });
    const bookingId = bookingRes.body.booking.id;

    await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingId, forceOutcome: "SUCCESS" });

    const res = await request(app)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);
  });

  test("lists only the current user's bookings, optionally filtered by status", async () => {
    const { token, testId } = await setupUserWithTest("booker10@example.org");
    await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ testId, appointmentDatetime: futureIso(1) });
    const b2 = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ testId, appointmentDatetime: futureIso(2) });
    await request(app)
      .post(`/api/bookings/${b2.body.booking.id}/cancel`)
      .set("Authorization", `Bearer ${token}`);

    const all = await request(app).get("/api/bookings").set("Authorization", `Bearer ${token}`);
    const cancelledOnly = await request(app)
      .get("/api/bookings?status=CANCELLED")
      .set("Authorization", `Bearer ${token}`);

    expect(all.body.total).toBe(2);
    expect(cancelledOnly.body.total).toBe(1);
    expect(cancelledOnly.body.items[0].status).toBe("CANCELLED");
  });
});
