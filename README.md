# EVE Healthcare — Diagnostic Bookings & Payments API

A backend service for diagnostic test bookings and simulated payments, built for the
EVE Healthcare SDE Intern take-home assignment.

**Stack:** Node.js + Express + PostgreSQL (raw SQL via `pg`, no ORM), JWT auth, Jest + Supertest for tests.

> **Why raw SQL instead of an ORM?** The assignment weighs database design heavily, and hand-written
> SQL (see [`db/schema.sql`](./db/schema.sql)) makes the schema, constraints, and query plans directly
> visible to a reviewer instead of hiding them behind an ORM's generated queries. It also made the
> idempotency guarantees (below) easy to reason about precisely, since they hinge on real `UNIQUE`
> constraints and row locks.

---

## Contents

- [Quick start](#quick-start)
- [API endpoints](#api-endpoints)
- [Database / schema design](#database--schema-design)
- [How the simulated payment flow works](#how-the-simulated-payment-flow-works)
- [How webhook idempotency works](#how-webhook-idempotency-works)
- [Edge cases handled](#edge-cases-handled)
- [Running tests](#running-tests)
- [Assumptions](#assumptions)
- [What I'd improve with more time](#what-id-improve-with-more-time)

---

## Quick start

### Option A — Docker Compose (recommended)

```bash
cp .env.example .env        # defaults already match docker-compose.yml
docker-compose up --build
```

This starts Postgres (with the schema auto-applied via `db/schema.sql` mounted into
`/docker-entrypoint-initdb.d`) and the API on **http://localhost:3000**.

Interactive API docs: **http://localhost:3000/api/docs**

### Option B — Run locally against your own Postgres

```bash
npm install
cp .env.example .env
# edit .env: set DATABASE_URL to your local Postgres connection string

npm run migrate     # applies db/schema.sql (safe to re-run; fully idempotent)
npm run dev          # nodemon, or `npm start` for a plain node process
```

### Running the test suite

```bash
# create a separate test database once:
createdb eve_healthcare_test

# .env should have TEST_DATABASE_URL pointing at it (see .env.example)
npm test
```

The suite uses a **real Postgres database** (truncated between tests), not mocks — this
was a deliberate choice so the tests exercise the actual SQL, transactions, and unique
constraints the idempotency guarantees rely on. See [Running tests](#running-tests) for
more detail.

---

## API endpoints

Base path: `/api`. Full interactive documentation (OpenAPI/Swagger) is served at
`/api/docs` once the server is running.

### Auth

| Method | Path            | Auth | Description                       |
|--------|-----------------|------|------------------------------------|
| POST   | `/auth/signup`  | –    | Create an account                  |
| POST   | `/auth/login`   | –    | Log in, returns a JWT              |
| GET    | `/auth/me`      | ✅   | Get the current authenticated user |

```bash
curl -X POST localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","fullName":"Jane Doe","password":"password123"}'

curl -X POST localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"password123"}'
# -> { "accessToken": "...", "tokenType": "Bearer", "user": {...} }
```

Every protected route expects `Authorization: Bearer <accessToken>`.

### Diagnostic centres & tests

| Method | Path                     | Auth | Description                                  |
|--------|--------------------------|------|-----------------------------------------------|
| GET    | `/centres`               | –    | List centres (paginated, `?location=` filter) |
| POST   | `/centres`               | ✅   | Create a centre, optionally with initial tests|
| GET    | `/centres/:id`           | –    | Get one centre with its tests                 |
| GET    | `/centres/:id/tests`     | –    | List a centre's tests                         |
| POST   | `/centres/:id/tests`     | ✅   | Add a test to a centre                        |
| GET    | `/tests`                 | –    | List all tests across every centre (paginated)|

```bash
curl -X POST localhost:3000/api/centres \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"City Diagnostics","location":"Delhi","tests":[{"name":"CBC","price":499}]}'
```

*(Note: in this assignment, any authenticated user can create/manage centres — there's
no separate "admin" role. See [Assumptions](#assumptions).)*

### Bookings

All booking routes require auth. A user only ever sees **their own** bookings.

| Method | Path                    | Description                                         |
|--------|-------------------------|------------------------------------------------------|
| POST   | `/bookings`             | Book a test → creates a booking with status `PENDING`|
| GET    | `/bookings`             | List your bookings (`?status=`, `?page=`, `?pageSize=`) |
| GET    | `/bookings/:id`         | Get one booking (owner only, else `403`)              |
| POST   | `/bookings/:id/cancel`  | Cancel a booking (blocked once `CONFIRMED`)           |

```bash
curl -X POST localhost:3000/api/bookings \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"testId":"<uuid>","appointmentDatetime":"2026-10-01T10:00:00.000Z"}'
```

### Payments

| Method | Path                          | Auth | Description                                  |
|--------|-------------------------------|------|------------------------------------------------|
| POST   | `/payments`                   | ✅   | Simulate a payment attempt for a booking       |
| POST   | `/payments/webhook`           | –    | Receive an async payment status update (idempotent) |
| GET    | `/payments/booking/:bookingId`| ✅   | List payment attempts for a booking (owner only) |

```bash
# Simulate a payment (random outcome by default; force one for testing/demoing):
curl -X POST localhost:3000/api/payments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"bookingId":"<uuid>","forceOutcome":"SUCCESS"}'

# Simulate the provider's async webhook:
curl -X POST localhost:3000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{"eventId":"evt_123","providerReference":"sim_...","status":"SUCCESS"}'
```

`forceOutcome` is a **test/demo-only** override (mirroring the "magic test values" real
sandbox gateways offer) so behavior can be asserted deterministically instead of relying
on the random simulator (`PAYMENT_SUCCESS_RATE` in `.env`, default 80%).

---

## Database / schema design

See [`db/schema.sql`](./db/schema.sql) for the full, commented schema. Summary:

```
users
  id (uuid, pk), email (unique), full_name, password_hash, created_at

diagnostic_centres
  id (uuid, pk), name, location, created_at

diagnostic_tests
  id (uuid, pk), centre_id (fk -> centres), name, price, created_at
  UNIQUE (centre_id, name)

bookings
  id (uuid, pk), user_id (fk -> users), test_id (fk -> tests), centre_id (fk -> centres)
  appointment_datetime, amount, status (enum: PENDING/CONFIRMED/FAILED/CANCELLED)
  created_at, updated_at

payments
  id (uuid, pk), booking_id (fk -> bookings), amount
  status (enum: PENDING/SUCCESS/FAILED)
  provider_reference (UNIQUE)   <-- the simulated provider's transaction id
  created_at, updated_at

webhook_events
  id (uuid, pk), event_id (UNIQUE), payload (jsonb), received_at
```

Key design decisions:

- **`bookings.amount` is a price snapshot**, not a live join to `diagnostic_tests.price`.
  If a centre changes a test's price later, existing bookings must keep charging what the
  user actually agreed to at booking time.
- **A booking can have multiple `payments` rows** (e.g. a `FAILED` attempt followed by a
  retried `SUCCESS` one). This preserves a full audit trail instead of overwriting history,
  which matters a lot for anything touching money.
- **`provider_reference` is `UNIQUE`** on `payments`. This is the anchor that makes the
  webhook idempotent (see below) — it's a real database constraint, not just
  application-level bookkeeping that could be raced.
- **`webhook_events` is an idempotency ledger**, separate from `payments`, because the
  provider's *delivery* identity (`event_id`) and the *transaction* identity
  (`provider_reference`) are conceptually different things — a provider could retry the
  same event, or fire a distinct new event about a transaction we've already resolved.
  Both cases are covered (see next section).
- Indexes added for the actual access patterns: `bookings(user_id)`,
  `bookings(user_id, status)` (list-my-bookings-by-status), `payments(booking_id)`,
  `diagnostic_tests(centre_id)`, `diagnostic_centres(location)` (location filter).

---

## How the simulated payment flow works

`POST /payments/` is meant to represent a synchronous call to a payment processor:

1. Locks the booking row (`SELECT ... FOR UPDATE`) inside a transaction, so two concurrent
   payment attempts on the same booking can't both proceed.
2. Refuses to charge a `CANCELLED` booking (`409`).
3. If the booking is already `CONFIRMED`, treats this as an **idempotent retry** — it
   returns the existing successful payment (`200`) instead of creating a second charge.
4. Otherwise, "calls" the simulator (`paymentService.decideOutcome`), inserts a new
   `payments` row with a generated `provider_reference`, and updates the booking to
   `CONFIRMED` or `FAILED` to match, all inside the same transaction.

A booking that ends up `FAILED` **can be retried** — the second `/payments/` call for the
same booking creates a *second* payment row and, on success, flips the booking to
`CONFIRMED`. Nothing is overwritten.

## How webhook idempotency works

`POST /payments/webhook/` simulates the provider's async callback and is the part of the
assignment most likely to be probed in the interview follow-up, so here's the exact
reasoning:

There are two distinct kinds of "duplicate" a webhook consumer has to defend against, and
one `UNIQUE` constraint doesn't cover both:

1. **The exact same delivery is retried** (network hiccup, provider's at-least-once
   retry policy) — same `event_id`.
2. **A different event arrives for a transaction that's already resolved** — e.g. the
   user's payment was already confirmed via the synchronous `/payments/` call, or an
   earlier webhook, and now a late/duplicate/reminder event shows up with a *new*
   `event_id` but the same `provider_reference`.

Both are handled, in one transaction:

```js
withTransaction(async (client) => {
  // 1) Record this delivery. UNIQUE(event_id) makes a byte-for-byte replay
  //    a guaranteed no-op at the database level, not just app logic.
  const inserted = await recordWebhookEvent(client, eventId, payload);
  if (!inserted) return { duplicate: true }; // already seen this exact event_id

  // 2) Lock the payment row by its (unique) provider_reference.
  const payment = await getPaymentByProviderReferenceForUpdate(client, providerReference);
  if (!payment) throw new NotFoundError(...);

  // 3) Only apply the update if it's still PENDING. If it's already
  //    SUCCESS/FAILED, some other event (or the sync payment call) got there
  //    first -- re-applying would be unsafe, so no-op instead.
  if (payment.status !== "PENDING") return { duplicate: true, payment };

  // 4) Apply it: update payment + booking together.
  ...
});
```

Because steps 1–4 run in a single DB transaction, there's no window where the event is
recorded but its effect wasn't applied (or vice versa) if the process crashes mid-way.

This is exercised directly in [`tests/payments.test.js`](./tests/payments.test.js):
firing the same webhook 5 times in a row is asserted to leave exactly one `payments` row
and one `webhook_events` row, and the booking status is asserted to never regress (e.g. a
replayed event claiming `FAILED` cannot un-confirm an already-`CONFIRMED` booking).

---

## Edge cases handled

- **Invalid requests** — every request body/query is validated with `zod`; a bad email,
  missing field, non-positive price, or past appointment time returns a structured `400`.
- **Malformed IDs** — a non-UUID path param (e.g. `/bookings/not-a-uuid`) returns `400`,
  not a `500` from a raw Postgres error (`22P02` is mapped centrally).
- **Non-existent resources** — booking/centre/test lookups by valid-but-unknown UUID
  return `404`.
- **Unauthorized access** — no token → `401`; expired/invalid/garbage token → `401`;
  a valid token for a *different* user's booking/payment → `403`, not `404` (so an owner
  gets an unambiguous "access denied" instead of information leaking through a `404` that
  changes shape depending on ownership... though see the note in
  [What I'd improve](#what-id-improve-with-more-time) about the trade-off there).
- **Duplicate signups** — `409` on an already-registered email; same generic `401` message
  for "wrong password" and "no such user" on login, so login responses don't leak which
  emails exist.
- **Booking state machine** — `CONFIRMED` bookings can't be cancelled (`409`);
  `CANCELLED` bookings can't be paid for (`409`); cancelling an already-`CANCELLED`
  booking is a safe no-op rather than an error (so a retried cancel-click doesn't fail).
- **Repeated/failed payments** — a `FAILED` payment can be retried; retrying an already-
  `CONFIRMED` booking doesn't create a second charge.
- **Repeated webhook events** — see the dedicated section above; covered by 6 tests.
- **Rate limiting** — a generous global limiter (300 req/15 min per IP) guards
  against naive brute-forcing, particularly of `/auth/login`.

---

## Running tests

```bash
npm test
```

39 tests across `auth`, `centres`, `bookings`, and `payments` (including the idempotency
suite), run with Jest + Supertest against a real Postgres test database (truncated
between tests via `tests/testUtils.js`). I chose integration tests over mocking the DB
layer because the properties being verified — unique-constraint-backed idempotency,
transaction rollback, row locking — are exactly the things a mock would paper over.

---

## Assumptions

- **No separate "admin" role.** Any authenticated user can create diagnostic centres and
  add tests to them. A real system would gate this behind a role/permission check; I kept
  it open so the assignment's centre/test-management endpoints are easy to exercise
  end-to-end without a separate seeding step.
- **The webhook endpoint has no auth.** A real payment provider's webhook caller isn't one
  of the app's end users, so it can't carry a user JWT. Production would verify a
  provider-supplied HMAC signature header instead (see below).
- **`forceOutcome` on `/payments/`** is included as an explicit, test/demo-only override so
  outcomes can be asserted deterministically; it is not something a production client
  should be allowed to pass (see below).
- **One currency, `NUMERIC(10,2)`.** No multi-currency handling since none was specified.
- **A booking "belongs" to exactly one centre/test combination** captured at creation
  time; there's no "reschedule" endpoint, only cancel + rebook.
- Postgres is assumed reachable via `DATABASE_URL`; SQLite/other DBs aren't supported
  since the schema uses Postgres-specific features (`gen_random_uuid()`, native `ENUM`
  types via `CREATE TYPE`).

---

## What I'd improve with more time

- **Webhook signature verification.** Right now anyone who can reach `/payments/webhook`
  can post a status update for a known `provider_reference`. A real integration would
  verify an HMAC signature header (e.g. `X-Signature: sha256=...`) computed with a shared
  secret, and reject unsigned/invalid requests before touching the DB.
- **Remove (or gate behind `NODE_ENV=test`) the `forceOutcome` override** in
  `POST /payments/`, so production traffic can never force a payment outcome.
  It's currently always accepted for convenience during review/demoing.
- **Versioned migrations.** `db/schema.sql` is a single idempotent file, fine for a
  project this size, but a growing schema needs numbered migrations
  (`node-pg-migrate` or similar) so changes are applied one at a time and are
  reversible.
- **Role-based access for centre/test management** (admin vs. regular user), instead of
  "any authenticated user can create a centre."
- **Batch-load tests when listing centres** instead of the current N+1 per-centre query —
  fine at this data size, but I'd switch to a single query with `json_agg` once centre
  counts grow.
- **Structured JSON logging** (e.g. `pino`) instead of `morgan`'s dev-format lines, plus a
  request-id per request for tracing across services.
- **Redis-backed rate limiting** so limits are enforced correctly across multiple app
  instances, instead of the current in-memory limiter (fine for a single instance, not
  for a horizontally scaled deployment).
- **A background job / retry queue** for anything that should survive a crash mid-flight —
  e.g. re-driving webhook processing on transient DB errors, rather than relying entirely
  on the provider's own retry policy.
- **Soft-deletes / audit log** for bookings and payments, given this is healthcare-adjacent
  data that a real system would need to retain and audit rather than ever hard-delete.
