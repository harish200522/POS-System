import InventoryLog from "../models/InventoryLog.js";
import Product from "../models/Product.js";
import { ApiError, asyncHandler } from "../utils/errors.js";

function getRequestShopId(req) {
  const shopId = String(req?.shopId || req?.auth?.shopId || "").trim();
  if (!shopId) {
    throw new ApiError(401, "Shop context is required");
  }

  return shopId;
}

function parseNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function normalizeBarcodeValue(value) {
  return String(value ?? "").trim();
}

function normalizeBarcodeLookup(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getBarcodeLookupCandidates(value) {
  const normalized = normalizeBarcodeLookup(value);
  if (!normalized) {
    return [];
  }

  const candidates = new Set([normalized]);
  const isNumeric = /^\d+$/.test(normalized);

  if (isNumeric && normalized.length === 12) {
    candidates.add(`0${normalized}`);
  }

  if (isNumeric && normalized.length === 13 && normalized.startsWith("0")) {
    candidates.add(normalized.slice(1));
  }

  return Array.from(candidates);
}

function buildLooseBarcodeRegex(normalizedBarcode) {
  const escapedChars = String(normalizedBarcode)
    .split("")
    .map((char) => escapeRegex(char));

  return new RegExp(
    `^[^a-zA-Z0-9]*${escapedChars.join("[^a-zA-Z0-9]*")}[^a-zA-Z0-9]*$`,
    "i"
  );
}

export const addProduct = asyncHandler(async (req, res) => {
  const shopId = getRequestShopId(req);
  const { name, price, stock, barcode, category } = req.body;
  const normalizedBarcode = normalizeBarcodeValue(barcode);

  if (!name || !normalizedBarcode) {
    throw new ApiError(400, "name and barcode are required");
  }

  const normalizedPrice = parseNumber(price, NaN);
  const normalizedStock = parseNumber(stock, NaN);

  if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
    throw new ApiError(400, "price must be a valid non-negative number");
  }

  if (!Number.isFinite(normalizedStock) || normalizedStock < 0) {
    throw new ApiError(400, "stock must be a valid non-negative number");
  }

  const existingProduct = await Product.findOne({ shopId, barcode: normalizedBarcode });
  if (existingProduct && existingProduct.isActive) {
    throw new ApiError(409, "A product with this barcode already exists");
  }

  if (existingProduct && !existingProduct.isActive) {
    existingProduct.name = name;
    existingProduct.price = normalizedPrice;
    existingProduct.stock = normalizedStock;
    existingProduct.barcode = normalizedBarcode;
    existingProduct.category = category || existingProduct.category;
    existingProduct.isActive = true;
    await existingProduct.save();

    return res.status(200).json({
      success: true,
      message: "Product restored and updated successfully",
      data: existingProduct,
    });
  }

  const product = await Product.create({
    shopId,
    name,
    price: normalizedPrice,
    stock: normalizedStock,
    barcode: normalizedBarcode,
    category,
  });

  return res.status(201).json({
    success: true,
    message: "Product added successfully",
    data: product,
  });
});

export const getProducts = asyncHandler(async (req, res) => {
  const shopId = getRequestShopId(req);
  const {
    search = "",
    barcode,
    lowStock,
    threshold = 5,
    includeInactive = "false",
    page = 1,
    limit = 100,
  } = req.query;

  const query = { shopId };

  if (includeInactive !== "true") {
    query.isActive = true;
  }

  if (barcode) {
    query.barcode = normalizeBarcodeValue(barcode);
  }

  if (search) {
    const searchRegex = new RegExp(escapeRegex(String(search).trim()), "i");
    query.$or = [{ name: searchRegex }, { barcode: searchRegex }];
  }

  if (String(lowStock) === "true") {
    query.stock = { $lte: parseNumber(threshold, 5) };
  }

  const normalizedLimit = Math.min(parseNumber(limit, 100), 500);
  const normalizedPage = Math.max(parseNumber(page, 1), 1);
  const skip = (normalizedPage - 1) * normalizedLimit;

  const [products, total] = await Promise.all([
    Product.find(query).sort({ updatedAt: -1 }).skip(skip).limit(normalizedLimit),
    Product.countDocuments(query),
  ]);

  return res.status(200).json({
    success: true,
    data: products,
    meta: {
      total,
      page: normalizedPage,
      limit: normalizedLimit,
      pages: Math.ceil(total / normalizedLimit) || 1,
    },
  });
});

