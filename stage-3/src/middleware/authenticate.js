import { sendError, ApiError } from "../utils.js";
import { jwtVerify } from "jose";
import { query } from "../db/index.js";


const getUserById = async (id) => {
  const result = await query("SELECT id, username, email, avatar_url, role, is_active FROM users WHERE id = $1", [id]);
  return result.rows[0];
};

export default async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, new ApiError(401, "Authorization header missing or malformed"));
  }
  const token = authHeader.split(" ")[1];

  const secretKey = new TextEncoder().encode(process.env.ACCESS_TOKEN_SECRET);

  try {
    const { payload } = await jwtVerify(token, secretKey);

    const user = await getUserById(payload.sub);

    if (!user || !user.is_active) {
      return sendError(res, new ApiError(403, "User account is inactive"));
    }

    req.user = user;

    next();
  } catch (err) {
    console.error("JWT verification failed:", err);
    return sendError(res, new ApiError(401, "Invalid or expired token"));
  }
};