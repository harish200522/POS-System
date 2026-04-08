import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

function resolveAccessTokenIdentity(user) {
  const userId = String(user?._id || user?.id || "").trim();
  const shopId = String(user?.shopId || "").trim();

  if (!userId) {
    throw new Error("Cannot sign access token without user id");
  }

  if (!shopId) {
    throw new Error("Cannot sign access token without shop id");
  }

  return { userId, shopId };
}

export function signAccessToken(user) {
  const { userId, shopId } = resolveAccessTokenIdentity(user);

  return jwt.sign(
    {
      sub: userId,
      userId,
      role: user.role,
      username: user.username,
      shopId,
    },
    env.jwtSecret,
    {
      expiresIn: env.jwtExpiresIn,
      issuer: "countercraft-pos",
      audience: "countercraft-pos-client",
      algorithm: "HS256",
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret, {
    issuer: "countercraft-pos",
    audience: "countercraft-pos-client",
  });
}
