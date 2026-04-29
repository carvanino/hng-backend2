import rateLimit from "express-rate-limit";

const rateLimitResponse = (message) => ({
  status: "error",
  message,
});

/**
 * Global fallback limiter — applied to all routes.
 * Stage 3 will replace this with per-scope limiters once auth is wired in:
 *   - /auth/*  → 10 req / minute
 *   - /api/*   → 60 req / minute per authenticated user
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse("Too many requests, please try again later."),
});
