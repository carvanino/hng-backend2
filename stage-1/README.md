# Stage 1 Backend API

## Overview

This service stores generated name profiles in an in-memory database and exposes endpoints to create, retrieve, filter, and delete profiles.

## Base Path

```txt
/api
```

## Features

- Calls Genderize, Agify, and Nationalize APIs
- Applies age-group and nationality classification logic
- Stores profiles in-memory
- Idempotent profile creation by normalized name
- Case-insensitive filtering for list endpoint
- UUID v7 IDs and UTC ISO 8601 timestamps
- CORS enabled (`Access-Control-Allow-Origin: *`)

## Endpoints

### 1) Create Profile

`POST /api/profiles`

Request body:

```json
{ "name": "ella" }
```

Success (`201 Created`):

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

Duplicate name (`200 OK`):

```json
{
  "status": "success",
  "message": "Profile already exists",
  "data": { "...": "existing profile" }
}
```

### 2) Get Single Profile

`GET /api/profiles/{id}`

Success (`200 OK`):

```json
{
  "status": "success",
  "data": {
    "id": "b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12",
    "name": "emmanuel",
    "gender": "male",
    "gender_probability": 0.99,
    "sample_size": 1234,
    "age": 25,
    "age_group": "adult",
    "country_id": "NG",
    "country_probability": 0.85,
    "created_at": "2026-04-01T12:00:00Z"
  }
}
```

### 3) Get All Profiles

`GET /api/profiles`

Optional query params (case-insensitive values):
- `gender`
- `country_id`
- `age_group`

Example:

```txt
/api/profiles?gender=male&country_id=NG
```

Success (`200 OK`):

```json
{
  "status": "success",
  "count": 2,
  "data": [
    {
      "id": "id-1",
      "name": "emmanuel",
      "gender": "male",
      "age": 25,
      "age_group": "adult",
      "country_id": "NG"
    },
    {
      "id": "id-2",
      "name": "sarah",
      "gender": "female",
      "age": 28,
      "age_group": "adult",
      "country_id": "US"
    }
  ]
}
```

### 4) Delete Profile

`DELETE /api/profiles/{id}`

Success: `204 No Content`

### Extra Endpoint (kept)

`GET /api/classify?name={name}`

Returns Genderize-only prediction.

## Classification Rules

- Age group from Agify:
  - `0-12` -> `child`
  - `13-19` -> `teenager`
  - `20-59` -> `adult`
  - `60+` -> `senior`
- Nationality: choose country with highest probability from Nationalize

## Validation and Errors

All errors use:

```json
{ "status": "error", "message": "<error message>" }
```

Status rules:
- `400`: Missing or empty name
- `422`: Invalid type
- `404`: Profile not found
- `500`: Internal server failure
- `502`: Upstream invalid response

Edge-case upstream errors:
- Genderize invalid (`gender: null` or `count: 0`) ->
  - `{ "status": "error", "message": "Genderize returned an invalid response" }`
- Agify invalid (`age: null`) ->
  - `{ "status": "error", "message": "Agify returned an invalid response" }`
- Nationalize invalid (no country data) ->
  - `{ "status": "error", "message": "Nationalize returned an invalid response" }`

## Setup

Install dependencies:

```bash
npm install
```

Create `.env`:

```env
PORT=3002
GENDERIZE_URL=https://api.genderize.io
AGIFY_URL=https://api.agify.io
NATIONALIZE_URL=https://api.nationalize.io
```

Run:

```bash
npm start
```

## Notes

- Data persistence is in-memory and resets on restart.
- `name` is normalized (trimmed + lowercase) for idempotency.
