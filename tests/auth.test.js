const request = require("supertest");
const { app, resetDb, closeDb } = require("./testUtils");

beforeEach(resetDb);
afterAll(closeDb);

describe("Auth", () => {
  const credentials = {
    email: "auth.user@example.org",
    fullName: "Auth User",
    password: "password123",
  };

  test("signup creates a user and never returns the password hash", async () => {
    const res = await request(app).post("/api/auth/signup").send(credentials);

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(credentials.email);
    expect(res.body.user.password_hash).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();
  });

  test("signup rejects a duplicate email with 409", async () => {
    await request(app).post("/api/auth/signup").send(credentials);
    const res = await request(app).post("/api/auth/signup").send(credentials);

    expect(res.status).toBe(409);
  });

  test("signup rejects invalid input with 400", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "not-an-email", fullName: "", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  test("login succeeds with correct credentials and returns a JWT", async () => {
    await request(app).post("/api/auth/signup").send(credentials);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: credentials.email, password: credentials.password });

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe("string");
  });

  test("login fails with wrong password (401), same message as unknown email", async () => {
    await request(app).post("/api/auth/signup").send(credentials);

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: credentials.email, password: "wrongpassword" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.org", password: "whatever123" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  test("protected route rejects requests with no token", async () => {
    const res = await request(app).get("/api/bookings");
    expect(res.status).toBe(401);
  });

  test("protected route rejects requests with a garbage token", async () => {
    const res = await request(app).get("/api/bookings").set("Authorization", "Bearer garbage.token.here");
    expect(res.status).toBe(401);
  });
});
