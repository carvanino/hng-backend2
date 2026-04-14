import express from "express";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";

const GATEWAY_PORT = process.env.GATEWAY_PORT || 3000;
const STAGE0_TARGET = process.env.STAGE0_TARGET || "http://localhost:3001";
const STAGE1_TARGET = process.env.STAGE1_TARGET || "http://localhost:3002";

const app = express();
app.use(cors());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Gateway server running' });
});

app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "HNG Backend Gateway is running",
    routes: {
      stage0: "/stage-0",
      stage1: "/stage-1",
      health: "/health",
    },
  });
});

app.use(
  "/stage-0",
  createProxyMiddleware({
    target: STAGE0_TARGET,
    changeOrigin: true,
    pathRewrite: {
      '^/stage-0': '', // Remove /stage-0 prefix when forwarding
    },
    onError: (err, req, res) => {
      console.log(err);
      console.error('Proxy error for stage-0:', err.message);
      res.status(502).json({ error: 'stage-0 server unavailable' });
    }
  })
);

app.use(
  "/stage-1",
  createProxyMiddleware({
    target: STAGE1_TARGET,
    changeOrigin: true,
    pathRewrite: {
      '^/stage-1': '', // Remove /stage-1 prefix when forwarding
    },
    onError: (err, req, res) => {
      console.error('Proxy error for stage-1:', err.message);
      res.status(502).json({ error: 'stage-1 server unavailable' });
    }
  })
);

app.listen(GATEWAY_PORT, () => {
  console.log(`Gateway server running on port ${GATEWAY_PORT}`);
  console.log(`stage-0 target: ${STAGE0_TARGET}`);
  console.log(`stage-1 target: ${STAGE1_TARGET}`);
});
