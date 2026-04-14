# README.md

## Overview

This project exposes a single REST API endpoint that integrates with the Genderize API to classify a given name and return processed results.

---

## Base URL

```
/api/classify?name={name}
```

---

## Features

* Integrates with external Genderize API
* Processes and normalizes API response
* Adds confidence calculation
* Adds request timestamp (UTC ISO 8601)
* CORS enabled for all origins
* Rate limiting enabled

---

## Endpoint

### GET `/api/classify`

#### Query Parameters

| Parameter | Type   | Required | Description      |
| --------- | ------ | -------- | ---------------- |
| name      | string | Yes      | Name to classify |

---

## Success Response (200)

```json
{
  "status": "success",
  "data": {
    "name": "john",
    "gender": "male",
    "probability": 0.99,
    "sample_size": 1234,
    "is_confident": true,
    "processed_at": "2026-04-01T12:00:00Z"
  }
}
```

---

## Error Responses

### 400 Bad Request

Missing or empty name:

```json
{ "status": "error", "message": "400 Bad Request: Missing or empty name parameter" }
```

### 422 Unprocessable Entity

Invalid type:

```json
{ "status": "error", "message": "422 Unprocessable Entity: name is not a string" }
```

### 500 Error (No prediction)

```json
{ "status": "error", "message": "No prediction available for the provided name" }
```

### 502 / External API failure

```json
{ "status": "error", "message": "Failed to fetch data from external API" }
```

### 429 Rate Limit

```json
{ "status": 429, "message": "Too many requests, please try again later." }
```

---

## Processing Rules

* `sample_size` is mapped from `count`
* `is_confident` is `true` when:

  * probability ≥ 0.7 **AND**
  * sample_size ≥ 100
* `processed_at` is generated per request (UTC ISO 8601)

---

## Setup

### Install dependencies

```bash
npm install
```

### Environment Variables

Create a `.env` file:

```
BASE_URL=https://api.genderize.io
PORT=3000
```

---

## Run Server

### Development

```bash
npm run dev
```

### Production

```bash
node server.js
```

---

## CORS

CORS is enabled globally:

```
Access-Control-Allow-Origin: *
```

---

## Rate Limiting

* 100 requests per 15 minutes per IP

---

## Notes

* Response time depends on external API latency
* Endpoint is designed to handle concurrent requests safely
