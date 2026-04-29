// ---------------------------------------------------------------------------
// Profiles router — /api/profiles/*
// All Stage 2 endpoints preserved exactly.
// ---------------------------------------------------------------------------
import { Router } from "express";

import { parseNaturalLanguage } from "../nlp.js";
import { sendError } from "../utils.js";
import {
  listProfiles,
  getProfileById,
  createProfile,
  deleteProfile,
  buildQuery,
} from "./service.js";
import { query } from "../db/index.js";
import { formatProfile } from "../utils.js";

const router = Router();

// ── GET /api/profiles ────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { rows, total, page, limit } = await listProfiles(req.query);

    return res.status(200).json({
      status: "success",
      page,
      limit,
      total,
      data: rows,
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// ── GET /api/profiles/export ─────────────────────────────────────────────────
// Placeholder — full CSV implementation added in Stage 3 API updates
router.get("/export", async (_req, res) => {
  return res.status(501).json({
    status: "error",
    message: "CSV export will be available in Stage 3",
  });
});

// ── GET /api/profiles/search ──────────────────────────────────────────────────
router.get("/search", async (req, res) => {
  try {
    const { q, page, limit } = req.query;

    if (!q || !String(q).trim()) {
      return res
        .status(400)
        .json({ status: "error", message: "Missing or empty parameter" });
    }

    const nlpFilters = parseNaturalLanguage(q);

    if (!nlpFilters) {
      return res
        .status(200)
        .json({ status: "error", message: "Unable to interpret query" });
    }

    const merged = { ...nlpFilters };
    if (page  !== undefined) merged.page  = page;
    if (limit !== undefined) merged.limit = limit;

    const { rows, total, page: pageNum, limit: limitNum } =
      await listProfiles(merged);

    return res.status(200).json({
      status: "success",
      page:  pageNum,
      limit: limitNum,
      total,
      data:  rows,
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// ── POST /api/profiles ────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { profile, created } = await createProfile(req.body?.name);

    if (!created) {
      return res.status(200).json({
        status:  "success",
        message: "Profile already exists",
        data:    profile,
      });
    }

    return res.status(201).json({ status: "success", data: profile });
  } catch (err) {
    return sendError(res, err);
  }
});

// ── GET /api/profiles/:id ─────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const profile = await getProfileById(req.params.id);
    return res.status(200).json({ status: "success", data: profile });
  } catch (err) {
    return sendError(res, err);
  }
});

// ── DELETE /api/profiles/:id ──────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    await deleteProfile(req.params.id);
    return res.status(204).send();
  } catch (err) {
    return sendError(res, err);
  }
});

export default router;
