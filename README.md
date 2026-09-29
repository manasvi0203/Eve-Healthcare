# EVE Healthcare — Diagnostic Booking & Payments API

A production-oriented REST API for diagnostic test discovery, bookings, and simulated payments, built as part of the **EVE Healthcare SDE Intern take-home assignment**.

The project focuses on **API design, PostgreSQL schema design, transaction safety, payment idempotency, authentication, validation, and integration testing**.

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** PostgreSQL
- **Database access:** `pg` with raw SQL
- **Authentication:** JWT
- **Validation:** Zod
- **Testing:** Jest, Supertest
- **API Documentation:** OpenAPI / Swagger
- **Infrastructure:** Docker Compose

## Engineering Highlights

- Designed a normalized PostgreSQL schema with foreign keys, enums, unique constraints, and indexes.
- Used **raw SQL** to keep database behavior and transaction boundaries explicit.
- Implemented JWT-based authentication and ownership checks for protected resources.
- Used PostgreSQL transactions and `SELECT ... FOR UPDATE` to safely handle concurrent payment attempts.
- Designed **idempotent payment webhooks** using both `event_id` and `provider_reference`.
- Preserved payment history by allowing multiple payment attempts per booking.
- Added request validation, centralized error handling, rate limiting, and structured HTTP error responses.
- Built integration tests against a **real PostgreSQL database** rather than mocking the database layer.

---

## Table of Contents

