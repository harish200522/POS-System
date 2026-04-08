import crypto from "crypto";
import mongoose from "mongoose";
import InventoryLog from "../models/InventoryLog.js";
import InvoiceShare from "../models/InvoiceShare.js";
import Product from "../models/Product.js";
import Sale from "../models/Sale.js";
import Shop from "../models/Shop.js";
import { env } from "../config/env.js";
import { getDateRange, roundCurrency } from "../utils/dateRange.js";
import { ApiError, asyncHandler } from "../utils/errors.js";

export const PAYMENT_METHODS = ["cash", "upi"];
const INVOICE_SHARE_ID_REGEX = /^[A-Za-z0-9_-]{24,128}$/;
const INVOICE_SHARE_ID_BYTES = 24;
const INVOICE_SHARE_GENERATION_ATTEMPTS = 10;

function generateOpaqueInvoiceShareId() {
  return crypto.randomBytes(INVOICE_SHARE_ID_BYTES).toString("base64url");
}

function isDuplicateKeyError(error) {
  return Number(error?.code) === 11000;
}

function isInvoiceShareExpired(invoiceShare) {
  const expiresAtValue = invoiceShare?.expiresAt;
  if (!expiresAtValue) {
    return false;
  }

  const expiresAtDate = new Date(expiresAtValue);
  if (Number.isNaN(expiresAtDate.getTime())) {
    return false;
  }

  return expiresAtDate.getTime() <= Date.now();
}

function resolveInvoiceShareExpiryDate() {
  const ttlSeconds = Number(env.invoiceShareLinkTtlSec);
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return null;
  }

  return new Date(Date.now() + ttlSeconds * 1000);
}

function buildPublicInvoicePath(shareId) {
  return `/public/invoice/${encodeURIComponent(String(shareId || "").trim())}`;
}

async function createInvoiceShareRecord({ shopId, invoiceId, createdByUserId = null, expiresAt = null }) {
  for (let attempt = 0; attempt < INVOICE_SHARE_GENERATION_ATTEMPTS; attempt += 1) {
    const shareId = generateOpaqueInvoiceShareId();
    if (!INVOICE_SHARE_ID_REGEX.test(shareId)) {
      continue;
    }

    try {
      const createdRecord = await InvoiceShare.create({
        shopId,
        invoiceId,
        shareId,
        expiresAt,
        createdByUserId,
      });

      return createdRecord;
    } catch (error) {
      if (isDuplicateKeyError(error) && error?.keyPattern?.shareId) {
        continue;
      }

      if (isDuplicateKeyError(error) && error?.keyPattern?.shopId && error?.keyPattern?.invoiceId) {
        const existingRecord = await InvoiceShare.findOne({ shopId, invoiceId });
        if (existingRecord) {
          return existingRecord;
        }
      }

      throw error;
    }
  }

  throw new ApiError(500, "Unable to generate invoice share link. Please try again.");
}

async function rotateInvoiceShareRecord(invoiceShareRecord, { createdByUserId = null, expiresAt = null } = {}) {
  for (let attempt = 0; attempt < INVOICE_SHARE_GENERATION_ATTEMPTS; attempt += 1) {
    const shareId = generateOpaqueInvoiceShareId();
    if (!INVOICE_SHARE_ID_REGEX.test(shareId)) {
      continue;
    }

    invoiceShareRecord.shareId = shareId;
    invoiceShareRecord.expiresAt = expiresAt;

    if (createdByUserId && mongoose.Types.ObjectId.isValid(String(createdByUserId))) {
      invoiceShareRecord.createdByUserId = createdByUserId;
    }

    try {
      return await invoiceShareRecord.save();
    } catch (error) {
      if (isDuplicateKeyError(error) && error?.keyPattern?.shareId) {
        continue;
      }

      throw error;
    }
  }

  throw new ApiError(500, "Unable to rotate expired invoice share link. Please try again.");
}

