import express from "express";
import cors from "cors";
import axios from "axios";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { v7 as uuid } from "uuid";
import "dotenv/config";

import { query, initDB } from "./db.js";
import { parseNaturalLanguage } from "./nlp.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const {
  PORT = 3003,
  GENDERIZE_URL,
  AGIFY_URL,
  NATIONALIZE_URL,
} = process.env;

const API = "/api";

// ISO-3166-1 alpha-2 → country full name  (used when creating a profile via
// the external APIs, which return only a country code).
const ISO_TO_NAME = {
  NG: "Nigeria", GH: "Ghana", BJ: "Benin", TG: "Togo", CI: "Côte d'Ivoire",
  SN: "Senegal", ML: "Mali", GW: "Guinea-Bissau", GQ: "Equatorial Guinea",
  GN: "Guinea", SL: "Sierra Leone", LR: "Liberia", GM: "Gambia",
  BF: "Burkina Faso", NE: "Niger", MR: "Mauritania", CV: "Cape Verde",
  ET: "Ethiopia", KE: "Kenya", TZ: "Tanzania", UG: "Uganda", RW: "Rwanda",
  BI: "Burundi", SO: "Somalia", DJ: "Djibouti", ER: "Eritrea",
  CM: "Cameroon", CF: "Central African Republic", TD: "Chad", GA: "Gabon",
  CG: "Republic of Congo", CD: "Democratic Republic of Congo",
  ST: "São Tomé and Príncipe",
  ZA: "South Africa", AO: "Angola", MZ: "Mozambique", ZW: "Zimbabwe",
  ZM: "Zambia", MW: "Malawi", NA: "Namibia", BW: "Botswana", LS: "Lesotho",
  SZ: "Eswatini", MG: "Madagascar", KM: "Comoros", MU: "Mauritius",
  SC: "Seychelles",
  EG: "Egypt", MA: "Morocco", DZ: "Algeria", TN: "Tunisia", LY: "Libya",
  SD: "Sudan", SS: "South Sudan",
  US: "United States", GB: "United Kingdom", FR: "France", DE: "Germany",
  IT: "Italy", ES: "Spain", PT: "Portugal", NL: "Netherlands", BE: "Belgium",
  CH: "Switzerland", AT: "Austria", SE: "Sweden", NO: "Norway", DK: "Denmark",
  FI: "Finland", PL: "Poland", RU: "Russia", UA: "Ukraine", TR: "Turkey",
  GR: "Greece",
  BR: "Brazil", AR: "Argentina", CO: "Colombia", CL: "Chile", PE: "Peru",
  MX: "Mexico", CA: "Canada",
  AU: "Australia", NZ: "New Zealand",
  IN: "India", CN: "China", JP: "Japan", KR: "South Korea", ID: "Indonesia",
  MY: "Malaysia", PH: "Philippines", VN: "Vietnam", TH: "Thailand",
  PK: "Pakistan", BD: "Bangladesh", SA: "Saudi Arabia", AE: "United Arab Emirates",
  IR: "Iran", IQ: "Iraq", IL: "Israel",
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const toUtcIso8601 = (date) =>
  (date instanceof Date ? date : new Date(date)).toISOString().replace(/\.\d{3}Z$/, "Z");

const classifyAgeGroup = (age) => {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
};

const formatProfile = (row) => ({
  id: row.id,
  name: row.name,
  gender: row.gender,
  gender_probability: row.gender_probability,
  age: row.age,
  age_group: row.age_group,
  country_id: row.country_id,
  country_name: row.country_name,
  country_probability: row.country_probability,
  created_at: toUtcIso8601(row.created_at),
});

const sendError = (res, error) => {
  if (error instanceof ApiError) {
    return res.status(error.status).json({ status: "error", message: error.message });
  }
  console.error(error);
  return res.status(500).json({ status: "error", message: "Internal server error" });
};

// ---------------------------------------------------------------------------
// External-API helpers (kept from Stage 1)
// ---------------------------------------------------------------------------
const makeAPIRequest = async (url, name, apiName) => {
  if (!url) throw new ApiError(500, "Internal server error");
  try {
    const { status, data } = await axios.get(url, { timeout: 15000, params: { name } });
    if (status !== 200 || !data || typeof data !== "object") {
      throw new ApiError(502, `${apiName} returned an invalid response`);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, `${apiName} returned an invalid response`);
  }
};

const getGenderPrediction = async (name) => {
  const data = await makeAPIRequest(GENDERIZE_URL, name, "Genderize");
  if (!data.gender || Number(data.count) === 0) {
    throw new ApiError(502, "Genderize returned an invalid response");
  }
  return { gender: data.gender, gender_probability: data.probability };
};

const getAgePrediction = async (name) => {
  const data = await makeAPIRequest(AGIFY_URL, name, "Agify");
  if (data.age === null) throw new ApiError(502, "Agify returned an invalid response");
  return { age: data.age, age_group: classifyAgeGroup(data.age) };
};

const getCountryPrediction = async (name) => {
  const data = await makeAPIRequest(NATIONALIZE_URL, name, "Nationalize");
  const countries = Array.isArray(data.country) ? data.country : [];
  if (countries.length === 0) {
    throw new ApiError(502, "Nationalize returned an invalid response");
  }
  const top = countries.reduce((best, c) =>
    !best || c.probability > best.probability ? c : best, null);
  return {
    country_id: top.country_id,
    country_name: ISO_TO_NAME[top.country_id] ?? top.country_id,
    country_probability: top.probability,
  };
};

// ---------------------------------------------------------------------------
// Query builder — shared by GET /api/profiles and GET /api/profiles/search
// ---------------------------------------------------------------------------
const VALID_SORT_BY = new Set(["age", "created_at", "gender_probability"]);
const VALID_ORDER   = new Set(["asc", "desc"]);
const VALID_GENDER  = new Set(["male", "female"]);
const VALID_GROUP   = new Set(["child", "teenager", "adult", "senior"]);

/**
 * Validate + compile query params (or pre-parsed NLP filters) into a pair of
 * SQL strings and parameter arrays ready for pg.
 *
 * @param {object} rawQuery   – req.query (for the filter endpoint) or merged
 *                              NLP-filter + pagination params
 * @returns {{ countSql, dataSql, countParams, dataParams, page, limit }}
 */
function buildQuery(rawQuery) {
  const {
    gender,
    age_group,
    country_id,
    min_age,
    max_age,
    min_gender_probability,
    min_country_probability,
    sort_by   = "created_at",
    order     = "asc",
    page      = "1",
    limit     = "10",
  } = rawQuery;

  // ── Validate sort / order ──────────────────────────────────────────────
  if (!VALID_SORT_BY.has(sort_by)) {
    throw new ApiError(400, "Invalid query parameters");
  }
  if (!VALID_ORDER.has(order)) {
    throw new ApiError(400, "Invalid query parameters");
  }

  // ── Validate pagination ────────────────────────────────────────────────
  const pageNum  = parseInt(page,  10);
  const limitNum = parseInt(limit, 10);

  if (!Number.isFinite(pageNum)  || pageNum  < 1)  throw new ApiError(422, "Invalid query parameters");
  if (!Number.isFinite(limitNum) || limitNum < 1 || limitNum > 50) throw new ApiError(422, "Invalid query parameters");

  // ── Build WHERE conditions ─────────────────────────────────────────────
  const conditions = [];
  const baseParams = [];   // params shared by COUNT and SELECT
  let idx = 1;

  const push = (condition, value) => {
    conditions.push(condition.replace("?", `$${idx++}`));
    baseParams.push(value);
  };

  if (gender !== undefined) {
    const g = String(gender).toLowerCase();
    if (!VALID_GENDER.has(g)) throw new ApiError(422, "Invalid query parameters");
    push("gender = ?", g);
  }

  if (age_group !== undefined) {
    const ag = String(age_group).toLowerCase();
    if (!VALID_GROUP.has(ag)) throw new ApiError(422, "Invalid query parameters");
    push("age_group = ?", ag);
  }

  if (country_id !== undefined) {
    push("country_id = ?", String(country_id).toUpperCase());
  }

  if (min_age !== undefined) {
    const v = Number(min_age);
    if (!Number.isFinite(v)) throw new ApiError(422, "Invalid query parameters");
    push("age >= ?", v);
  }

  if (max_age !== undefined) {
    const v = Number(max_age);
    if (!Number.isFinite(v)) throw new ApiError(422, "Invalid query parameters");
    push("age <= ?", v);
  }

  if (min_gender_probability !== undefined) {
    const v = Number(min_gender_probability);
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new ApiError(422, "Invalid query parameters");
    push("gender_probability >= ?", v);
  }

  if (min_country_probability !== undefined) {
    const v = Number(min_country_probability);
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new ApiError(422, "Invalid query parameters");
    push("country_probability >= ?", v);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countSql  = `SELECT COUNT(*) FROM profiles ${where}`;
  const dataSql   = `
    SELECT * FROM profiles
    ${where}
    ORDER BY ${sort_by} ${order.toUpperCase()}
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  const offset = (pageNum - 1) * limitNum;

  return {
    countSql,
    dataSql,
    countParams: baseParams,
    dataParams:  [...baseParams, limitNum, offset],
    page: pageNum,
    limit: limitNum,
  };
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();

app.use(express.json());
app.use(cors({ origin: "*" }));                // CORS: Access-Control-Allow-Origin: *
app.set("trust proxy", 1);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { status: "error", message: "Too many requests, please try again later." },
  })
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health / welcome
app.get(API + "/", (_req, res) => res.json({ status: "success", message: "Stage 2 API" }));

// ── 1) GET /api/profiles ──────────────────────────────────────────────────
app.get(API + "/profiles", async (req, res) => {
  try {
    const { countSql, dataSql, countParams, dataParams, page, limit } =
      buildQuery(req.query);

    const [countResult, dataResult] = await Promise.all([
      query(countSql, countParams),
      query(dataSql,  dataParams),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    return res.status(200).json({
      status: "success",
      page,
      limit,
      total,
      data: dataResult.rows.map(formatProfile),
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// ── 2) GET /api/profiles/search ───────────────────────────────────────────
app.get(API + "/profiles/search", async (req, res) => {
  try {
    const { q, page, limit } = req.query;

    if (!q || !String(q).trim()) {
      return res.status(400).json({ status: "error", message: "Missing or empty parameter" });
    }

    const nlpFilters = parseNaturalLanguage(q);

    if (!nlpFilters) {
      return res.status(200).json({ status: "error", message: "Unable to interpret query" });
    }

    // Merge NLP-derived filters with pagination params (no sort_by from user here)
    const merged = { ...nlpFilters };
    if (page  !== undefined) merged.page  = page;
    if (limit !== undefined) merged.limit = limit;

    const { countSql, dataSql, countParams, dataParams, page: pageNum, limit: limitNum } =
      buildQuery(merged);

    const [countResult, dataResult] = await Promise.all([
      query(countSql, countParams),
      query(dataSql,  dataParams),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    return res.status(200).json({
      status: "success",
      page:  pageNum,
      limit: limitNum,
      total,
      data: dataResult.rows.map(formatProfile),
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// ── 3) POST /api/profiles ─────────────────────────────────────────────────
app.post(API + "/profiles", async (req, res) => {
  try {
    const raw = req.body?.name;
    if (raw === undefined || raw === null) throw new ApiError(400, "Missing or empty name");
    if (typeof raw !== "string")           throw new ApiError(422, "Invalid type");

    const name = raw.trim().toLowerCase();
    if (!name) throw new ApiError(400, "Missing or empty name");

    // Check for existing profile
    const existing = await query("SELECT * FROM profiles WHERE name = $1", [name]);
    if (existing.rows.length) {
      return res.status(200).json({
        status: "success",
        message: "Profile already exists",
        data: formatProfile(existing.rows[0]),
      });
    }

    // Fetch from external APIs in parallel
    const [genderData, ageData, countryData] = await Promise.all([
      getGenderPrediction(name),
      getAgePrediction(name),
      getCountryPrediction(name),
    ]);

    const id = uuid();
    const result = await query(
      `INSERT INTO profiles
         (id, name, gender, gender_probability, age, age_group,
          country_id, country_name, country_probability)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        id, name,
        genderData.gender, genderData.gender_probability,
        ageData.age, ageData.age_group,
        countryData.country_id, countryData.country_name, countryData.country_probability,
      ]
    );

    return res.status(201).json({ status: "success", data: formatProfile(result.rows[0]) });
  } catch (err) {
    return sendError(res, err);
  }
});

