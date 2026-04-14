# Stage 1 Backend API

## Overview

This service exposes endpoints that classify a name using external prediction APIs.

Primary endpoint:
- `POST /api/profiles` (Genderize + Agify + Nationalize aggregation with in-memory persistence)

Also available:
- `GET /api/classify` (Genderize-only quick classification)

## Base Path

```txt
/api
```

## Features

- Multi-API integration with Genderize, Agify, and Nationalize
- Aggregated profile response format
- In-memory data persistence (`DATABASE` array)
- Idempotent profile creation by normalized name
- Validation and structured error responses
- CORS enabled globally (`Access-Control-Allow-Origin: *`)
- Rate limiting enabled
- UUID v7 IDs
- UTC ISO 8601 timestamps

## Endpoints

### POST `/api/profiles`

Creates or returns a profile for the provided `name`.

#### Request Body

```json
{
  "name": "ella"
}
```

#### Success Response (200, new profile)

```json
{
  "status": "success",
  "data": {
    "id": "b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12",
    "name": "ella",
    "gender": "female",
    "gender_probability": 0.99,
    "sample_size": 1234,
    "age": 46,
    "age_group": "adult",
    "country_id": "DRC",
    "country_probability": 0.85,
    "created_at": "2026-04-01T12:00:00Z"
  }
}
```

#### Success Response (200, existing profile)

```json
{
  "status": "success",
  "message": "Profile already exists",
  "data": {
    "id": "b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12",
    "name": "ella",
    "gender": "female",
    "gender_probability": 0.99,
    "sample_size": 1234,
    "age": 46,
    "age_group": "adult",
    "country_id": "DRC",
    "country_probability": 0.85,
    "created_at": "2026-04-01T12:00:00Z"
  }
}
```

### GET `/api/classify?name={name}`

Returns Genderize prediction only.

#### Success Response (200)

```json
{
  "status": "success",
  "data": {
    "name": "ella",
    "gender": "female",
    "gender_probability": 0.99,
    "sample_size": 1234
  }
}
```

### GET `/api/`

Health-style welcome endpoint.

## Processing Rules

- Genderize:
  - `gender` -> `gender`
  - `probability` -> `gender_probability`
  - `count` -> `sample_size`
  - If `gender === null` or `count === 0`: error
- Agify:
  - `age` -> `age`
  - Age group mapping:
    - `0-12`: `child`
    - `13-19`: `teenager`
    - `20-59`: `adult`
    - `60+`: `senior`
  - If `age === null`: error
- Nationalize:
  - Select highest `probability` country as `country_id`
  - Keep selected probability as `country_probability`
  - If country list is empty: error

## Validation Rules

- Missing `name` or empty string -> `400`
- Non-string `name` -> `422`

## Error Response Format

All errors use:

```json
{ "status": "error", "message": "<error message>" }
```

Common statuses:
- `400` bad request
- `422` unprocessable entity
- `404` no prediction data available
- `500` server/config errors
- `502` external API fetch failure
- `429` rate limit exceeded

## Setup

### Install dependencies

```bash
npm install
```

### Environment Variables

Create `.env` in `stage-1`:

```env
PORT=3000
GENDERIZE_URL=https://api.genderize.io
AGIFY_URL=https://api.agify.io
NATIONALIZE_URL=https://api.nationalize.io
```

## Run

### Development

```bash
npm run dev
```

### Production

```bash
node server.js
```

## Notes

- Persistence is in-memory for this stage and resets when the server restarts.
- Name matching for idempotency uses normalized lowercase trimmed name.
- Response time depends on external API latency.
