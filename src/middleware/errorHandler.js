const { ZodError } = require("zod");
const { AppError } = require("../utils/errors");
const config = require("../config");

function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: `No route ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Zod validation errors -> 400 with field-level details.
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: "Validation failed.",
        details: err.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
      },
    });
  }

  // Known Postgres error codes get a friendlier message than a raw 500.
  if (err.code === "23505") {
    return res.status(409).json({ error: { message: "A record with these details already exists." } });
  }
  if (err.code === "23503") {
    return res.status(400).json({ error: { message: "Referenced resource does not exist." } });
  }
  if (err.code === "22P02") {
    // e.g. "not-a-uuid" passed where a UUID column/param was expected.
    return res.status(400).json({ error: { message: "Invalid identifier format." } });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { message: err.message, details: err.details } });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({
    error: {
      message: "Internal server error.",
      // Only leak stack traces outside production, to help local debugging.
      stack: config.env === "production" ? undefined : err.stack,
    },
  });
}

module.exports = { notFoundHandler, errorHandler };
