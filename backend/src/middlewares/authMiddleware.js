import User from "../models/User.js";
import { ApiError } from "../utils/errors.js";
import { verifyAccessToken } from "../utils/jwt.js";

function readBearerToken(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

export async function authenticate(req, res, next) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      throw new ApiError(401, "Authentication token is required");
    }

    const payload = verifyAccessToken(token);
    const userId = String(payload?.sub || "").trim();

    if (!userId) {
      throw new ApiError(401, "Invalid authentication token");
    }

    const user = await User.findById(userId).select("_id username displayName role isActive");

    if (!user || !user.isActive) {
      throw new ApiError(401, "User is not authorized");
    }

    req.auth = {
      userId: String(user._id),
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };

    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new ApiError(401, "Session expired. Please login again."));
    }

    if (error.name === "JsonWebTokenError") {
      return next(new ApiError(401, "Invalid authentication token"));
    }

    return next(error);
  }
}

export function requireRoles(...allowedRoles) {
  const roleSet = new Set(allowedRoles.map((entry) => String(entry || "").toLowerCase()));

  return function roleGuard(req, res, next) {
    const role = String(req.auth?.role || "").toLowerCase();

    if (!roleSet.has(role)) {
      return next(new ApiError(403, "You do not have permission to perform this action"));
    }

    return next();
  };
}
