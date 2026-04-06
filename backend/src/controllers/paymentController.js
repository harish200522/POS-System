import crypto from "node:crypto";
import Razorpay from "razorpay";
import Product from "../models/Product.js";
import Sale from "../models/Sale.js";
import UpiPaymentSession from "../models/UpiPaymentSession.js";
import { env } from "../config/env.js";
import { processBillingPayload } from "./billingController.js";
import { roundCurrency } from "../utils/dateRange.js";
import { ApiError, asyncHandler } from "../utils/errors.js";

const STATUS_POLL_INTERVAL_MS = 3000;
const DEFAULT_UPI_SESSION_TIMEOUT_SEC = 120;
const PROVIDER_MIN_EXPIRY_SEC = 600;

let razorpayClient = null;

function parsePositiveNumber(value, label) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new ApiError(400, `${label} must be a valid non-negative number`);
  }

  return numberValue;
}

function getUpiConfiguration() {
  if (!env.upiId) {
    throw new ApiError(503, "UPI_ID is not configured");
  }

  return {
    upiId: env.upiId,
    shopName: env.shopName,
    currency: "INR",
  };
}

function getRazorpayClient() {
  if (razorpayClient) {
    return razorpayClient;
  }

  const keyId = env.razorpayKeyId;
  const keySecret = env.razorpayKeySecret;

  if (!keyId || !keySecret) {
    return null;
  }

  razorpayClient = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  return razorpayClient;
}

function mapProviderStatus(providerStatus) {
  const status = String(providerStatus || "").toLowerCase();

  if (status === "paid") return "paid";
  if (status === "cancelled") return "cancelled";
  if (status === "expired") return "expired";
  if (status === "failed") return "failed";

  return "pending";
}

function buildStaticUpiLink(amount) {
  const config = getUpiConfiguration();
  const params = new URLSearchParams({
    pa: config.upiId,
    pn: config.shopName,
    am: Number(amount).toFixed(2),
    cu: config.currency,
  });

  return `upi://pay?${params.toString()}`;
}

function normalizeSession(session, sale = null) {
  return {
    sessionId: session.sessionId,
    status: session.status,
    statusMessage: session.statusMessage,
    amount: session.amount,
    currency: session.currency,
    upiId: session.upiId,
    shopName: session.shopName,
    upiLink: session.upiLink,
    paymentUrl: session.providerPaymentUrl,
    qrValue: session.providerPaymentUrl || session.upiLink,
    provider: session.provider,
    providerStatus: session.providerStatus,
    completedSaleId: session.completedSaleId,
    paidAt: session.paidAt,
    completedAt: session.completedAt,
    expiresAt: session.expiresAt,
    pollEveryMs: STATUS_POLL_INTERVAL_MS,
    autoCompleteReady: ["paid", "completed"].includes(session.status),
    sale,
  };
}

async function buildBillingPreview(payload = {}) {
  const { items, tax = 0, discount = 0, cashier = "Default Cashier" } = payload;

  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "At least one item is required to create UPI session");
  }

  const normalizedTax = parsePositiveNumber(tax, "tax");
  const normalizedDiscount = parsePositiveNumber(discount, "discount");

  const resolvedItems = [];
  let subtotal = 0;

  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ApiError(400, "Each item must have a quantity greater than zero");
    }

    const productQuery = item.productId
      ? { _id: item.productId, isActive: true }
      : { barcode: String(item.barcode || "").trim(), isActive: true };

    const product = await Product.findOne(productQuery).select("_id name barcode price stock isActive");

    if (!product) {
      throw new ApiError(404, `Product not found for item ${item.productId || item.barcode}`);
    }

    if (product.stock < quantity) {
      throw new ApiError(400, `Insufficient stock for ${product.name}`);
    }

    const lineTotal = roundCurrency(product.price * quantity);
    subtotal += lineTotal;

    resolvedItems.push({
      productId: String(product._id),
      barcode: product.barcode,
      name: product.name,
      unitPrice: product.price,
      quantity,
      lineTotal,
    });
  }

  subtotal = roundCurrency(subtotal);
  const total = roundCurrency(subtotal + normalizedTax - normalizedDiscount);

  if (total <= 0) {
    throw new ApiError(400, "Total amount must be greater than zero");
  }

  const billingPayload = {
    items: resolvedItems.map((item) => ({
      productId: item.productId,
      barcode: item.barcode,
      quantity: item.quantity,
    })),
    paymentMethod: "upi",
    tax: normalizedTax,
    discount: normalizedDiscount,
    paidAmount: total,
    cashier,
    source: "online",
  };

  return {
    billingPayload,
    summary: {
      subtotal,
      tax: normalizedTax,
      discount: normalizedDiscount,
      total,
      itemCount: resolvedItems.length,
      cashier,
      items: resolvedItems,
    },
  };
}