export const getProductByBarcode = asyncHandler(async (req, res) => {
  const shopId = getRequestShopId(req);
  const barcode = normalizeBarcodeValue(req.params.barcode);
  if (!barcode) {
    throw new ApiError(400, "barcode parameter is required");
  }

  const normalizedCandidates = getBarcodeLookupCandidates(barcode);
  const exactCandidates = Array.from(new Set([barcode, ...normalizedCandidates]));

  let product = await Product.findOne({
    shopId,
    barcode: { $in: exactCandidates },
    isActive: true,
  });

  if (!product) {
    for (const candidate of normalizedCandidates) {
      if (candidate.length < 4) {
        continue;
      }

      const looseBarcodeRegex = buildLooseBarcodeRegex(candidate);
      product = await Product.findOne({
        shopId,
        barcode: looseBarcodeRegex,
        isActive: true,
      });

      if (product) {
        break;
      }
    }
  }

  if (!product) {
    throw new ApiError(404, "Product not found for this barcode");
  }

  return res.status(200).json({
    success: true,
    data: product,
  });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const shopId = getRequestShopId(req);
  const { id } = req.params;
  const { name, price, stock, barcode, category, isActive } = req.body;

  const product = await Product.findOne({ _id: id, shopId });

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  let normalizedBarcode = null;
  if (barcode !== undefined) {
    normalizedBarcode = normalizeBarcodeValue(barcode);
    if (!normalizedBarcode) {
      throw new ApiError(400, "barcode cannot be empty");
    }

    if (normalizedBarcode !== product.barcode) {
      const exists = await Product.findOne({ shopId, barcode: normalizedBarcode, _id: { $ne: id } });
      if (exists) {
        throw new ApiError(409, "Another product already uses this barcode");
      }
    }
  }

  if (name !== undefined) product.name = name;
  if (price !== undefined) {
    const normalizedPrice = parseNumber(price, NaN);
    if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
      throw new ApiError(400, "price must be a valid non-negative number");
    }
    product.price = normalizedPrice;
  }

  if (stock !== undefined) {
    const normalizedStock = parseNumber(stock, NaN);
    if (!Number.isFinite(normalizedStock) || normalizedStock < 0) {
      throw new ApiError(400, "stock must be a valid non-negative number");
    }
    product.stock = normalizedStock;
  }

  if (normalizedBarcode !== null) product.barcode = normalizedBarcode;
  if (category !== undefined) product.category = category;
  if (isActive !== undefined) product.isActive = Boolean(isActive);

  await product.save();

  return res.status(200).json({
    success: true,
    message: "Product updated successfully",
    data: product,
  });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const shopId = getRequestShopId(req);
  const { id } = req.params;

  const product = await Product.findOne({ _id: id, shopId });

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  product.isActive = false;
  await product.save();

  return res.status(200).json({
    success: true,
    message: "Product deactivated successfully",
  });
});

export const updateStock = asyncHandler(async (req, res) => {
  const shopId = getRequestShopId(req);
  const { id } = req.params;
  const { quantity, mode = "add", referenceType = "manual", note = "" } = req.body;

  const product = await Product.findOne({ _id: id, shopId });

  if (!product || !product.isActive) {
    throw new ApiError(404, "Active product not found");
  }

  const normalizedQty = parseNumber(quantity, NaN);
  if (!Number.isFinite(normalizedQty) || normalizedQty < 0) {
    throw new ApiError(400, "quantity must be a valid non-negative number");
  }

  const previousStock = product.stock;
  let newStock = previousStock;

  if (mode === "add") {
    newStock = previousStock + normalizedQty;
  } else if (mode === "deduct") {
    if (normalizedQty > previousStock) {
      throw new ApiError(400, "Cannot deduct beyond available stock");
    }
    newStock = previousStock - normalizedQty;
  } else if (mode === "set") {
    newStock = normalizedQty;
  } else {
    throw new ApiError(400, "mode must be one of add, deduct, or set");
  }

  product.stock = newStock;
  await product.save();

  await InventoryLog.create({
    shopId,
    productId: product._id,
    type: mode,
    quantity: mode === "set" ? Math.abs(newStock - previousStock) : normalizedQty,
    previousStock,
    newStock,
    referenceType,
    note,
  });

  return res.status(200).json({
    success: true,
    message: "Stock updated successfully",
    data: product,
  });
});
