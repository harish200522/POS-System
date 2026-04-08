import User from "../models/User.js";
import { ACCESS_TOKEN_COOKIE_NAME } from "../utils/authCookie.js";
import { ApiError } from "../utils/errors.js";
import { verifyAccessToken } from "../utils/jwt.js";

function readAccessToken(req) {
  return String(req?.cookies?.[ACCESS_TOKEN_COOKIE_NAME] || "").trim();
}

export async function authenticate(req, res, next) {
  try {
    const token = readAccessToken(req);
    if (!token) {
      throw new ApiError(401, "Authentication cookie is missing. Please login again.");
    }

    const payload = verifyAccessToken(token);
    const userId = String(payload?.userId || payload?.sub || "").trim();
    const tokenShopId = String(payload?.shopId || "").trim();

    if (!userId || !tokenShopId) {
      throw new ApiError(401, "Invalid authentication cookie. Please login again.");
    }

    const user = await User.findById(userId).select("_id username displayName role isActive shopId");

    if (!user || !user.isActive) {
      throw new ApiError(401, "User is not authorized");
    }

    const shopId = String(user.shopId || "").trim();
    if (!shopId) {
      throw new ApiError(401, "User is not linked to a shop");
    }

    if (shopId !== tokenShopId) {
      throw new ApiError(401, "Invalid authentication cookie. Please login again.");
    }

    req.shopId = shopId;

    req.auth = {
      userId: String(user._id),
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      shopId,
    };

    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new ApiError(401, "Session cookie expired. Please login again."));
    }

    if (error.name === "JsonWebTokenError") {
      return next(new ApiError(401, "Invalid authentication cookie. Please login again."));
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
