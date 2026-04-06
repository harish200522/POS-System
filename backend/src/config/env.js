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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildEnv() {
  const nodeEnv = String(process.env.NODE_ENV || "development").trim().toLowerCase();
  const isProduction = nodeEnv === "production";

  const fallbackClientOrigins = isProduction
    ? []
    : ["http://127.0.0.1:5500", "http://localhost:5500"];
  const clientOrigins = parseOrigins(process.env.CLIENT_ORIGIN, fallbackClientOrigins);
  const allowInMemoryDb = asBoolean(process.env.ALLOW_IN_MEMORY_DB, false);
  const trustProxy = asBoolean(process.env.TRUST_PROXY, false);
  const port = asNumber(process.env.PORT, 5000);

  const jwtSecret =
    String(process.env.JWT_SECRET || "").trim() ||
    (isProduction ? "" : "dev-only-insecure-secret-change-before-production");
  const jwtExpiresIn = String(process.env.JWT_EXPIRES_IN || "8h").trim();

  const config = {
    nodeEnv,
    isProduction,
    port,
    mongoUri: String(process.env.MONGO_URI || "").trim(),
    allowInMemoryDb,
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
  };

  assert(["development", "test", "production"].includes(config.nodeEnv), "NODE_ENV is invalid");
  assert(config.port > 0 && config.port < 65536, "PORT must be between 1 and 65535");

  if (config.isProduction) {
    assert(config.mongoUri, "MONGO_URI is required in production");
    assert(!config.allowInMemoryDb, "ALLOW_IN_MEMORY_DB must be false in production");
    assert(config.clientOrigins.length > 0, "CLIENT_ORIGIN is required in production");
    assert(config.jwtSecret && config.jwtSecret.length >= 32, "JWT_SECRET must be at least 32 characters in production");
    assert(!isPlaceholderSecret(config.jwtSecret), "JWT_SECRET cannot be a placeholder value");
  }

  if (!config.mongoUri && !config.allowInMemoryDb) {
    throw new Error("MONGO_URI is required unless ALLOW_IN_MEMORY_DB is true");
  }

  const hasAnyRazorpay = Boolean(config.razorpayKeyId || config.razorpayKeySecret || config.razorpayWebhookSecret);
  const hasAllRazorpay = Boolean(config.razorpayKeyId && config.razorpayKeySecret && config.razorpayWebhookSecret);

  if (hasAnyRazorpay && !hasAllRazorpay) {
    throw new Error(
      "RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET must all be set together"
    );
  }

  return config;
}

export const env = buildEnv();
