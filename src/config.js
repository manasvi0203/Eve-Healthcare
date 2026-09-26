require("dotenv").config();

const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  databaseUrl:
    process.env.NODE_ENV === "test"
      ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
      : process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || "10", 10),
  // Probability that a simulated payment succeeds when the caller doesn't
  // force a specific outcome. Kept out of request input in production paths;
  // only test/demo code uses `forceOutcome`.
  paymentSuccessRate: parseFloat(process.env.PAYMENT_SUCCESS_RATE || "0.8"),
};

module.exports = config;
