const request = require("supertest");
const { app, resetDb, closeDb } = require("./testUtils");

beforeEach(resetDb);
afterAll(closeDb);

async function signupAndLogin(email = "centre.owner@example.org") {
  await request(app)
    .post("/api/auth/signup")
    .send({ email, fullName: "Centre Owner", password: "password123" });
  const res = await request(app).post("/api/auth/login").send({ email, password: "password123" });
  return res.body.accessToken;
}

describe("Diagnostic centres & tests", () => {
  test("creates a centre with initial tests", async () => {
    const token = await signupAndLogin();

    const res = await request(app)
      .post("/api/centres")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "City Diagnostics",
        location: "Delhi",
        tests: [{ name: "CBC", price: 499 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.centre.tests).toHaveLength(1);
    expect(res.body.centre.tests[0].name).toBe("CBC");
  });

  test("rejects centre creation without auth", async () => {
    const res = await request(app)
      .post("/api/centres")
      .send({ name: "No Auth Centre", location: "Nowhere" });
    expect(res.status).toBe(401);
  });

  test("lists centres with their tests, paginated", async () => {
    const token = await signupAndLogin();
    await request(app)
      .post("/api/centres")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Centre A", location: "Mumbai", tests: [{ name: "X-Ray", price: 300 }] });
    await request(app)
      .post("/api/centres")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Centre B", location: "Pune", tests: [] });

    const res = await request(app).get("/api/centres?page=1&pageSize=10");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(2);
  });

  test("filters centres by location", async () => {
    const token = await signupAndLogin();
    await request(app)
      .post("/api/centres")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Centre A", location: "Mumbai" });
    await request(app)
      .post("/api/centres")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Centre B", location: "Pune" });

    const res = await request(app).get("/api/centres?location=mumbai");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe("Centre A");
  });

  test("404s for a centre that doesn't exist", async () => {
    const res = await request(app).get("/api/centres/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  test("adds a test to an existing centre", async () => {
    const token = await signupAndLogin();
    const centreRes = await request(app)
      .post("/api/centres")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Centre C", location: "Chennai" });

    const res = await request(app)
      .post(`/api/centres/${centreRes.body.centre.id}/tests`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "MRI", price: 4500 });

    expect(res.status).toBe(201);
    expect(res.body.test.name).toBe("MRI");
  });

  test("rejects a duplicate test name within the same centre", async () => {
    const token = await signupAndLogin();
    const centreRes = await request(app)
      .post("/api/centres")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Centre D", location: "Kolkata", tests: [{ name: "MRI", price: 4500 }] });

    const res = await request(app)
      .post(`/api/centres/${centreRes.body.centre.id}/tests`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "MRI", price: 5000 });

    expect(res.status).toBe(409);
  });

  test("rejects a non-positive test price", async () => {
    const token = await signupAndLogin();
    const centreRes = await request(app)
      .post("/api/centres")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Centre E", location: "Hyderabad" });

    const res = await request(app)
      .post(`/api/centres/${centreRes.body.centre.id}/tests`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Free Test", price: 0 });

    expect(res.status).toBe(400);
  });
});