function mapInvoiceShareResponse(invoiceShareRecord, invoiceId) {
  return {
    invoiceId: String(invoiceId || "").trim(),
    shareId: String(invoiceShareRecord?.shareId || "").trim(),
    expiresAt: invoiceShareRecord?.expiresAt
      ? new Date(invoiceShareRecord.expiresAt).toISOString()
      : null,
    publicPath: buildPublicInvoicePath(invoiceShareRecord?.shareId),
  };
}

function mapSaleToPublicInvoiceRecord(sale, shop = null) {
  return {
    invoiceId: String(sale?._id || ""),
    billNumber: String(sale?.billNumber || ""),
    createdAt: sale?.createdAt ? new Date(sale.createdAt).toISOString() : new Date().toISOString(),
    shop: {
      name: String(shop?.name || ""),
      phone: String(shop?.phone || ""),
      email: String(shop?.email || ""),
    },
    items: Array.isArray(sale?.items)
      ? sale.items.map((item) => ({
          name: String(item?.name || "Item"),
          barcode: String(item?.barcode || ""),
          quantity: Number(item?.quantity) || 0,
          unitPrice: Number(item?.unitPrice) || 0,
          lineTotal: Number(item?.lineTotal) || 0,
        }))
      : [],
    subtotal: Number(sale?.subtotal) || 0,
    tax: Number(sale?.tax) || 0,
    discount: Number(sale?.discount) || 0,
    total: Number(sale?.total) || 0,
    paymentMethod: String(sale?.paymentMethod || "cash").toLowerCase(),
    paidAmount: Number(sale?.paidAmount) || 0,
    changeDue: Number(sale?.changeDue) || 0,
    cashier: String(sale?.cashier || "Default Cashier"),
    source: String(sale?.source || "online"),
    isOffline: String(sale?.source || "online") === "offline_sync",
  };
}

function parsePositiveNumber(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return null;
  }
  return numberValue;
}

function getRequestShopId(req) {
  const shopId = String(req?.shopId || req?.auth?.shopId || "").trim();
  if (!shopId) {
    throw new ApiError(401, "Shop context is required");
  }

  return shopId;
}

function toShopObjectId(shopId) {
  if (!mongoose.Types.ObjectId.isValid(shopId)) {
    throw new ApiError(401, "Invalid shop context");
  }

  return new mongoose.Types.ObjectId(shopId);
}

function isTransactionUnsupportedError(error) {
  const errorCode = Number(error?.code);
  const message = String(error?.message || "");

  if ([20, 115, 251].includes(errorCode)) {
    return true;
  }

  return /transaction numbers are only allowed|transactions are not supported|replica set member or mongos/i.test(
    message
  );
}

function buildRollbackStockOperations(shopId, stockAdjustments = []) {
  if (!Array.isArray(stockAdjustments) || !stockAdjustments.length) {
    return [];
  }

  const quantityByProduct = new Map();

  stockAdjustments.forEach((entry) => {
    const productId = String(entry?.productId || "").trim();
    const quantity = Number(entry?.quantity);

    if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    quantityByProduct.set(productId, (quantityByProduct.get(productId) || 0) + quantity);
  });

  return Array.from(quantityByProduct.entries()).map(([productId, quantity]) => ({
    updateOne: {
      filter: { _id: productId, shopId },
      update: { $inc: { stock: quantity } },
    },
  }));
}

async function rollbackNonTransactionalBilling({ shopId, saleId = null, stockAdjustments = [] }) {
  const rollbackTasks = [];

  if (saleId) {
    rollbackTasks.push(
      InventoryLog.deleteMany({ shopId, saleId }),
      Sale.deleteOne({ _id: saleId, shopId })
    );
  }

  const stockRollbackOperations = buildRollbackStockOperations(shopId, stockAdjustments);
  if (stockRollbackOperations.length) {
    rollbackTasks.push(Product.bulkWrite(stockRollbackOperations, { ordered: false }));
  }

  if (!rollbackTasks.length) {
    return;
  }

  const rollbackResults = await Promise.allSettled(rollbackTasks);
  const rollbackErrors = rollbackResults
    .filter((result) => result.status === "rejected")
    .map((result) => String(result.reason?.message || result.reason || "Unknown rollback error"));

  if (rollbackErrors.length) {
    throw new ApiError(500, `Billing rollback failed: ${rollbackErrors.join("; ")}`);
  }
}

