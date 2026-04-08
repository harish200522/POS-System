import { env } from "../config/env.js";

export const ACCESS_TOKEN_COOKIE_NAME = "pos_access_token";

const DEFAULT_COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function parseDurationToMs(durationValue, fallbackMs = DEFAULT_COOKIE_MAX_AGE_MS) {
  const normalizedValue = String(durationValue || "").trim().toLowerCase();

  if (!normalizedValue) {
    return fallbackMs;
  }

  if (/^\d+$/.test(normalizedValue)) {
    return Math.max(Number(normalizedValue) * 1000, 1000);
  }

  const durationMatch = normalizedValue.match(/^(\d+)(s|m|h|d)$/);
  if (!durationMatch) {
    return fallbackMs;
  }

  const [, amountRaw, unit] = durationMatch;
  const amount = Number(amountRaw);

  if (!Number.isFinite(amount) || amount <= 0) {
    return fallbackMs;
  }

  const multiplierByUnit = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * multiplierByUnit[unit];
}

export function getAccessTokenCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: parseDurationToMs(env.jwtExpiresIn),
  };
}

export function setAccessTokenCookie(res, token) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return;
  }

  res.cookie(ACCESS_TOKEN_COOKIE_NAME, normalizedToken, getAccessTokenCookieOptions());
}

export function clearAccessTokenCookie(res) {
  const { maxAge, ...cookieOptions } = getAccessTokenCookieOptions();
  void maxAge;
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, cookieOptions);
}