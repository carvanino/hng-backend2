# Stage 2 — Intelligence Query Engine

## Overview

Stage 2 upgrades the in-memory store from Stage 1 to a **PostgreSQL** database and adds:

- Advanced filtering, sorting, and pagination on `GET /api/profiles`
- A rule-based natural-language search endpoint `GET /api/profiles/search`
- Database seeding from a JSON file (2 026 profiles, duplicate-safe)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PORT` | HTTP port (default `3003`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `DB_SSL` | Set to `true` on platforms that require SSL (Railway, Heroku, etc.) |
| `GENDERIZE_URL` | `https://api.genderize.io` |
| `AGIFY_URL` | `https://api.agify.io` |
| `NATIONALIZE_URL` | `https://api.nationalize.io` |

### 3. Seed the database

Place the provided 2 026-profile JSON file at `./data/profiles.json`, then run:

```bash
npm run seed
```

Re-running is safe — duplicate names are silently skipped.

### 4. Start the server

```bash
npm start
```

---

## Endpoints

### `GET /api/profiles`

Supports combined filtering, sorting, and pagination.

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `gender` | `male` \| `female` | Filter by gender |
| `age_group` | `child` \| `teenager` \| `adult` \| `senior` | Filter by age group |
| `country_id` | ISO-3166-1 alpha-2 (e.g. `NG`) | Filter by country |
| `min_age` | integer | Minimum age (inclusive) |
| `max_age` | integer | Maximum age (inclusive) |
| `min_gender_probability` | float 0–1 | Minimum gender confidence |
| `min_country_probability` | float 0–1 | Minimum country confidence |
| `sort_by` | `age` \| `created_at` \| `gender_probability` | Sort field (default `created_at`) |
| `order` | `asc` \| `desc` | Sort direction (default `asc`) |
| `page` | integer ≥ 1 | Page number (default `1`) |
| `limit` | integer 1–50 | Page size (default `10`) |

All filters are combinable; a row must satisfy every condition.

**Example**

```
GET /api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10
```

**Response**

```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 142,
  "data": [{ "id": "...", "name": "...", ... }]
}
```

---

### `GET /api/profiles/search`

Converts a plain-English query into database filters. Supports the same `page` and `limit` parameters.

**Example**

```
GET /api/profiles/search?q=young males from nigeria&page=1&limit=10
```

**Response** — same shape as `GET /api/profiles`.

If the query cannot be interpreted:

```json
{ "status": "error", "message": "Unable to interpret query" }
```

---

## Natural Language Parsing Approach

The parser (`nlp.js`) is **entirely rule-based** — no AI or LLMs are involved. It works in four independent passes over the lowercased query string.

### Pass 1 — Gender

| Pattern (regex) | Mapped filter |
|---|---|
| `male`, `males`, `men`, `man` | `gender = male` |
| `female`, `females`, `women`, `woman` | `gender = female` |
| Both male **and** female keywords present | *(no gender filter)* |

### Pass 2 — Age group

Age group keywords map directly to the `age_group` column value stored in the database. They are checked only when the special `young` keyword is absent.

| Keyword(s) | `age_group` filter |
|---|---|
| `child`, `children`, `kid`, `kids` | `child` |
| `teenager`, `teenagers`, `teen`, `teens` | `teenager` |
| `adult`, `adults` | `adult` |
| `senior`, `seniors`, `elderly`, `elder`, `elders` | `senior` |

### Pass 3 — Numeric age bounds

`young` is a **special** keyword that does **not** map to an `age_group` column value; instead it sets numeric bounds.

| Expression | Filters set |
|---|---|
| `young` | `min_age = 16`, `max_age = 24` |
| `above N` / `over N` / `older than N` / `at least N` | `min_age = N` |
| `below N` / `under N` / `younger than N` / `at most N` | `max_age = N` |
| `between N and M` | `min_age = N`, `max_age = M` |
| `aged N` *(no other range)* | `min_age = N`, `max_age = N` |

`between` takes precedence over individual `above`/`below` when both appear.

### Pass 4 — Country

The parser maintains a table of ~100 country names (African countries prioritised) and their ISO-3166-1 alpha-2 codes. Entries are sorted longest-first so that multi-word names (e.g. `south africa`) are matched before any single-word substring they contain (e.g. `africa`).

Matching is a simple `String.prototype.includes` scan against the lowercased query. The first match wins.

**Example mappings**

| Query | Resulting filters |
|---|---|
| `young males` | `gender=male`, `min_age=16`, `max_age=24` |
| `females above 30` | `gender=female`, `min_age=30` |
| `people from angola` | `country_id=AO` |
| `adult males from kenya` | `gender=male`, `age_group=adult`, `country_id=KE` |
| `male and female teenagers above 17` | `age_group=teenager`, `min_age=17` |
| `young women from south africa` | `gender=female`, `min_age=16`, `max_age=24`, `country_id=ZA` |
| `seniors in nigeria` | `age_group=senior`, `country_id=NG` |

---

## Parser limitations

- **No synonym expansion.** Words like `guys`, `ladies`, `folks`, `people` are ignored (they produce no gender filter).
- **"Young" cannot combine with an age group.** A query like `young teenagers` will set numeric age bounds (`min_age=16`, `max_age=24`) and skip the age-group matching pass entirely. The two are treated as mutually exclusive.
- **No negation.** Phrases such as `not from nigeria` or `excluding males` are not handled; the country or gender filter will be applied as if the negation were absent.
- **No ordinal references.** Phrases like `the oldest`, `youngest profiles` are not interpreted.
- **Single country per query.** Only the first matching country name wins; a query like `from nigeria and ghana` will only filter by Nigeria.
- **Ambiguous short names.** `guinea` matches Guinea (GN). If you want Guinea-Bissau or Equatorial Guinea, the full name must be used.
- **Probability filters.** The NLP parser never produces `min_gender_probability` or `min_country_probability` filters — those are only available via the structured `GET /api/profiles` endpoint.
- **No fuzzy matching / typo correction.** `nigeriaaa` will not match Nigeria.
- **No context memory.** Each query is parsed independently.

---

## Error responses

All errors follow:

```json
{ "status": "error", "message": "<message>" }
```

| Status | Meaning |
|---|---|
| 400 | Missing or empty parameter |
| 422 | Invalid parameter type or value |
| 404 | Profile not found |
| 502 | Upstream API returned an invalid response |
| 500 | Internal server error |
