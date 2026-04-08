import mongoose from "mongoose";
import Sale from "../models/Sale.js";
import { roundCurrency } from "../utils/dateRange.js";
import { ApiError, asyncHandler } from "../utils/errors.js";

const MAX_REPORT_LIMIT = 1000;
const DEFAULT_REPORT_LIMIT = 500;
const DEFAULT_RANGE_DAYS = 30;

function getRequestShopObjectId(req) {
  const shopId = String(req?.shopId || req?.auth?.shopId || "").trim();
  if (!shopId) {
    throw new ApiError(401, "Shop context is required");
  }

  if (!mongoose.Types.ObjectId.isValid(shopId)) {
    throw new ApiError(401, "Invalid shop context");
  }

  return new mongoose.Types.ObjectId(shopId);
}

function parseDateInput(value, { endOfDay = false } = {}) {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new ApiError(400, "Invalid date filter");
  }

  if (endOfDay) {
    parsedDate.setHours(23, 59, 59, 999);
  } else {
    parsedDate.setHours(0, 0, 0, 0);
  }

  return parsedDate;
}

function parseLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_REPORT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_REPORT_LIMIT);
}

function buildReportFilters(query = {}, shopId) {
  const now = new Date();
  const endDate = parseDateInput(query.endDate, { endOfDay: true }) || new Date(now);
  const startDate = parseDateInput(query.startDate) || (() => {
    const start = new Date(endDate);
    start.setDate(start.getDate() - (DEFAULT_RANGE_DAYS - 1));
    start.setHours(0, 0, 0, 0);
    return start;
  })();

  if (startDate > endDate) {
    throw new ApiError(400, "startDate cannot be after endDate");
  }

  const paymentMethod = String(query.paymentMethod || "")
    .trim()
    .toLowerCase();

  if (paymentMethod && !["cash", "upi"].includes(paymentMethod)) {
    throw new ApiError(400, "paymentMethod must be cash or upi");
  }

  const match = {
    shopId,
    createdAt: {
      $gte: startDate,
      $lte: endDate,
    },
  };

  if (paymentMethod) {
    match.paymentMethod = paymentMethod;
  }

  return {
    startDate,
    endDate,
    paymentMethod: paymentMethod || "all",
    limit: parseLimit(query.limit),
    match,
  };
}

function toReportFilterPayload(filters) {
  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    paymentMethod: filters.paymentMethod,
    limit: filters.limit,
  };
}

export const getSalesReport = asyncHandler(async (req, res) => {
  const shopId = getRequestShopObjectId(req);
  const filters = buildReportFilters(req.query, shopId);

  const [summaryRows, salesRows] = await Promise.all([
    Sale.aggregate([
      { $match: filters.match },
      {
        $addFields: {
          itemsCount: {
            $sum: "$items.quantity",
          },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$total" },
          totalTax: { $sum: "$tax" },
          totalDiscount: { $sum: "$discount" },
          totalTransactions: { $sum: 1 },
          totalItems: { $sum: "$itemsCount" },
        },
      },
    ]),
    Sale.aggregate([
      { $match: filters.match },
      {
        $addFields: {
          reportDate: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          itemsCount: {
            $sum: "$items.quantity",
          },
        },
      },
      {
        $group: {
          _id: "$reportDate",
          transactions: { $sum: 1 },
          totalRevenue: { $sum: "$total" },
          totalTax: { $sum: "$tax" },
          totalDiscount: { $sum: "$discount" },
          totalItems: { $sum: "$itemsCount" },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: filters.limit },
    ]),
  ]);

  const sales = salesRows.map((entry) => ({
    date: entry._id,
    transactions: entry.transactions,
    totalRevenue: roundCurrency(entry.totalRevenue),
    totalTax: roundCurrency(entry.totalTax),
    totalDiscount: roundCurrency(entry.totalDiscount),
    totalItems: entry.totalItems,
  }));

  const summary = summaryRows?.[0] || {
    totalRevenue: 0,
    totalTax: 0,
    totalDiscount: 0,
    totalTransactions: 0,
    totalItems: 0,
  };

  return res.status(200).json({
    success: true,
    data: {
      filters: toReportFilterPayload(filters),
      summary: {
        totalRevenue: roundCurrency(summary.totalRevenue),
        totalTax: roundCurrency(summary.totalTax),
        totalDiscount: roundCurrency(summary.totalDiscount),
        totalTransactions: summary.totalTransactions,
        totalItems: summary.totalItems,
      },
      records: sales,
    },
  });
});

export const getTransactionsReport = asyncHandler(async (req, res) => {
  const shopId = getRequestShopObjectId(req);
  const filters = buildReportFilters(req.query, shopId);

  const [summaryRows, totalMatched, transactions] = await Promise.all([
    Sale.aggregate([
      { $match: filters.match },
      {
        $addFields: {
          itemsCount: {
            $sum: "$items.quantity",
          },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$total" },
          totalTax: { $sum: "$tax" },
          totalDiscount: { $sum: "$discount" },
          totalTransactions: { $sum: 1 },
          totalItems: { $sum: "$itemsCount" },
        },
      },
    ]),
    Sale.countDocuments(filters.match),
    Sale.find(filters.match)
      .sort({ createdAt: -1 })
      .limit(filters.limit)
      .select("billNumber createdAt paymentMethod items total paidAmount changeDue cashier source")
      .lean(),
  ]);

  const records = transactions.map((transaction) => {
    const itemsCount = (transaction.items || []).reduce(
      (sum, item) => sum + Math.max(Number(item.quantity) || 0, 0),
      0
    );

    return {
      billNumber: transaction.billNumber,
      dateTime: transaction.createdAt,
      paymentMethod: transaction.paymentMethod,
      itemsCount,
      items: (transaction.items || [])
        .map((item) => `${item.name} x${item.quantity}`)
        .join(", "),
      total: roundCurrency(transaction.total),
      paidAmount: roundCurrency(transaction.paidAmount),
      changeDue: roundCurrency(transaction.changeDue),
      cashier: transaction.cashier || "Default Cashier",
      source: transaction.source || "online",
    };
  });

  const summary = summaryRows?.[0] || {
    totalRevenue: 0,
    totalTax: 0,
    totalDiscount: 0,
    totalTransactions: 0,
    totalItems: 0,
  };

  return res.status(200).json({
    success: true,
    data: {
      filters: toReportFilterPayload(filters),
      summary: {
        totalRevenue: roundCurrency(summary.totalRevenue),
        totalTax: roundCurrency(summary.totalTax),
        totalDiscount: roundCurrency(summary.totalDiscount),
        totalTransactions: summary.totalTransactions,
        totalItems: summary.totalItems,
        totalMatched,
        returnedRecords: records.length,
      },
      records,
    },
  });
});
