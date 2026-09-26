const userModel = require("../models/userModel");
const { hashPassword, comparePassword, signToken } = require("../utils/auth");
const { ConflictError, UnauthorizedError } = require("../utils/errors");
const asyncHandler = require("../utils/asyncHandler");

const signup = asyncHandler(async (req, res) => {
  const { email, fullName, password } = req.body;

  const existing = await userModel.findByEmail(email);
  if (existing) {
    throw new ConflictError("An account with this email already exists.");
  }

  const passwordHash = await hashPassword(password);
  const user = await userModel.createUser({ email, fullName, passwordHash });

  res.status(201).json({ user });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await userModel.findByEmail(email);
  // Same error whether the email doesn't exist or the password is wrong, so
  // we never reveal which emails are registered.
  if (!user || !(await comparePassword(password, user.password_hash))) {
    throw new UnauthorizedError("Invalid email or password.");
  }

  const token = signToken(user.id);
  res.json({
    accessToken: token,
    tokenType: "Bearer",
    user: { id: user.id, email: user.email, fullName: user.full_name },
  });
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

module.exports = { signup, login, me };
