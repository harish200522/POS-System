import dotenv from "dotenv";

dotenv.config();

function asBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function asNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseOrigins(value, fallback = []) {
  if (!value) return fallback;

  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isPlaceholderSecret(value) {
  return /changeme|example|xxxxxxxx|<|>|your-/i.test(String(value || ""));
}

function isRequired(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

const MIN_SECRET_LENGTH = 32;

function buildEnv() {
  const nodeEnv = String(process.env.NODE_ENV || "development").trim().toLowerCase();
  const isProduction = nodeEnv === "production";

  const clientOrigins = parseOrigins(process.env.CLIENT_ORIGIN, []);
  const trustProxy = asBoolean(process.env.TRUST_PROXY, false);
  const port = asNumber(process.env.PORT, Number.NaN);
  const jwtSecret = String(process.env.JWT_SECRET || "").trim();
  const invoiceTokenSecret = String(process.env.INVOICE_TOKEN_SECRET || "").trim();
  const jwtExpiresIn = String(process.env.JWT_EXPIRES_IN || "8h").trim();
  const invoiceShareLinkTtlSec = asNumber(process.env.INVOICE_SHARE_LINK_TTL_SEC, 14 * 24 * 60 * 60);

  const config = {
    nodeEnv,
    isProduction,
    port,
    mongoUri: String(process.env.MONGO_URI || "").trim(),
    dnsServers: String(process.env.DNS_SERVERS || "").trim(),
    clientOrigins,
    trustProxy,
    jwtSecret,
    invoiceTokenSecret,
    jwtExpiresIn,
    invoiceShareLinkTtlSec,
    apiRateLimitWindowMs: asNumber(process.env.API_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    apiRateLimitMax: asNumber(process.env.API_RATE_LIMIT_MAX, 300),
    authRateLimitWindowMs: asNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    authRateLimitMax: asNumber(process.env.AUTH_RATE_LIMIT_MAX, 20),
    onboardingRateLimitWindowMs: asNumber(process.env.ONBOARDING_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000),
    onboardingRateLimitMax: asNumber(process.env.ONBOARDING_RATE_LIMIT_MAX, 5),
    razorpayKeyId: String(process.env.RAZORPAY_KEY_ID || "").trim(),
    razorpayKeySecret: String(process.env.RAZORPAY_KEY_SECRET || "").trim(),
    razorpayWebhookSecret: String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim(),
    defaultShopId: String(process.env.DEFAULT_SHOP_ID || "default-shop").trim() || "default-shop",
    upiSessionTimeoutSec: asNumber(process.env.UPI_SESSION_TIMEOUT_SEC, 120),
  };

  return config;
}

function validateEnv(config) {
  const errors = [];

  [
    "MONGO_URI",
    "CLIENT_ORIGIN",
    "JWT_SECRET",
    "INVOICE_TOKEN_SECRET",
    "NODE_ENV",
    "PORT",
  ].forEach((envKey) => {
    if (!isRequired(process.env[envKey])) {
      errors.push(`${envKey} is required`);
    }
  });

  if (!["development", "test", "production"].includes(config.nodeEnv)) {
    errors.push("NODE_ENV must be one of: development, test, production");
  }

  if (!Number.isFinite(config.port) || config.port <= 0 || config.port >= 65536) {
    errors.push("PORT must be between 1 and 65535");
  }

  if (config.clientOrigins.length === 0) {
    errors.push("CLIENT_ORIGIN must include at least one trusted origin");
  }

  if (config.clientOrigins.includes("*")) {
    errors.push("CLIENT_ORIGIN cannot contain '*'");
  }

  if (config.jwtSecret.length < MIN_SECRET_LENGTH) {
    errors.push(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }

  if (isPlaceholderSecret(config.jwtSecret)) {
    errors.push("JWT_SECRET cannot be a placeholder value");
  }

  if (config.invoiceTokenSecret.length < MIN_SECRET_LENGTH) {
    errors.push(`INVOICE_TOKEN_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }

  if (isPlaceholderSecret(config.invoiceTokenSecret)) {
    errors.push("INVOICE_TOKEN_SECRET cannot be a placeholder value");
  }

  if (config.isProduction) {
    if (!/^mongodb(\+srv)?:\/\//i.test(config.mongoUri)) {
      errors.push("MONGO_URI must be a valid mongodb connection string in production");
    }
  }

  if (!Number.isFinite(config.invoiceShareLinkTtlSec) || config.invoiceShareLinkTtlSec < 0) {
    errors.push("INVOICE_SHARE_LINK_TTL_SEC must be a non-negative number");
  }

  if (config.invoiceShareLinkTtlSec > 365 * 24 * 60 * 60) {
    errors.push("INVOICE_SHARE_LINK_TTL_SEC cannot exceed 31536000 seconds (365 days)");
  }

  if (config.upiSessionTimeoutSec < 60 || config.upiSessionTimeoutSec > 900) {
    errors.push("UPI_SESSION_TIMEOUT_SEC must be between 60 and 900");
  }

  if (!Number.isFinite(config.onboardingRateLimitWindowMs) || config.onboardingRateLimitWindowMs < 1000) {
    errors.push("ONBOARDING_RATE_LIMIT_WINDOW_MS must be at least 1000 milliseconds");
  }

  if (!Number.isFinite(config.onboardingRateLimitMax) || config.onboardingRateLimitMax < 1) {
    errors.push("ONBOARDING_RATE_LIMIT_MAX must be at least 1");
  }

  const hasAnyRazorpay = Boolean(config.razorpayKeyId || config.razorpayKeySecret || config.razorpayWebhookSecret);
  const hasAllRazorpay = Boolean(config.razorpayKeyId && config.razorpayKeySecret && config.razorpayWebhookSecret);

  if (hasAnyRazorpay && !hasAllRazorpay) {
    errors.push("RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET must all be set together");
  }

  return errors;
}

export const env = buildEnv();
export const envValidationErrors = validateEnv(env);

export function assertValidEnv() {
  if (!envValidationErrors.length) {
    return;
  }

  throw new Error(`Invalid environment configuration:\n- ${envValidationErrors.join("\n- ")}`);
}
