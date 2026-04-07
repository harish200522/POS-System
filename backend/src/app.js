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

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (env.clientOrigins.includes(origin)) {
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

// Webhook signature verification needs raw request body before JSON parsing.
app.use("/api/payments/upi/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.isProduction ? "combined" : "dev"));

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
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
