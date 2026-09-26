/**
 * Wraps an async Express route/middleware so a rejected promise is forwarded
 * to next(err) instead of crashing the process or hanging the request.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
