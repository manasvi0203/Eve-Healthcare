const express = require("express");
const authController = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");
const { validateBody } = require("../middleware/validate");
const { signupSchema, loginSchema } = require("../schemas");

const router = express.Router();

/**
 * @openapi
 * /auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Create a new user account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, fullName, password]
 *             properties:
 *               email: { type: string, format: email }
 *               fullName: { type: string }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       201: { description: User created }
 *       409: { description: Email already registered }
 */
router.post("/signup", validateBody(signupSchema), authController.signup);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in and receive a JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Returns accessToken }
 *       401: { description: Invalid credentials }
 */
router.post("/login", validateBody(loginSchema), authController.login);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current authenticated user
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Current user }
 *       401: { description: Not authenticated }
 */
router.get("/me", requireAuth, authController.me);

module.exports = router;
