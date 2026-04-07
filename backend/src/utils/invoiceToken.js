import crypto from "crypto";
import { env } from "../config/env.js";

const DEFAULT_INVOICE_TOKEN_TTL_SEC = 14 * 24 * 60 * 60;

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(`${normalized}${"=".repeat(padding)}`, "base64");
}

function parseTokenTtlSeconds(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  const ttlMatch = normalizedValue.match(/^(\d+)(s|m|h|d)$/i);

  if (ttlMatch) {
    const amount = Number(ttlMatch[1]);
    const unit = ttlMatch[2].toLowerCase();
    const multipliers = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60,
    };
    return Math.max(amount * multipliers[unit], 60);
  }

  const numericSeconds = Number(normalizedValue);
  if (Number.isFinite(numericSeconds) && numericSeconds > 0) {
    return Math.max(Math.floor(numericSeconds), 60);
  }

  return DEFAULT_INVOICE_TOKEN_TTL_SEC;
}

function signPayload(payload) {
  return toBase64Url(
    crypto
      .createHmac("sha256", env.invoiceTokenSecret)
      .update(String(payload || ""))
      .digest()
  );
}

function assertValidSignature(signature, expectedSignature) {
  const signatureBuffer = Buffer.from(String(signature || ""));
  const expectedBuffer = Buffer.from(String(expectedSignature || ""));

  if (!signatureBuffer.length || signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

export function signInvoiceShareToken({ invoiceId, billNumber = "" } = {}) {
  const normalizedInvoiceId = String(invoiceId || "").trim();
  if (!normalizedInvoiceId) {
    throw new Error("invoiceId is required to sign invoice token");
  }

  const ttlSeconds = parseTokenTtlSeconds(env.invoiceTokenExpiresIn);
  const expiresAtUnix = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = {
    sub: normalizedInvoiceId,
    exp: expiresAtUnix,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  const token = `${encodedPayload}.${signature}`;
  const expiresAt = new Date(expiresAtUnix * 1000).toISOString();

  return {
    token,
    expiresAt,
  };
}

export function verifyInvoiceShareToken(token) {
  const tokenParts = String(token || "")
    .trim()
    .split(".");

  if (tokenParts.length !== 2) {
    const invalidFormatError = new Error("Invalid invoice token format");
    invalidFormatError.code = "TOKEN_INVALID";
    throw invalidFormatError;
  }

  const [encodedPayload, signature] = tokenParts;
  const expectedSignature = signPayload(encodedPayload);
  if (!assertValidSignature(signature, expectedSignature)) {
    const invalidSignatureError = new Error("Invalid invoice token signature");
    invalidSignatureError.code = "TOKEN_INVALID";
    throw invalidSignatureError;
  }

  let payload;
  try {
    const payloadJson = fromBase64Url(encodedPayload).toString("utf8");
    payload = JSON.parse(payloadJson);
  } catch (error) {
    const invalidPayloadError = new Error("Invalid invoice token payload");
    invalidPayloadError.code = "TOKEN_INVALID";
    throw invalidPayloadError;
  }

  const invoiceId = String(payload?.sub || "").trim();
  if (!invoiceId) {
    const invalidSubjectError = new Error("Invoice token subject is missing");
    invalidSubjectError.code = "TOKEN_INVALID";
    throw invalidSubjectError;
  }

  const expiresAtUnix = Number(payload?.exp);
  if (!Number.isFinite(expiresAtUnix) || expiresAtUnix <= Math.floor(Date.now() / 1000)) {
    const expiredTokenError = new Error("Invoice token expired");
    expiredTokenError.code = "TOKEN_EXPIRED";
    throw expiredTokenError;
  }

  return {
    invoiceId,
    billNumber: "",
    expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
  };
}