async function syncSessionWithProvider(session) {
  if (!session || !session.providerPaymentLinkId) {
    return session;
  }

  if (["completed", "cancelled", "expired", "failed"].includes(session.status)) {
    return session;
  }

  const client = getRazorpayClient();
  if (!client) {
    return session;
  }

  const providerLink = await client.paymentLink.fetch(session.providerPaymentLinkId);
  const mappedStatus = mapProviderStatus(providerLink.status);

  session.providerStatus = providerLink.status || session.providerStatus;
  session.lastStatusCheckedAt = new Date();

  if (mappedStatus === "paid") {
    session.status = session.status === "completed" ? "completed" : "paid";
    session.statusMessage = "Payment successful";
    if (!session.paidAt) {
      session.paidAt = providerLink.paid_at ? new Date(providerLink.paid_at * 1000) : new Date();
    }
  } else if (session.status !== "completed") {
    session.status = mappedStatus;
    if (mappedStatus === "cancelled") {
      session.statusMessage = "Payment cancelled";
    } else if (mappedStatus === "expired") {
      session.statusMessage = "Payment session expired";
    } else {
      session.statusMessage = "Waiting for payment";
    }
  }

  if (session.status === "pending" && session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
    session.status = "expired";
    session.statusMessage = "Payment session expired";
  }

  await session.save();

  return session;
}

export const createUpiPaymentSession = asyncHandler(async (req, res) => {
  const client = getRazorpayClient();
  if (!client) {
    throw new ApiError(
      503,
      "UPI auto-status gateway is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
    );
  }

  const preview = await buildBillingPreview(req.body);
  const upiConfig = getUpiConfiguration();

  const sessionId = `UPI-${Date.now()}-${Math.floor(Math.random() * 900000 + 100000)}`;

  const timeoutSec = Math.min(Math.max(env.upiSessionTimeoutSec || DEFAULT_UPI_SESSION_TIMEOUT_SEC, 60), 900);
  const expiresAt = new Date(Date.now() + timeoutSec * 1000);
  const providerExpireBy = Math.floor((Date.now() + Math.max(timeoutSec, PROVIDER_MIN_EXPIRY_SEC) * 1000) / 1000);

  const paymentLink = await client.paymentLink.create({
    amount: Math.round(preview.summary.total * 100),
    currency: upiConfig.currency,
    accept_partial: false,
    description: `CounterCraft POS bill ${sessionId}`,
    reference_id: sessionId,
    expire_by: providerExpireBy,
    reminder_enable: false,
    notify: {
      sms: false,
      email: false,
    },
    notes: {
      source: "countercraft-pos",
      sessionId,
      cashier: String(preview.summary.cashier || "Default Cashier"),
    },
  });

  const upiLink = buildStaticUpiLink(preview.summary.total);
  const providerPaymentUrl = paymentLink.short_url || upiLink;

  const session = await UpiPaymentSession.create({
    sessionId,
    provider: "razorpay",
    providerPaymentLinkId: paymentLink.id,
    providerPaymentUrl,
    providerStatus: paymentLink.status || "created",
    status: mapProviderStatus(paymentLink.status),
    amount: preview.summary.total,
    currency: upiConfig.currency,
    upiId: upiConfig.upiId,
    shopName: upiConfig.shopName,
    upiLink,
    billingPayload: preview.billingPayload,
    summary: preview.summary,
    expiresAt,
    statusMessage: "Waiting for payment",
    lastStatusCheckedAt: new Date(),
  });

  return res.status(201).json({
    success: true,
    message: "UPI payment session created",
    data: normalizeSession(session),
  });
});

