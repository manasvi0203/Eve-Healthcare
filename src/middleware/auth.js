const { verifyToken } = require("../utils/auth");
const { UnauthorizedError } = require("../utils/errors");
const userModel = require("../models/userModel");
const asyncHandler = require("../utils/asyncHandler");

/**
 * Requires a valid `Authorization: Bearer <token>` header. Attaches the
 * authenticated user to req.user. Rejects with 401 for anything else
 * (missing header, malformed header, invalid/expired token, deleted user).
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed Authorization header.");
  }

  const token = header.slice("Bearer ".length).trim();
  const payload = verifyToken(token);
  if (!payload || !payload.sub) {
    throw new UnauthorizedError("Invalid or expired token.");
  }

  const user = await userModel.findById(payload.sub);
  if (!user) {
    throw new UnauthorizedError("User for this token no longer exists.");
  }

  req.user = user;
  next();
});

module.exports = { requireAuth };
