const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");

const config = require("./config");
const swaggerSpec = require("./swagger");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const authRoutes = require("./routes/authRoutes");
const centreRoutes = require("./routes/centreRoutes");
const testRoutes = require("./routes/testRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  if (config.env !== "test") {
    app.use(morgan(config.env === "production" ? "combined" : "dev"));
  }

  // Basic global rate limit -- generous enough not to interfere with normal
  // use/tests, but stops naive brute-forcing of e.g. /auth/login.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: config.env === "test" ? 100000 : 300,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.use("/api/auth", authRoutes);
  app.use("/api/centres", centreRoutes);
  app.use("/api/tests", testRoutes);
  app.use("/api/bookings", bookingRoutes);
  app.use("/api/payments", paymentRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
