import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import morgan from "morgan";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import billingRoutes from "./routes/billingRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import paymentsRoutes from "./routes/paymentsRoutes.js";
import productsRoutes from "./routes/productsRoutes.js";
import salesRoutes from "./routes/salesRoutes.js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "*",
    credentials: true,
  })
);

// Webhook signature verification needs raw request body before JSON parsing.
app.use("/api/payments/upi/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "POS backend is running",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/products", productsRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/inventory", inventoryRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
