# HNG Backend Gateway

This project runs two Express servers (`stage-0` and `stage-1`) through a single gateway server.

## Setup

1. Install dependencies in all directories:

```bash
# Root directory
npm install

# Stage-0
cd stage-0 && npm install && cd ..

# Stage-1
cd stage-1 && npm install && cd ..
```

## Running the Servers

### Option 1: Run all servers at once (Development)

```bash
npm run dev
```

This starts:
- Gateway server on port `3000`
- `stage-0` server on port `3001`
- `stage-1` server on port `3002`

### Option 2: Run servers individually

```bash
# Terminal 1 - stage-0
cd stage-0 && PORT=3001 npm start

# Terminal 2 - stage-1
cd stage-1 && PORT=3002 npm start

# Terminal 3 - Gateway
npm start
```

## Access Points

- Gateway: `http://localhost:3000`
- `stage-0`: `http://localhost:3000/stage-0`
  - Example: `http://localhost:3000/stage-0/api/classify?name=emma`
- `stage-1`: `http://localhost:3000/stage-1`
  - Example: `POST http://localhost:3000/stage-1/api/profiles`

## How it Works

The gateway server proxies requests to the appropriate stage server:
- Requests to `/stage-0/*` -> forwarded to stage-0 server (`http://localhost:3001`)
- Requests to `/stage-1/*` -> forwarded to stage-1 server (`http://localhost:3002`)

The `/stage-0` and `/stage-1` prefixes are removed when forwarding to the actual servers.

## Environment Overrides (Optional)

Gateway defaults:
- `GATEWAY_PORT=3000`
- `STAGE0_TARGET=http://localhost:3001`
- `STAGE1_TARGET=http://localhost:3002`

You can override these when starting the gateway if needed.