// ── 4) GET /api/profiles/:id ──────────────────────────────────────────────
app.get(API + "/profiles/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM profiles WHERE id = $1", [req.params.id]);
    if (!result.rows.length) throw new ApiError(404, "Profile not found");
    return res.status(200).json({ status: "success", data: formatProfile(result.rows[0]) });
  } catch (err) {
    return sendError(res, err);
  }
});

// ── 5) DELETE /api/profiles/:id ───────────────────────────────────────────
app.delete(API + "/profiles/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM profiles WHERE id = $1", [req.params.id]);
    if (result.rowCount === 0) throw new ApiError(404, "Profile not found");
    return res.status(204).send();
  } catch (err) {
    return sendError(res, err);
  }
});

// ── 6) GET /api/classify ─────────────────────────────────────────────────
app.get(API + "/classify", async (req, res) => {
  try {
    const raw = req.query.name;
    if (raw === undefined || raw === null) throw new ApiError(400, "Missing or empty name");
    if (typeof raw !== "string")           throw new ApiError(422, "Invalid type");
    const name = raw.trim().toLowerCase();
    if (!name) throw new ApiError(400, "Missing or empty name");

    const data = await getGenderPrediction(name);
    return res.status(200).json({ status: "success", data: { name, ...data } });
  } catch (err) {
    return sendError(res, err);
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const server = createServer(app);

initDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Stage-2 server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialise database:", err.message);
    process.exit(1);
  });
