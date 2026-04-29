// ---------------------------------------------------------------------------
// Express application — middleware stack + route mounting
// ---------------------------------------------------------------------------
import express from "express";
import cors from "cors";
import "dotenv/config";

import { requestLogger } from "./middleware/logger.js";
import { globalLimiter } from "./middleware/rateLimiter.js";
import authRouter from "./auth/router.js";
import profilesRouter from "./profiles/router.js";
import apiVersion from "./middleware/apiVersion.js";
import authenticate from "./middleware/authenticate.js";

const app = express();

// ── Core middleware ─────────────────────────────────────────────────────────
app.use(express.json());
app.use(cors({ origin: "*" }));
app.set("trust proxy", 1);

// ── Logging ─────────────────────────────────────────────────────────────────
app.use(requestLogger);

// ── Global rate limiter ─────────────────────────────────────────────────────
app.use(globalLimiter);

// ── Health check ────────────────────────────────────────────────────────────
app.get("/health", (_req, res) =>
  res.json({ status: "success", message: "Insighta Labs+ API v3" })
);

app.use('/auth', authRouter);

app.use("/api/*", apiVersion, authenticate);


// ── Feature routers ─────────────────────────────────────────────────────────
app.use("/api/profiles", profilesRouter);

// ── 404 fallback ────────────────────────────────────────────────────────────
app.use((_req, res) =>
  res.status(404).json({ status: "error", message: "Route not found" })
);

export default app;
