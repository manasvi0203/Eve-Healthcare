const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const config = require("../config");

function hashPassword(plain) {
  return bcrypt.hash(plain, config.bcryptSaltRounds);
}

function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

/** Returns the decoded payload, or null if the token is invalid/expired. */
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (err) {
    return null;
  }
}

module.exports = { hashPassword, comparePassword, signToken, verifyToken };