export const getUpiPaymentSessionStatus = asyncHandler(async (req, res) => {
  const session = await UpiPaymentSession.findOne({ sessionId: String(req.params.sessionId || "").trim() });

  if (!session) {
    throw new ApiError(404, "UPI payment session not found");
  }

  await syncSessionWithProvider(session);

  const sale = session.completedSaleId ? await Sale.findById(session.completedSaleId) : null;

  return res.status(200).json({
    success: true,
    data: normalizeSession(session, sale),
  });
});

export const completeUpiPaymentSession = asyncHandler(async (req, res) => {
  const sessionId = String(req.params.sessionId || "").trim();
  let session = await UpiPaymentSession.findOne({ sessionId });

  if (!session) {
    throw new ApiError(404, "UPI payment session not found");
  }

  if (session.completedSaleId) {
    const sale = await Sale.findById(session.completedSaleId);
    return res.status(200).json({
      success: true,
      message: "Payment already completed",
      data: {
        session: normalizeSession(session, sale),
        sale,
      },
    });
  }

  session = await syncSessionWithProvider(session);

  if (session.status !== "paid") {
    throw new ApiError(400, "Payment is not confirmed yet. Please wait and retry.");
  }

  session.status = "completing";
  session.completionSource = req.body?.completionSource === "auto_poll" ? "auto_poll" : "manual_confirm";
  session.statusMessage = "Finalizing billing";
  await session.save();

  try {
    const sale = await processBillingPayload(session.billingPayload);

    session.status = "completed";
    session.completedSaleId = sale._id;
    session.completedAt = new Date();
    session.statusMessage = "Payment successful and billing completed";
    await session.save();

    return res.status(200).json({
      success: true,
      message: "UPI payment verified and billing completed",
      data: {
        session: normalizeSession(session, sale),
        sale,
      },
    });
  } catch (error) {
    session.status = "paid";
    session.statusMessage = "Payment captured. Billing failed, retry completion.";
    await session.save();
    throw error;
  }
});

export const handleUpiWebhook = asyncHandler(async (req, res) => {
  const webhookSecret = env.razorpayWebhookSecret;
  if (!webhookSecret) {
    return res.status(200).json({ success: true, message: "Webhook secret not configured. Event ignored." });
  }

  const signature = String(req.headers["x-razorpay-signature"] || "").trim();
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : typeof req.body === "string"
      ? req.body
      : JSON.stringify(req.body || {});

  if (!signature || !rawBody) {
    throw new ApiError(400, "Invalid webhook payload or signature");
  }

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    throw new ApiError(401, "Invalid webhook signature");
  }

  const eventPayload = JSON.parse(rawBody);
  const paymentLinkEntity = eventPayload?.payload?.payment_link?.entity;

  if (!paymentLinkEntity?.id) {
    return res.status(200).json({ success: true, message: "Event acknowledged" });
  }

  const session = await UpiPaymentSession.findOne({ providerPaymentLinkId: paymentLinkEntity.id });

  if (!session) {
    return res.status(200).json({ success: true, message: "No matching session found" });
  }

  const mappedStatus = mapProviderStatus(paymentLinkEntity.status);
  session.providerStatus = paymentLinkEntity.status || session.providerStatus;
  session.lastStatusCheckedAt = new Date();

  if (mappedStatus === "paid") {
    if (session.status !== "completed") {
      session.status = "paid";
      session.statusMessage = "Payment successful";
      if (!session.paidAt) {
        session.paidAt = new Date();
      }
    }
  } else if (session.status !== "completed") {
    session.status = mappedStatus;
    session.statusMessage =
      mappedStatus === "cancelled"
        ? "Payment cancelled"
        : mappedStatus === "expired"
          ? "Payment session expired"
          : "Waiting for payment";
  }

  await session.save();

  return res.status(200).json({ success: true, message: "Webhook processed" });
});
