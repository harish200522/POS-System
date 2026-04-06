import mongoose from "mongoose";
import InventoryLog from "../models/InventoryLog.js";
import Product from "../models/Product.js";
import Sale from "../models/Sale.js";
import { getDateRange, roundCurrency } from "../utils/dateRange.js";
import { ApiError, asyncHandler } from "../utils/errors.js";

export const PAYMENT_METHODS = ["cash", "upi", "card"];

function parsePositiveNumber(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return null;
  }
  return numberValue;
}

function isTransactionUnsupportedError(error) {
  const message = String(error?.message || "");
  return /Transaction numbers are only allowed on a replica set member or mongos/i.test(message);
}

async function generateBillNumber(session = null) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const billNumber = `BILL-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    // Ensure bill numbers remain unique even under concurrent requests.
    const existsQuery = Sale.exists({ billNumber });
    const existing = session ? await existsQuery.session(session) : await existsQuery;
    if (!existing) {
      return billNumber;
    }
  }

  throw new ApiError(500, "Could not generate unique bill number");
}

async function performBillingOperation({
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
  let subtotal = 0;

  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ApiError(400, "Each item must have a quantity greater than zero");
    }

    const productQuery = item.productId
      ? { _id: item.productId, isActive: true }
      : { barcode: String(item.barcode || "").trim(), isActive: true };

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
      productId: product._id,
      type: "sale",
      quantity,
      previousStock,
      newStock: product.stock,
      referenceType: "sale",
      note: `Sold via POS billing`,
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

  const billNumber = await generateBillNumber(session);
  const salePayload = {
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
    await InventoryLog.insertMany(
      inventoryLogs.map((entry) => ({
        ...entry,
        saleId: sale._id,
      }))
    );
  }

  return sale;
}

export async function processBillingPayload(payload = {}) {
  const {
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

  const normalizedPaymentMethod = String(paymentMethod || "").toLowerCase();
  if (!PAYMENT_METHODS.includes(normalizedPaymentMethod)) {
    throw new ApiError(400, "paymentMethod must be cash, upi, or card");
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
  const sale = await processBillingPayload(req.body);

  return res.status(201).json({
    success: true,
    message: "Billing processed successfully",
    data: sale,
  });
});

export const getSalesHistory = asyncHandler(async (req, res) => {
  const { from, to, paymentMethod, page = 1, limit = 50 } = req.query;

  const query = {};

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
  const { range = "daily", startDate, endDate, lowStockThreshold = 5 } = req.query;
  const { start, end } = getDateRange({ range, startDate, endDate });

  const [summaryFacet] = await Sale.aggregate([
    {
      $match: {
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
