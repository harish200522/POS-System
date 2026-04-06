import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      username: user.username,
    },
    env.jwtSecret,
    {
      expiresIn: env.jwtExpiresIn,
      issuer: "countercraft-pos",
      audience: "countercraft-pos-client",
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret, {
    issuer: "countercraft-pos",
    audience: "countercraft-pos-client",
  });
}
