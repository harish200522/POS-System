import InventoryLog from "../models/InventoryLog.js";
import Product from "../models/Product.js";
import { asyncHandler } from "../utils/errors.js";

export const getInventoryLogs = asyncHandler(async (req, res) => {
  const { productId, type, page = 1, limit = 50 } = req.query;

  const query = {};

  if (productId) {
    query.productId = productId;
  }

  if (type) {
    query.type = type;
  }

  const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 300);
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const skip = (normalizedPage - 1) * normalizedLimit;

  const [logs, total] = await Promise.all([
    InventoryLog.find(query)
      .populate("productId", "name barcode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(normalizedLimit),
    InventoryLog.countDocuments(query),
  ]);

  return res.status(200).json({
    success: true,
    data: logs,
    meta: {
      total,
      page: normalizedPage,
      limit: normalizedLimit,
      pages: Math.ceil(total / normalizedLimit) || 1,
    },
  });
});

export const getLowStockProducts = asyncHandler(async (req, res) => {
  const threshold = Math.max(Number(req.query.threshold) || 5, 0);

  const lowStockProducts = await Product.find({
    isActive: true,
    stock: { $lte: threshold },
  })
    .sort({ stock: 1, updatedAt: -1 })
    .limit(100);

  return res.status(200).json({
    success: true,
    data: lowStockProducts,
    meta: {
      threshold,
      count: lowStockProducts.length,
    },
  });
});

export const getInventoryOverview = asyncHandler(async (req, res) => {
  const threshold = Math.max(Number(req.query.threshold) || 5, 0);

  const [aggregate] = await Product.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        totalUnits: { $sum: "$stock" },
        inventoryValue: {
          $sum: { $multiply: ["$price", "$stock"] },
        },
        outOfStockCount: {
          $sum: {
            $cond: [{ $lte: ["$stock", 0] }, 1, 0],
          },
        },
      },
    },
  ]);

  const lowStockProducts = await Product.find({
    isActive: true,
    stock: { $lte: threshold },
  })
    .sort({ stock: 1, updatedAt: -1 })
    .limit(10)
    .select("name barcode stock price updatedAt");

  return res.status(200).json({
    success: true,
    data: {
      totalProducts: aggregate?.totalProducts || 0,
      totalUnits: aggregate?.totalUnits || 0,
      inventoryValue: Number((aggregate?.inventoryValue || 0).toFixed(2)),
      outOfStockCount: aggregate?.outOfStockCount || 0,
      lowStockThreshold: threshold,
      lowStockProducts,
    },
  });
});
