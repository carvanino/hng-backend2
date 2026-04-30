import { Router } from "express";
import { sendError, ApiError } from "../utils.js";
import {
  getRedirectURL,
  exchangeCodeForToken,
  validateState,
  findOrCreateUser,
  generateAuthToken,
  generateAndSaveRefreshToken,
  refreshAuthToken,
  revokeRefreshToken
} from "./service.js";

const router = Router();

// - GET /auth/github ────────────────────────────────────────────────────────
router.get("/github", (req, res) => {
  const cli_port   = req.query.cli_port ?? null;
  const redirectUrl = getRedirectURL(cli_port);
  res.redirect(redirectUrl);
});

// - GET /auth/github/callback ───────────────────────────────────────────────
router.get("/github/callback", async (req, res) => {
  const { code, state } = req.query;

  const { valid, cli_port } = validateState(state);

  if (!state || !valid) {
    return sendError(res, new ApiError(400, "Invalid or missing state parameter"));
  }

  if (!code) {
    return sendError(res, new ApiError(400, "Authorization code not provided"));
  }

  try {
    const { accessToken: githubToken, githubUser } = await exchangeCodeForToken(code);

    const user = await findOrCreateUser(githubUser);

    if (!user.is_active) {
      return sendError(res, new ApiError(403, "Account is deactivated"));
    }

    const appAccessToken = await generateAuthToken(user);
    const refreshToken   = await generateAndSaveRefreshToken(user.id);

    // CLI flow — redirect to local server with tokens in query params
    if (cli_port) {
      const params = new URLSearchParams({
        access_token:  appAccessToken,
        refresh_token: refreshToken,
        username:      user.username,
        email:         user.email ?? "",
        role:          user.role,
        id:            user.id,
      });
      return res.redirect(`http://localhost:${cli_port}/callback?${params.toString()}`);
    }

    // Web flow — return JSON
    return res.status(200).json({
      status: "success",
      data: {
        access_token:  appAccessToken,
        refresh_token: refreshToken,
        user: {
          id:         user.id,
          username:   user.username,
          email:      user.email,
          avatar_url: user.avatar_url,
          role:       user.role,
        },
      },
    });
  } catch (err) {
    console.error("GitHub OAuth error:", err);
    return sendError(res, new ApiError(500, "Failed to authenticate with GitHub"));
  }
});

// - POST /auth/refresh ─────────────────────────────────────────────────────
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return sendError(res, new ApiError(400, "Refresh token not provided"));
  }

  try {
    const { accessToken, newRefreshToken } = await refreshAuthToken(refreshToken);
    return res.status(200).json({
      status: "success",
      access_token: accessToken,
      refresh_token: newRefreshToken,
    });
  } catch (err) {
    console.error("Token refresh error:", err);
    return sendError(res, new ApiError(401, "Invalid or expired refresh token"));
  }
});

// - POST /auth/logout ──────────────────────────────────────────────────────
router.post("/logout", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) return sendError(res, new ApiError(400, "Refresh token required"));

  try {
    await revokeRefreshToken(refreshToken);
    return res.status(200).json({ status: "success", message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    return sendError(res, new ApiError(500, "Failed to log out"));
  }
});

export default router;