import express from "express";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";

const GATEWAY_PORT = process.env.GATEWAY_PORT || 3000;
const STAGE0_TARGET = process.env.STAGE0_TARGET || "http://localhost:3001";
const STAGE1_TARGET = process.env.STAGE1_TARGET || "http://localhost:3002";
const STAGE2_TARGET = process.env.STAGE2_TARGET || "http://localhost:3003";

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
      stage2: "/stage-2",
      health: "/health",
    },
  });
});

const proxy = (target, prefix) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: { [`^/${prefix}`]: "" },
    onError: (err, req, res) => {
      console.error(`Proxy error for ${prefix}:`, err.message);
      res.status(502).json({ error: `${prefix} server unavailable` });
    },
  });

app.use("/stage-0", proxy(STAGE0_TARGET, "stage-0"));
app.use("/stage-1", proxy(STAGE1_TARGET, "stage-1"));
app.use("/stage-2", proxy(STAGE2_TARGET, "stage-2"));

app.listen(GATEWAY_PORT, () => {
  console.log(`Gateway server running on port ${GATEWAY_PORT}`);
  console.log(`stage-0 → ${STAGE0_TARGET}`);
  console.log(`stage-1 → ${STAGE1_TARGET}`);
  console.log(`stage-2 → ${STAGE2_TARGET}`);
});