async function generateBillNumber(shopId, session = null) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const billNumber = `BILL-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    // Ensure bill numbers remain unique even under concurrent requests.
    const existsQuery = Sale.exists({ shopId, billNumber });
    const existing = session ? await existsQuery.session(session) : await existsQuery;
    if (!existing) {
      return billNumber;
    }
  }

  throw new ApiError(500, "Could not generate unique bill number");
}

async function performBillingOperation({
  shopId,
  items,
  normalizedPaymentMethod,
  normalizedTax,
  normalizedDiscount,
  paidAmount,
  cashier,
  source,
  session = null,
}) {
  const saleItems = [];
  const inventoryLogs = [];
  const nonTransactionalStockAdjustments = [];
  let subtotal = 0;
  let createdSaleId = null;

  try {
    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new ApiError(400, "Each item must have a quantity greater than zero");
      }

      const productQuery = item.productId
        ? { _id: item.productId, shopId, isActive: true }
        : { shopId, barcode: String(item.barcode || "").trim(), isActive: true };

      const productLookup = Product.findOne(productQuery);
      const product = session ? await productLookup.session(session) : await productLookup;

      if (!product) {
        throw new ApiError(404, `Product not found for item ${item.productId || item.barcode}`);
      }

      if (product.stock < quantity) {
        throw new ApiError(400, `Insufficient stock for ${product.name}`);
      }

      const lineTotal = roundCurrency(product.price * quantity);
      subtotal += lineTotal;

      const previousStock = product.stock;
      product.stock = product.stock - quantity;
      if (session) {
        await product.save({ session });
      } else {
        await product.save();
        nonTransactionalStockAdjustments.push({
          productId: product._id,
          quantity,
        });
      }

      saleItems.push({
        productId: product._id,
        name: product.name,
        barcode: product.barcode,
        unitPrice: product.price,
        quantity,
        lineTotal,
      });

      inventoryLogs.push({
        shopId,
        productId: product._id,
        type: "sale",
        quantity,
        previousStock,
        newStock: product.stock,
        referenceType: "sale",
        note: "Sold via POS billing",
      });
    }

    subtotal = roundCurrency(subtotal);
    const total = roundCurrency(subtotal + normalizedTax - normalizedDiscount);

    if (total < 0) {
      throw new ApiError(400, "Total cannot be negative");
    }

    let normalizedPaidAmount = parsePositiveNumber(paidAmount);
    if (normalizedPaidAmount === null) {
      normalizedPaidAmount = total;
    }

    if (normalizedPaymentMethod === "cash" && normalizedPaidAmount < total) {
      throw new ApiError(400, "Paid amount cannot be less than total for cash payment");
    }

    const changeDue =
      normalizedPaymentMethod === "cash" ? roundCurrency(Math.max(normalizedPaidAmount - total, 0)) : 0;

    const billNumber = await generateBillNumber(shopId, session);
    const salePayload = {
      shopId,
      billNumber,
      items: saleItems,
      subtotal,
      tax: normalizedTax,
      discount: normalizedDiscount,
      total,
      paymentMethod: normalizedPaymentMethod,
      paidAmount: normalizedPaidAmount,
      changeDue,
      cashier,
      source: source === "offline_sync" ? "offline_sync" : "online",
    };

    let sale;
    if (session) {
      [sale] = await Sale.create([salePayload], { session });
      await InventoryLog.insertMany(
        inventoryLogs.map((entry) => ({
          ...entry,
          saleId: sale._id,
        })),
        { session }
      );
    } else {
      sale = await Sale.create(salePayload);
      createdSaleId = sale._id;
      await InventoryLog.insertMany(
        inventoryLogs.map((entry) => ({
          ...entry,
          saleId: sale._id,
        }))
      );
    }

    return sale;
  } catch (error) {
    if (!session) {
      await rollbackNonTransactionalBilling({
        shopId,
        saleId: createdSaleId,
        stockAdjustments: nonTransactionalStockAdjustments,
      });
    }

    throw error;
  }
}

export async function processBillingPayload(payload = {}) {
  const {
    shopId,
    items,
    paymentMethod = "cash",
    paidAmount,
    tax = 0,
    discount = 0,
    cashier = "Default Cashier",
    source = "online",
  } = payload;

  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "At least one item is required to process billing");
  }

  const normalizedShopId = String(shopId || "").trim();
  if (!normalizedShopId) {
    throw new ApiError(400, "shopId is required to process billing");
  }

  const normalizedPaymentMethod = String(paymentMethod || "").toLowerCase();
  if (!PAYMENT_METHODS.includes(normalizedPaymentMethod)) {
    throw new ApiError(400, "paymentMethod must be cash or upi");
  }

  const normalizedTax = parsePositiveNumber(tax);
  const normalizedDiscount = parsePositiveNumber(discount);

  if (normalizedTax === null || normalizedDiscount === null) {
    throw new ApiError(400, "tax and discount must be valid non-negative numbers");
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const sale = await performBillingOperation({
      shopId: normalizedShopId,
      items,
      normalizedPaymentMethod,
      normalizedTax,
      normalizedDiscount,
      paidAmount,
      cashier,
      source,
      session,
    });

    await session.commitTransaction();
    return sale;
  } catch (error) {
    await session.abortTransaction().catch(() => {});

    if (isTransactionUnsupportedError(error)) {
      const sale = await performBillingOperation({
        shopId: normalizedShopId,
        items,
        normalizedPaymentMethod,
        normalizedTax,
        normalizedDiscount,
        paidAmount,
        cashier,
        source,
        session: null,
      });

      return sale;
    }

    throw error;
  } finally {
    session.endSession();
  }
}

export const processBilling = asyncHandler(async (req, res) => {
  const sale = await processBillingPayload({
    ...req.body,
    shopId: getRequestShopId(req),
  });

  return res.status(201).json({
    success: true,
    message: "Billing processed successfully",
    data: sale,
  });
});

export const createInvoiceShareLink = asyncHandler(async (req, res) => {
  const shopId = getRequestShopId(req);
  const invoiceId = String(req.params.invoiceId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
    throw new ApiError(400, "Invalid invoiceId");
  }

  const sale = await Sale.findOne({ _id: invoiceId, shopId }).select("_id shopId");
  if (!sale) {
    throw new ApiError(404, "Invoice not found");
  }

  const createdByUserId = req?.auth?.userId || null;
  const expiresAt = resolveInvoiceShareExpiryDate();
  let invoiceShareRecord = await InvoiceShare.findOne({
    shopId,
    invoiceId: sale._id,
  });

  if (invoiceShareRecord) {
    if (isInvoiceShareExpired(invoiceShareRecord)) {
      invoiceShareRecord = await rotateInvoiceShareRecord(invoiceShareRecord, {
        createdByUserId,
        expiresAt,
      });
    }
  } else {
    invoiceShareRecord = await createInvoiceShareRecord({
      shopId,
      invoiceId: sale._id,
      createdByUserId,
      expiresAt,
    });
  }

  return res.status(200).json({
    success: true,
    data: mapInvoiceShareResponse(invoiceShareRecord, sale._id),
  });
});

export const getPublicInvoiceByShareId = asyncHandler(async (req, res) => {
  const shareId = String(req.params.shareId || "").trim();
  if (!INVOICE_SHARE_ID_REGEX.test(shareId)) {
    throw new ApiError(400, "Invalid shareId");
  }

  const invoiceShareRecord = await InvoiceShare.findOne({ shareId }).select("invoiceId shopId expiresAt");
  if (!invoiceShareRecord) {
    throw new ApiError(404, "Invoice link not found");
  }

  if (isInvoiceShareExpired(invoiceShareRecord)) {
    await InvoiceShare.deleteOne({ _id: invoiceShareRecord._id }).catch(() => {});
    throw new ApiError(410, "Invoice link expired. Request a new share link.");
  }

  const [sale, shop] = await Promise.all([
    Sale.findOne({
      _id: invoiceShareRecord.invoiceId,
      shopId: invoiceShareRecord.shopId,
    }),
    Shop.findOne({ _id: invoiceShareRecord.shopId }).select("name phone email"),
  ]);

  if (!sale) {
    throw new ApiError(404, "Invoice not found");
  }

  return res.status(200).json({
    success: true,
    data: mapSaleToPublicInvoiceRecord(sale, shop),
  });
});

export const getSalesHistory = asyncHandler(async (req, res) => {
  const shopId = getRequestShopId(req);
  const { from, to, paymentMethod, page = 1, limit = 50 } = req.query;

  const query = { shopId };

  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) {
      const endDate = new Date(to);
      endDate.setHours(23, 59, 59, 999);
      query.createdAt.$lte = endDate;
    }
  }

  if (paymentMethod && PAYMENT_METHODS.includes(String(paymentMethod).toLowerCase())) {
    query.paymentMethod = String(paymentMethod).toLowerCase();
  }

  const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const skip = (normalizedPage - 1) * normalizedLimit;

  const [sales, total] = await Promise.all([
    Sale.find(query).sort({ createdAt: -1 }).skip(skip).limit(normalizedLimit),
    Sale.countDocuments(query),
  ]);

  return res.status(200).json({
    success: true,
    data: sales,
    meta: {
      total,
      page: normalizedPage,
      limit: normalizedLimit,
      pages: Math.ceil(total / normalizedLimit) || 1,
    },
  });
});

export const getSalesSummary = asyncHandler(async (req, res) => {
  const shopId = getRequestShopId(req);
  const shopObjectId = toShopObjectId(shopId);
  const { range = "daily", startDate, endDate, lowStockThreshold = 5 } = req.query;
  const { start, end } = getDateRange({ range, startDate, endDate });

  const [summaryFacet] = await Sale.aggregate([
    {
      $match: {
        shopId: shopObjectId,
        createdAt: {
          $gte: start,
          $lte: end,
        },
      },
    },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$total" },
              totalSubtotal: { $sum: "$subtotal" },
              totalTax: { $sum: "$tax" },
              totalDiscount: { $sum: "$discount" },
              totalTransactions: { $sum: 1 },
            },
          },
        ],
        paymentBreakdown: [
          {
            $group: {
              _id: "$paymentMethod",
              amount: { $sum: "$total" },
              count: { $sum: 1 },
            },
          },
          { $sort: { amount: -1 } },
        ],
        trend: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$createdAt",
                },
              },
              revenue: { $sum: "$total" },
              transactions: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        topProducts: [
          { $unwind: "$items" },
          {
            $group: {
              _id: {
                name: "$items.name",
                barcode: "$items.barcode",
              },
              quantitySold: { $sum: "$items.quantity" },
              revenue: { $sum: "$items.lineTotal" },
            },
          },
          { $sort: { quantitySold: -1 } },
          { $limit: 5 },
        ],
      },
    },
  ]);

  const lowStockCount = await Product.countDocuments({
    shopId,
    isActive: true,
    stock: { $lte: Number(lowStockThreshold) || 5 },
  });

  return res.status(200).json({
    success: true,
    data: {
      range,
      start,
      end,
      overview: summaryFacet?.overview?.[0] || {
        totalRevenue: 0,
        totalSubtotal: 0,
        totalTax: 0,
        totalDiscount: 0,
        totalTransactions: 0,
      },
      paymentBreakdown: summaryFacet?.paymentBreakdown || [],
      trend: summaryFacet?.trend || [],
      topProducts: summaryFacet?.topProducts || [],
      lowStockCount,
    },
  });
});
