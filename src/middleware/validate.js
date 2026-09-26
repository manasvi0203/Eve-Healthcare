/**
 * Returns middleware that parses req.body (or req.query) with a zod schema.
 * On success, the *parsed* (and therefore type-coerced/defaulted) value
 * replaces the original so controllers can trust it. On failure, throws the
 * ZodError, which the central error handler turns into a 400.
 */
function validateBody(schema) {
  return (req, res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    req.query = schema.parse(req.query);
    next();
  };
}

module.exports = { validateBody, validateQuery };
