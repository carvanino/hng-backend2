# Insighta Labs+ — Backend

Secure, multi-interface Profile Intelligence API. Built on top of Stage 2 with authentication, role-based access control, token management, and a CSV export.

---

## System Architecture

```
┌─────────────────────────────────────────────────┐
│                   Clients                        │
│        CLI Tool          Web Portal              │
└────────────┬─────────────────┬───────────────────┘
             │                 │
             ▼                 ▼
┌─────────────────────────────────────────────────┐
│              Insighta Labs+ Backend              │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  /auth   │  │  /api    │  │  Middleware   │  │
│  │  router  │  │ profiles │  │  authenticate │  │
│  └──────────┘  └──────────┘  │  authorize    │  │
│                               │  apiVersion   │  │
│  ┌─────────────────────────┐  │  rateLimiter  │  │
│  │     GitHub OAuth        │  │  logger       │  │
│  │  (PKCE for CLI flow)    │  └───────────────┘  │
│  └─────────────────────────┘                     │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │             PostgreSQL                      │ │
│  │  profiles · users · refresh_tokens         │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- A GitHub OAuth App ([create one here](https://github.com/settings/developers))

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in values
cp .env.example .env

# 3. Generate secrets
openssl rand -hex 64   # ACCESS_TOKEN_SECRET
openssl rand -hex 64   # REFRESH_TOKEN_SECRET
openssl rand -hex 32   # COOKIE_SECRET

# 4. Start the server
npm run dev
```

The server will initialise all database tables on startup via `initDB()`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3004) |
| `DATABASE_URL` | PostgreSQL connection string |
| `DB_SSL` | Set to `true` for hosted DBs |
| `GENDERIZE_URL` | `https://api.genderize.io` |
| `AGIFY_URL` | `https://api.agify.io` |
| `NATIONALIZE_URL` | `https://api.nationalize.io` |
| `GITHUB_CLIENT_ID` | From your GitHub OAuth App |
| `GITHUB_CLIENT_SECRET` | From your GitHub OAuth App |
| `GITHUB_CALLBACK_URL` | Must match GitHub app settings |
| `ACCESS_TOKEN_SECRET` | JWT signing secret |
| `REFRESH_TOKEN_SECRET` | Refresh token signing secret |
| `ACCESS_TOKEN_EXPIRY` | In seconds — TRD requires `180` |
| `REFRESH_TOKEN_EXPIRY` | In seconds — TRD requires `300` |
| `WEB_PORTAL_URL` | Origin for CORS on the web portal |
| `COOKIE_SECRET` | Cookie signing secret |

---

## Authentication Flow

### Web Portal Flow

```
Browser → GET /auth/github
       ← 302 redirect to GitHub OAuth page

GitHub → GET /auth/github/callback?code=...&state=...
Backend validates state → exchanges code for GitHub token
       → fetches GitHub user → upserts user in DB
       → issues access token + refresh token
       ← returns tokens in response body (web uses HTTP-only cookies)
```

### CLI Flow (PKCE)

```
CLI generates:
  code_verifier  (random secret, stays in CLI)
  code_challenge (BASE64URL(SHA256(code_verifier)))
  state          (CSRF protection)

CLI opens browser → GitHub OAuth page (with code_challenge)
GitHub → CLI local callback server?code=...&state=...

CLI validates state
CLI sends { code, code_verifier } → POST /auth/github/callback

Backend exchanges code + code_verifier with GitHub
      → issues tokens → CLI stores in ~/.insighta/credentials.json
```

---

## Token Handling

| Token | Expiry | Storage | Purpose |
|---|---|---|---|
| Access token | 3 minutes | Client memory / CLI file | Authenticates API requests |
| Refresh token | 5 minutes | PostgreSQL `refresh_tokens` table | Issues new token pairs |

**Rotation:** Every call to `POST /auth/refresh` invalidates the old refresh token immediately and issues a brand new pair. This means stolen refresh tokens have a very short window of usefulness.

**Revocation:** `POST /auth/logout` deletes the refresh token from the DB. The access token expires naturally within 3 minutes — there is no server-side access token blacklist.

**is_active check:** On every authenticated request, the backend queries the DB to confirm the user's `is_active` flag is `true`. If an admin deactivates an account, that user is blocked immediately — they don't need to wait for their JWT to expire.

---

## Role Enforcement

Two roles exist: `admin` and `analyst`. Default on signup is `analyst`.

| Role | Permissions |
|---|---|
| `admin` | Full access — create profiles, delete profiles, read, search, export |
| `analyst` | Read-only — list, get by id, search, export |

Enforcement is handled by two middleware functions applied in sequence on every `/api/*` request:

1. `authenticate` — verifies the JWT, checks `is_active`, attaches `req.user`
2. `authorize(role)` — checks `req.user.role` against the required role

