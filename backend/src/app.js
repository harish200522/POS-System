import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import paymentSettingsRoutes from "./routes/paymentSettingsRoutes.js";
import paymentsRoutes from "./routes/paymentsRoutes.js";
import productsRoutes from "./routes/productsRoutes.js";
import publicInvoiceRoutes from "./routes/publicInvoiceRoutes.js";
import reportsRoutes from "./routes/reportsRoutes.js";
import salesRoutes from "./routes/salesRoutes.js";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", env.trustProxy ? 1 : 0);

const apiLimiter = rateLimit({
  windowMs: env.apiRateLimitWindowMs,
  max: env.apiRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMs,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication requests. Please try again shortly.",
  },
});

function getRequestIp(req) {
  const forwardedForHeader = String(req.headers["x-forwarded-for"] || "").trim();
  if (forwardedForHeader) {
    return forwardedForHeader.split(",")[0].trim();
  }

  return String(req.ip || req.socket?.remoteAddress || "unknown").trim();
}

function logSuspiciousActivity(req, reason, extra = {}) {
  const metadata = {
    method: req.method,
    path: req.originalUrl,
    ip: getRequestIp(req),
    userAgent: String(req.headers["user-agent"] || "unknown"),
    ...extra,
  };

  console.warn(`[SECURITY][SUSPICIOUS] ${reason} ${JSON.stringify(metadata)}`);
}

const onboardingLimiter = rateLimit({
  windowMs: env.onboardingRateLimitWindowMs,
  max: env.onboardingRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res, _next, options) {
    logSuspiciousActivity(req, "Tenant onboarding rate limit exceeded", {
      limit: Number(options?.limit ?? options?.max ?? env.onboardingRateLimitMax),
      windowMs: Number(options?.windowMs ?? env.onboardingRateLimitWindowMs),
    });

    return res.status(429).json({
      success: false,
      message: "Too many tenant onboarding attempts. Please try again later.",
    });
  },
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = String(origin).trim().replace(/\/+$/, "");
      
      const capacitorOrigins = ["http://localhost", "capacitor://localhost"];
      if (
        capacitorOrigins.includes(normalizedOrigin) || 
        env.clientOrigins.includes(normalizedOrigin)
      ) {
        return callback(null, true);
      }

      const corsError = new Error("CORS origin is not allowed");
      corsError.statusCode = 403;
      return callback(corsError);
    },
    credentials: true,
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/auth/register", onboardingLimiter);
app.use("/api/auth/bootstrap-admin", onboardingLimiter);
app.use("/public", apiLimiter);

// Webhook signature verification needs raw request body before JSON parsing.
app.use("/api/payments/upi/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(env.isProduction ? "combined" : "dev"));

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/public/invoice", publicInvoiceRoutes);
app.use("/api/public/invoice", publicInvoiceRoutes);

const blockPublicShopCreation = (req, res) => {
  logSuspiciousActivity(req, "Blocked attempt to access removed public shop creation endpoint");
  return res.status(403).json({
    success: false,
    message: "Public shop creation is disabled. Use /api/auth/register for tenant onboarding.",
  });
};

app.post("/api/shops", blockPublicShopCreation);
app.post("/api/shops/*", blockPublicShopCreation);

app.use("/api/products", productsRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/payment", paymentSettingsRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/inventory", inventoryRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
