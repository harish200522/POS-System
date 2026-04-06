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

function buildEnv() {
  const nodeEnv = String(process.env.NODE_ENV || "development").trim().toLowerCase();
  const isProduction = nodeEnv === "production";

  const fallbackClientOrigins = isProduction
    ? []
    : ["http://127.0.0.1:5500", "http://localhost:5500"];
  const clientOrigins = parseOrigins(process.env.CLIENT_ORIGIN, fallbackClientOrigins);
  const trustProxy = asBoolean(process.env.TRUST_PROXY, false);
  const port = asNumber(process.env.PORT, Number.NaN);
  const jwtSecret = String(process.env.JWT_SECRET || "").trim();
  const jwtExpiresIn = String(process.env.JWT_EXPIRES_IN || "8h").trim();

  const config = {
    nodeEnv,
    isProduction,
    port,
    mongoUri: String(process.env.MONGO_URI || "").trim(),
    dnsServers: String(process.env.DNS_SERVERS || "").trim(),
    clientOrigins,
    trustProxy,
    jwtSecret,
    jwtExpiresIn,
    apiRateLimitWindowMs: asNumber(process.env.API_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    apiRateLimitMax: asNumber(process.env.API_RATE_LIMIT_MAX, 300),
    authRateLimitWindowMs: asNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    authRateLimitMax: asNumber(process.env.AUTH_RATE_LIMIT_MAX, 20),
    razorpayKeyId: String(process.env.RAZORPAY_KEY_ID || "").trim(),
    razorpayKeySecret: String(process.env.RAZORPAY_KEY_SECRET || "").trim(),
    razorpayWebhookSecret: String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim(),
    upiId: String(process.env.UPI_ID || "").trim(),
    shopName: String(process.env.SHOP_NAME || "CounterCraft POS").trim() || "CounterCraft POS",
    upiSessionTimeoutSec: asNumber(process.env.UPI_SESSION_TIMEOUT_SEC, 120),
  };

  return config;
}

function validateEnv(config) {
  const errors = [];

  if (!isRequired(process.env.MONGO_URI)) {
    errors.push("MONGO_URI is required");
  }

  if (!isRequired(process.env.JWT_SECRET)) {
    errors.push("JWT_SECRET is required");
  }

  if (!isRequired(process.env.NODE_ENV)) {
    errors.push("NODE_ENV is required");
  }

  if (!isRequired(process.env.PORT)) {
    errors.push("PORT is required");
  }

  if (!["development", "test", "production"].includes(config.nodeEnv)) {
    errors.push("NODE_ENV must be one of: development, test, production");
  }

  if (!Number.isFinite(config.port) || config.port <= 0 || config.port >= 65536) {
    errors.push("PORT must be between 1 and 65535");
  }

  if (config.isProduction) {
    if (config.clientOrigins.length === 0) {
      errors.push("CLIENT_ORIGIN is required in production");
    }

    if (config.clientOrigins.includes("*")) {
      errors.push("CLIENT_ORIGIN cannot contain '*' in production");
    }

    if (config.jwtSecret.length < 32) {
      errors.push("JWT_SECRET must be at least 32 characters in production");
    }

    if (isPlaceholderSecret(config.jwtSecret)) {
      errors.push("JWT_SECRET cannot be a placeholder value");
    }
  }

  if (config.upiSessionTimeoutSec < 60 || config.upiSessionTimeoutSec > 900) {
    errors.push("UPI_SESSION_TIMEOUT_SEC must be between 60 and 900");
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
