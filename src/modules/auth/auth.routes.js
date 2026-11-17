import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import {
  registerSchema,
  loginSchema,
  refreshSchema,
  parseInput,
} from "./auth.schema.js";

import {
  register,
  login,
  refresh,
  logout,
  getProfile,
  listUsers,
} from "./auth.service.js";

import { requireAuth, requireRole } from "./auth.middleware.js";

const router = Router();

// In-memory auth endpoint rate limiting.
// WHY: Login/register brute-force attempts reduce karna.
// LIMITATION: Multi-instance deployment mein shared Redis
// rate-limit store use karenge.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests. Try again later.",
    },
  },
});

// Registration: Public account creation.
// Server always customer role assign karega.
router.post("/register", authLimiter, async (req, res) => {
  const input = parseInput(registerSchema, req.body);

  const user = await register(input);

  return res.status(201).json({
    success: true,
    data: user,
  });
});

// Login: Argon2 password verify, JWT + refresh token return.
router.post("/login", authLimiter, async (req, res) => {
  const input = parseInput(loginSchema, req.body);

  const tokens = await login(input);

  // Secrets HTTP logs mein print nahi karne.
  // API response TLS/HTTPS ke through deliver karna important hai.
  return res.status(200).json({
    success: true,
    data: tokens,
  });
});

// Refresh: Old valid refresh token rotate karo.
router.post("/refresh", authLimiter, async (req, res) => {
  const input = parseInput(refreshSchema, req.body);

  const tokens = await refresh(input.refreshToken);

  return res.status(200).json({
    success: true,
    data: tokens,
  });
});

// Logout: Current login family revoke.
router.post("/logout", async (req, res) => {
  const input = parseInput(refreshSchema, req.body);

  await logout(input.refreshToken);

  return res.status(200).json({
    success: true,
    message: "Logout completed",
  });
});

// Protected profile route.
router.get("/me", requireAuth, async (req, res) => {
  const user = await getProfile(req.user.id);

  return res.status(200).json({
    success: true,
    data: user,
  });
});

// Admin-only example using actual business data.
// Public registration cannot assign admin role.
router.get(
  "/admin/users",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const users = await listUsers();

    return res.status(200).json({
      success: true,
      data: users,
    });
  },
);

export default router;