- [Getting Started](#getting-started)
- [API Overview](#api-overview)
- [Database Design](#database-design)
- [Payment Flow](#payment-flow)
- [Webhook Idempotency](#webhook-idempotency)
- [Validation and Edge Cases](#validation-and-edge-cases)
- [Testing](#testing)
- [Assumptions](#assumptions)
- [Future Improvements](#future-improvements)

---

## Getting Started

### Prerequisites

For local development, you need:

- Node.js
- PostgreSQL
- npm

Docker users only need Docker and Docker Compose.

### Option 1 — Docker Compose

Recommended for the quickest setup.

```bash
cp .env.example .env
docker-compose up --build
```

This starts PostgreSQL, automatically applies `db/schema.sql`, and runs the API at:

**API:** `http://localhost:3000`  
**Swagger Docs:** `http://localhost:3000/api/docs`

### Option 2 — Local PostgreSQL

```bash
npm install

cp .env.example .env
```

Set `DATABASE_URL` in `.env`, then run:

```bash
npm run migrate
npm run dev
```

For a standard Node process:

```bash
npm start
```

---

# API Overview

Base URL:

```text
/api
```

Interactive API documentation is available at:

```text
http://localhost:3000/api/docs
```

## Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/signup` | — | Create an account |
| POST | `/auth/login` | — | Authenticate and receive a JWT |
| GET | `/auth/me` | JWT | Get the authenticated user |

Example:

```bash
curl -X POST localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","fullName":"Jane Doe","password":"password123"}'
```

```bash
curl -X POST localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"password123"}'
```

Successful login returns:

```json
{
  "accessToken": "...",
  "tokenType": "Bearer",
  "user": {}
}
```

Protected endpoints use:

```text
Authorization: Bearer <accessToken>
```

---

## Diagnostic Centres & Tests

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/centres` | — | List centres with pagination and optional location filter |
| POST | `/centres` | JWT | Create a centre and optionally add tests |
| GET | `/centres/:id` | — | Get a centre with its tests |
| GET | `/centres/:id/tests` | — | List tests for a centre |
| POST | `/centres/:id/tests` | JWT | Add a test to a centre |
| GET | `/tests` | — | List all tests with pagination |

Example:

```bash
curl -X POST localhost:3000/api/centres \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"City Diagnostics","location":"Delhi","tests":[{"name":"CBC","price":499}]}'
```

> In the current assignment implementation, any authenticated user can manage centres and tests. See [Assumptions](#assumptions).

---

## Bookings

All booking endpoints require authentication.

Users can only access their own bookings.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/bookings` | Create a booking |
| GET | `/bookings` | List the authenticated user's bookings |
| GET | `/bookings/:id` | Get a booking owned by the current user |
| POST | `/bookings/:id/cancel` | Cancel a booking |

Supported booking filters:

```text
?status=
?page=
?pageSize=
```

Creating a booking:

```bash
curl -X POST localhost:3000/api/bookings \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"testId":"<uuid>","appointmentDatetime":"2026-10-01T10:00:00.000Z"}'
```

A newly created booking starts with:

```text
PENDING
```

---

## Payments

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/payments` | JWT | Create a simulated payment attempt |
| POST | `/payments/webhook` | — | Process an asynchronous payment update |
| GET | `/payments/booking/:bookingId` | JWT | List payment attempts for a booking |

### Simulate a payment

```bash
curl -X POST localhost:3000/api/payments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bookingId":"<uuid>","forceOutcome":"SUCCESS"}'
```

### Simulate a payment webhook

```bash
curl -X POST localhost:3000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{"eventId":"evt_123","providerReference":"sim_...","status":"SUCCESS"}'
```

`forceOutcome` is a **test/demo-only** override. Without it, the payment simulator determines the result using `PAYMENT_SUCCESS_RATE`, which defaults to `80%`.

---

# Database Design

The database schema is defined in [`db/schema.sql`](./db/schema.sql).

### Core entities

```text
users
├── id (UUID, PK)
├── email (UNIQUE)
├── full_name
├── password_hash
└── created_at

diagnostic_centres
├── id (UUID, PK)
├── name
├── location
└── created_at

diagnostic_tests
├── id (UUID, PK)
├── centre_id (FK)
├── name
├── price
└── created_at

bookings
├── id (UUID, PK)
├── user_id (FK)
├── test_id (FK)
├── centre_id (FK)
├── appointment_datetime
├── amount
├── status
├── created_at
└── updated_at

payments
├── id (UUID, PK)
├── booking_id (FK)
├── amount
├── status
├── provider_reference (UNIQUE)
├── created_at
└── updated_at

webhook_events
├── id (UUID, PK)
├── event_id (UNIQUE)
├── payload (JSONB)
└── received_at
```

### Important design decisions

#### 1. Booking amount is a price snapshot

`bookings.amount` stores the price agreed upon when the booking was created.

If the diagnostic centre changes the test price later, existing bookings retain their original amount.

#### 2. Payment attempts are preserved

A booking can have multiple payment attempts:

```text
FAILED → SUCCESS
```

Instead of overwriting the failed attempt, each payment is stored separately. This preserves an audit trail of payment activity.

#### 3. Database-backed uniqueness

`payments.provider_reference` is `UNIQUE`.

This prevents multiple payment records from representing the same provider transaction and provides a database-level guarantee for webhook processing.

#### 4. Separate webhook event ledger

`webhook_events.event_id` is also `UNIQUE`.

This tracks the identity of the webhook delivery separately from the payment transaction itself.

Both identifiers are required because:

- The same webhook delivery can be retried with the same `event_id`.
- A different webhook event can reference an already-processed `provider_reference`.

### Indexes

Indexes are provided for the main access patterns:

- `bookings(user_id)`
- `bookings(user_id, status)`
- `payments(booking_id)`
- `diagnostic_tests(centre_id)`
- `diagnostic_centres(location)`

---

# Payment Flow

`POST /payments` represents a synchronous payment-provider call.

The flow is:

```text
Client
  │
  ▼
POST /payments
  │
  ▼
Validate request
  │
  ▼
Begin transaction
  │
  ▼
Lock booking row
SELECT ... FOR UPDATE
  │
  ├── CANCELLED ──► 409
  │
  ├── CONFIRMED ──► Return existing successful payment
  │
  ▼
Run payment simulator
  │
  ▼
Create payment attempt
  │
  ▼
Update booking
  │
  ├── SUCCESS ──► CONFIRMED
  │
  └── FAILED ──► FAILED
  │
  ▼
Commit transaction
```

### Concurrency handling

The booking row is locked using:

```sql
SELECT ... FOR UPDATE
```

inside a transaction.

This prevents two concurrent payment requests from both processing the same booking simultaneously.

### Retry behavior

A failed payment can be retried:

```text
Booking
   │
   ├── Payment #1 → FAILED
   │
   └── Payment #2 → SUCCESS
                    │
                    ▼
                 CONFIRMED
```

If the booking is already `CONFIRMED`, another payment request is treated as an idempotent retry and does not create another successful charge.

---

# Webhook Idempotency

The webhook endpoint handles asynchronous payment updates.

There are two duplicate scenarios:

### 1. Same event delivered multiple times

For example:

```text
event_id = evt_123
```

is received five times.

`webhook_events.event_id` has a `UNIQUE` constraint, so only the first delivery is recorded.

### 2. Different events reference the same transaction

Two different events may have different `event_id` values but reference the same:

```text
provider_reference
```

The payment row is therefore also locked and checked before applying the update.

### Processing flow

```text
Webhook
   │
   ▼
Record event
   │
   ├── event_id already exists
   │       └── Return duplicate
   │
   ▼
Lock payment by provider_reference
   │
   ├── Payment already resolved
   │       └── No-op
   │
   ▼
Update payment + booking
   │
   ▼
Commit transaction
```

The event recording and payment update occur in the **same database transaction**.

This prevents a situation where the webhook is marked as processed but its payment update is never applied because the process crashes between the two operations.

The test suite verifies repeated webhook delivery and ensures booking state does not regress.

---

# Validation and Edge Cases

The API explicitly handles:

### Request validation

All request bodies and query parameters are validated with Zod.

Examples:

- Invalid email
- Missing required fields
- Non-positive prices
- Invalid appointment timestamps
- Invalid query parameters

These return structured `400` responses.

### Invalid UUIDs

Malformed UUIDs such as:

```text
/bookings/not-a-uuid
```

return `400` rather than exposing a PostgreSQL parsing error as a `500`.

### Missing resources

Valid but unknown UUIDs return:

```text
404 Not Found
```

### Authentication & authorization

- Missing token → `401`
- Invalid/expired token → `401`
- Accessing another user's booking/payment → `403`

### Duplicate registration

Attempting to register an existing email returns:

```text
409 Conflict
```

Login uses the same generic `401` response for an incorrect password and a non-existent account, avoiding unnecessary account-existence disclosure.

### Booking state rules

- `CONFIRMED` → cannot be cancelled
- `CANCELLED` → cannot be paid
- Cancelling an already cancelled booking is a safe no-op
- Failed payments can be retried
- Confirmed bookings cannot be charged again

### Rate limiting

A global rate limiter allows up to:

```text
300 requests / 15 minutes / IP
```

This provides basic protection against brute-force traffic, particularly on authentication endpoints.

---

# Testing

Run:

```bash
npm test
```

The project contains **39 tests** across:

- Authentication
- Diagnostic centres
- Bookings
- Payments
- Webhook idempotency

Tests use **Jest + Supertest** with a real PostgreSQL test database.

The database is truncated between tests through:

```text
tests/testUtils.js
```

### Why integration tests?

The important properties of this API depend on actual PostgreSQL behavior:

- Unique constraints
- Transactions
- Row locking
- Rollbacks
- Database-backed idempotency

Mocking the database layer would not verify these behaviors reliably.

### Test database setup

```bash
createdb eve_healthcare_test
```

Set `TEST_DATABASE_URL` in `.env`, then:

```bash
npm test
```

---

# Assumptions

### No separate admin role

Any authenticated user can create diagnostic centres and add tests.

A production system would normally restrict this through role-based access control, but the assignment implementation keeps these endpoints directly testable.

### Webhook authentication

The webhook endpoint does not use user JWT authentication because it represents an external payment provider.

A production integration should verify a provider-supplied HMAC signature before processing the event.

### Payment outcome override

`forceOutcome` exists only to make payment behavior deterministic during testing and demonstrations.

It should not be exposed to production clients.

### Currency

The API uses a single currency and:

```sql
NUMERIC(10,2)
```

No multi-currency support was required.

### Booking structure

A booking represents one centre/test combination at creation time.

There is no rescheduling endpoint; users can cancel and create a new booking.

### Database

PostgreSQL is required because the schema uses PostgreSQL-specific functionality such as:

- `gen_random_uuid()`
- Native `ENUM` types
- PostgreSQL transaction/locking behavior

---

# Future Improvements

If this were extended beyond the assignment, I would prioritize:

1. **Webhook signature verification**  
   Validate an HMAC signature such as `X-Signature: sha256=...` before processing webhooks.

2. **Remove or restrict `forceOutcome`**  
   Enable it only in test environments.

3. **Versioned database migrations**  
   Replace the single schema file with tools such as `node-pg-migrate` as the schema grows.

4. **Role-based access control**  
   Separate centre/test management from regular user access.

5. **Optimize centre queries**  
   Replace the current N+1 test-loading pattern with a single query using aggregation such as `json_agg`.

6. **Structured application logging**  
   Introduce structured logs and request IDs for easier debugging and distributed tracing.

7. **Distributed rate limiting**  
   Move rate-limit state to Redis for horizontally scaled deployments.

8. **Background processing**  
   Add a retry queue for webhook processing and other operations that need to survive application crashes.

9. **Audit and retention controls**  
   Add soft deletes and audit logging for healthcare-adjacent booking and payment data.

---

## Project Structure

A simplified view of the project:

```text
.
├── db/
│   └── schema.sql
├── tests/
│   ├── testUtils.js
│   └── ...
├── src/
│   └── ...
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md
```

---

## License

This project was created as part of the **EVE Healthcare SDE Intern take-home assignment**.