```js
// Applied at the route level
router.post("/",    authenticate, authorize("admin"), handler)
router.delete("/:id", authenticate, authorize("admin"), handler)
router.get("/",     authenticate, handler) // any authenticated user
```

---

## API Reference

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/auth/github` | Redirect to GitHub OAuth |
| `GET` | `/auth/github/callback` | Handle OAuth callback, issue tokens |
| `POST` | `/auth/refresh` | Rotate refresh token, get new pair |
| `POST` | `/auth/logout` | Invalidate refresh token |

**Refresh request:**
```json
{ "refresh_token": "string" }
```

**Refresh response:**
```json
{ "status": "success", "access_token": "string", "refresh_token": "string" }
```

---

### Profiles

All `/api/*` endpoints require:
- `Authorization: Bearer <access_token>`
- `X-API-Version: 1`

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `GET` | `/api/profiles` | any | List profiles with filters, sorting, pagination |
| `GET` | `/api/profiles/:id` | any | Get a single profile |
| `GET` | `/api/profiles/search?q=` | any | Natural language search |
| `GET` | `/api/profiles/export?format=csv` | any | Export filtered profiles as CSV |
| `POST` | `/api/profiles` | admin | Create a new profile |
| `DELETE` | `/api/profiles/:id` | admin | Delete a profile |

**Query parameters (list + export):**

| Param | Type | Example |
|---|---|---|
| `gender` | `male` \| `female` | `?gender=male` |
| `age_group` | `child` \| `teenager` \| `adult` \| `senior` | `?age_group=adult` |
| `country_id` | ISO 3166-1 alpha-2 | `?country_id=NG` |
| `min_age` / `max_age` | number | `?min_age=20&max_age=35` |
| `sort_by` | `age` \| `created_at` \| `gender_probability` | `?sort_by=age` |
| `order` | `asc` \| `desc` | `?order=desc` |
| `page` / `limit` | number (limit max: 50) | `?page=2&limit=20` |

**Paginated response shape:**
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "total_pages": 203,
  "links": {
    "self": "/api/profiles?page=1&limit=10",
    "next": "/api/profiles?page=2&limit=10",
    "prev": null
  },
  "data": [ ... ]
}
```

---

## Natural Language Search

`GET /api/profiles/search?q=young+males+from+nigeria`

The parser is fully rule-based — no AI or external services involved. It extracts:

- **Gender** — keywords: `male`, `men`, `man`, `female`, `women`, `woman`
- **Age group** — keywords: `children`, `teenagers`, `adults`, `seniors`
- **Age range** — patterns: `above 25`, `under 40`, `between 20 and 30`, `young` (maps to 16–24)
- **Country** — 100+ country names mapped to ISO codes, longest-match first to handle multi-word names (e.g. `south africa` matches before `africa`)

If no recognisable intent is found, returns `{ "status": "error", "message": "Unable to interpret query" }`.

---

## Rate Limiting

| Scope | Limit | Key |
|---|---|---|
| `/auth/*` | 10 requests / minute | IP address |
| `/api/*` | 60 requests / minute | User ID (falls back to IP) |

Returns `429 Too Many Requests` when exceeded.

---

## Request Logging

Every request is logged to stdout:

```
GET /api/profiles 200 12 ms
POST /auth/refresh 200 8 ms
```

Format: `METHOD URL STATUS RESPONSE_TIME`

---

## Project Structure

```
stage-3/
├── server.js              Entry point
├── src/
│   ├── app.js             Express setup, middleware, route mounting
│   ├── utils.js           ApiError, sendError, formatProfile, helpers
│   ├── nlp.js             Rule-based NLP parser
│   ├── db/
│   │   └── index.js       pg pool + initDB (creates all tables)
│   ├── auth/
│   │   ├── router.js      /auth/* routes
│   │   ├── service.js     GitHub OAuth, token issuance, user upsert
│   │   └── pkce.js        PKCE helpers (used by CLI)
│   ├── middleware/
│   │   ├── authenticate.js  JWT verification + is_active check
│   │   ├── authorize.js     Role enforcement factory
│   │   ├── apiVersion.js    X-API-Version header check
│   │   ├── rateLimiter.js   Per-scope rate limiters
│   │   └── logger.js        Morgan request logger
│   └── profiles/
│       ├── router.js      /api/profiles/* routes
│       └── service.js     External APIs, buildQuery, DB operations
└── .env.example
```

---

## Security Notes

- Access tokens are short-lived (3 min) and stateless — verified by signature only
- Refresh tokens are stored in the DB and invalidated on every use (rotation)
- `is_active` is checked on every request via DB — deactivated users are blocked immediately
- State parameter prevents CSRF on the OAuth flow — stored in-memory with a 5-minute TTL
- All error responses follow a consistent `{ "status": "error", "message": "..." }` shape — no stack traces or internal details are leaked
