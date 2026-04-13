import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import Sale from "../models/Sale.js";
import Product from "../models/Product.js";
import { getDateRange, roundCurrency } from "../utils/dateRange.js";
import { ApiError, asyncHandler } from "../utils/errors.js";
import { PAYMENT_METHODS } from "./billingController.js";

// ── Helpers ──────────────────────────────────────────────

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

// ── Build match for the Reports page (range=daily|weekly|monthly) ──

function buildReportsMatch(query, shopObjectId) {
  const range = query.range || "daily";
  const { start, end } = getDateRange({
    range,
    startDate: query.startDate,
    endDate: query.endDate,
  });

  const match = {
    shopId: shopObjectId,
    createdAt: { $gte: start, $lte: end },
  };

  return { match, start, end, range };
}

// ── Build match for the Sales page (from/to dates + paymentMethod) ──

function buildSalesMatch(query, shopId) {
  const match = { shopId };

  if (query.from || query.to) {
    match.createdAt = {};
    if (query.from) match.createdAt.$gte = new Date(query.from);
    if (query.to) {
      const endDate = new Date(query.to);
      endDate.setHours(23, 59, 59, 999);
      match.createdAt.$lte = endDate;
    }
  }

  if (
    query.paymentMethod &&
    PAYMENT_METHODS.includes(String(query.paymentMethod).toLowerCase())
  ) {
    match.paymentMethod = String(query.paymentMethod).toLowerCase();
  }

  return match;
}

// ── Fetch sales from DB ─────────────────────────────────

async function fetchSales(match, limit = 1000) {
  return Sale.find(match)
    .sort({ createdAt: -1 })
    .limit(limit)
    .select(
      "billNumber createdAt paymentMethod items total paidAmount changeDue cashier source subtotal tax discount"
    )
    .lean();
}

// ── CSV helpers ─────────────────────────────────────────

function escapeCsvField(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function salesToCsvRows(sales) {
  const header = [
    "Bill Number",
    "Date",
    "Payment Method",
    "Items Count",
    "Items",
    "Subtotal",
    "Tax",
    "Discount",
    "Total",
    "Paid Amount",
    "Change Due",
    "Cashier",
    "Source",
  ];

  const rows = sales.map((sale) => {
    const itemsCount = (sale.items || []).reduce(
      (sum, item) => sum + (Number(item.quantity) || 0),
      0
    );
    const itemsList = (sale.items || [])
      .map((item) => `${item.name} x${item.quantity}`)
      .join("; ");

    return [
      sale.billNumber,
      sale.createdAt ? new Date(sale.createdAt).toISOString() : "",
      sale.paymentMethod,
      itemsCount,
      itemsList,
      roundCurrency(sale.subtotal || 0),
      roundCurrency(sale.tax || 0),
      roundCurrency(sale.discount || 0),
      roundCurrency(sale.total || 0),
      roundCurrency(sale.paidAmount || 0),
      roundCurrency(sale.changeDue || 0),
      sale.cashier || "Default Cashier",
      sale.source || "online",
    ];
  });

  const csvLines = [header, ...rows].map((row) =>
    row.map(escapeCsvField).join(",")
  );
  return csvLines.join("\n");
}

// ── PDF helpers ─────────────────────────────────────────

function buildPdfDocument(sales, { title = "Sales Report", range = "" } = {}) {
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });

  // Title
  doc.fontSize(18).font("Helvetica-Bold").text(title, { align: "center" });
  doc.moveDown(0.3);
  if (range) {
    doc
      .fontSize(10)
      .font("Helvetica")
      .text(`Period: ${range}`, { align: "center" });
  }
  doc
    .fontSize(10)
    .font("Helvetica")
    .text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });
  doc.moveDown(1);

  // Summary
  const totalRevenue = sales.reduce((s, sale) => s + (sale.total || 0), 0);
  const totalTransactions = sales.length;
  doc.fontSize(11).font("Helvetica-Bold").text("Summary", { underline: true });
  doc.moveDown(0.3);
  doc
    .fontSize(10)
    .font("Helvetica")
    .text(`Total Transactions: ${totalTransactions}`);
  doc.text(`Total Revenue: ₹${roundCurrency(totalRevenue).toLocaleString()}`);
  doc.moveDown(1);

  // Table
  if (sales.length === 0) {
    doc.fontSize(11).text("No transactions found for this period.");
    return doc;
  }

  const columns = [
    { header: "Bill No.", width: 130, key: "billNumber" },
    { header: "Date", width: 130, key: "date" },
    { header: "Payment", width: 65, key: "paymentMethod" },
    { header: "Items", width: 40, key: "itemsCount" },
    { header: "Total", width: 70, key: "total" },
    { header: "Paid", width: 70, key: "paidAmount" },
    { header: "Change", width: 60, key: "changeDue" },
    { header: "Cashier", width: 100, key: "cashier" },
  ];

  const tableTop = doc.y;
  const tableLeft = doc.page.margins.left;
  const rowHeight = 20;

  // Header row
  doc.fontSize(9).font("Helvetica-Bold");
  let x = tableLeft;
  columns.forEach((col) => {
    doc.text(col.header, x, tableTop, {
      width: col.width,
      align: "left",
      lineBreak: false,
    });
    x += col.width;
  });

  // Draw header underline
  doc
    .moveTo(tableLeft, tableTop + rowHeight - 5)
    .lineTo(tableLeft + columns.reduce((s, c) => s + c.width, 0), tableTop + rowHeight - 5)
    .stroke();

  // Data rows
  doc.font("Helvetica").fontSize(8);
  let y = tableTop + rowHeight;

  sales.forEach((sale) => {
    // Create a new page if we're running out of space
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      y = doc.page.margins.top;

      // Re-draw header on new page
      doc.fontSize(9).font("Helvetica-Bold");
      let hx = tableLeft;
      columns.forEach((col) => {
        doc.text(col.header, hx, y, {
          width: col.width,
          align: "left",
          lineBreak: false,
        });
        hx += col.width;
      });
      doc
        .moveTo(tableLeft, y + rowHeight - 5)
        .lineTo(tableLeft + columns.reduce((s, c) => s + c.width, 0), y + rowHeight - 5)
        .stroke();
      y += rowHeight;
      doc.font("Helvetica").fontSize(8);
    }

    const itemsCount = (sale.items || []).reduce(
      (sum, item) => sum + (Number(item.quantity) || 0),
      0
    );

    const rowData = {
      billNumber: sale.billNumber || "",
      date: sale.createdAt
        ? new Date(sale.createdAt).toLocaleString()
        : "",
      paymentMethod: (sale.paymentMethod || "").toUpperCase(),
      itemsCount: String(itemsCount),
      total: `₹${roundCurrency(sale.total || 0)}`,
      paidAmount: `₹${roundCurrency(sale.paidAmount || 0)}`,
      changeDue: `₹${roundCurrency(sale.changeDue || 0)}`,
      cashier: sale.cashier || "Default Cashier",
    };

    x = tableLeft;
    columns.forEach((col) => {
      doc.text(rowData[col.key], x, y, {
        width: col.width,
        align: "left",
        lineBreak: false,
      });
      x += col.width;
    });

    y += rowHeight;
  });

  return doc;
}

// ══════════════════════════════════════════════════════════
// Reports Page Exports (range=daily|weekly|monthly)
// ══════════════════════════════════════════════════════════

async function fetchReportData(match, shopObjectId) {
  // Summary
  const summaryAgg = await Sale.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$total" },
        totalOrders: { $sum: 1 },
        totalItems: { $sum: { $sum: "$items.quantity" } }
      }
    }
  ]);

  let summary = summaryAgg[0] || { totalRevenue: 0, totalOrders: 0, totalItems: 0 };
  summary.avgTicketSize = summary.totalOrders > 0 ? summary.totalRevenue / summary.totalOrders : 0;

  // Products Sold
  const productsSold = await Sale.aggregate([
    { $match: match },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.productId",
        name: { $first: "$items.name" },
        qty: { $sum: "$items.quantity" },
        revenue: { $sum: "$items.lineTotal" }
      }
    },
    { $sort: { qty: -1 } }
  ]);

  // Low Stock
  const lowStock = await Product.find({ shopId: shopObjectId, stock: { $lte: 10 } })
    .select("name stock")
    .sort({ stock: 1 })
    .lean();

  return { summary, productsSold, lowStock };
}

function reportToCsv(summary, lowStock, productsSold) {
  let csv = "";
  
  // Section 1: Summary
  csv += "--- SUMMARY ---\n";
  csv += `Total Revenue,${roundCurrency(summary.totalRevenue)}\n`;
  csv += `Total Orders,${summary.totalOrders}\n`;
  csv += `Average Ticket Size,${roundCurrency(summary.avgTicketSize)}\n`;
  csv += `Total Items Sold,${summary.totalItems}\n\n`;

  // Section 2: Low Stock
  csv += "--- LOW STOCK ---\n";
  csv += "Product,Stock\n";
  if (lowStock.length === 0) {
    csv += "None,N/A\n";
  } else {
    lowStock.forEach(p => {
      csv += `${escapeCsvField(p.name)},${p.stock}\n`;
    });
  }
  csv += "\n";

  // Section 3: Products Sold
  csv += "--- PRODUCTS SOLD ---\n";
  csv += "Product,Qty,Revenue\n";
  if (productsSold.length === 0) {
    csv += "None,0,0\n";
  } else {
    productsSold.forEach(p => {
      csv += `${escapeCsvField(p.name)},${p.qty},${roundCurrency(p.revenue)}\n`;
    });
  }

  return csv;
}

function buildReportsPdfDocument(summary, lowStock, productsSold, metadata) {
  const doc = new PDFDocument({ margin: 40, size: "A4" }); // Portrait is better for summary reports usually

  // Section 1: Header
  doc.fontSize(18).font("Helvetica-Bold").text(metadata.title, { align: "center" });
  doc.moveDown(0.3);
  if (metadata.range) {
    doc.fontSize(10).font("Helvetica").text(`Period: ${metadata.range}`, { align: "center" });
  }
  doc.fontSize(10).font("Helvetica").text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });
  doc.moveDown(2);

  // Section 2: Summary Metrics
  doc.fontSize(14).font("Helvetica-Bold").text("Summary Metrics", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11).font("Helvetica");
  doc.text(`Total Revenue: INR ${roundCurrency(summary.totalRevenue).toLocaleString()}`);
  doc.text(`Total Orders: ${summary.totalOrders}`);
  doc.text(`Average Ticket Size: INR ${roundCurrency(summary.avgTicketSize).toLocaleString()}`);
  doc.text(`Total Items Sold: ${summary.totalItems}`);
  doc.moveDown(1.5);

  // Table Helpers
  function drawTable(title, columns, data) {
    doc.fontSize(14).font("Helvetica-Bold").text(title, { underline: true });
    doc.moveDown(0.5);

    if (data.length === 0) {
      doc.fontSize(10).font("Helvetica").text("No data available.");
      doc.moveDown(1);
      return;
    }

    const startX = doc.page.margins.left;
    let y = doc.y;
    const padding = 5;

    // Header 
    doc.fontSize(10).font("Helvetica-Bold");
    let x = startX;
    columns.forEach(col => {
      doc.text(col.header, x, y, { width: col.width, lineBreak: false });
      x += col.width;
    });

    const headerBottomY = y + 12 + padding;
    doc.moveTo(startX, headerBottomY).lineTo(startX + columns.reduce((s, c) => s + c.width, 0), headerBottomY).stroke();
    y = headerBottomY + padding;

    // Rows
    doc.font("Helvetica");
    data.forEach(row => {
      if (y > doc.page.height - doc.page.margins.bottom - 20) {
         doc.addPage();
         y = doc.page.margins.top;
      }
      x = startX;
      columns.forEach(col => {
        doc.text(String(row[col.key] || ""), x, y, { width: col.width, lineBreak: false });
        x += col.width;
      });
      y += 15;
    });
    doc.y = y + 10;
  }

  // Section 3: Low Stock
  drawTable(
    "Low Stock Products", 
    [ { header: "Product Name", key: "name", width: 350 }, { header: "Current Stock", key: "stock", width: 100 } ], 
    lowStock
  );

  doc.moveDown(1);

  // Section 4: Products Sold
  drawTable(
    "Top Products Sold",
    [ 
       { header: "Product Name", key: "name", width: 250 }, 
       { header: "Quantity Sold", key: "qty", width: 100 }, 
       { header: "Revenue (INR)", key: "revenue", width: 100 } 
    ],
    productsSold.map(p => ({ ...p, revenue: roundCurrency(p.revenue).toLocaleString() }))
  );

  return doc;
}

export const exportReportsCsv = asyncHandler(async (req, res) => {
  const shopId = getRequestShopId(req);
  const shopObjectId = toShopObjectId(shopId);
  const { match, range } = buildReportsMatch(req.query, shopObjectId);

  const { summary, productsSold, lowStock } = await fetchReportData(match, shopObjectId);
  const csv = reportToCsv(summary, lowStock, productsSold);

  const filename = `reports_${range}_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(csv);
});

export const exportReportsPdf = asyncHandler(async (req, res) => {
  const shopId = getRequestShopId(req);
  const shopObjectId = toShopObjectId(shopId);
  const { match, range } = buildReportsMatch(req.query, shopObjectId);

  const { summary, productsSold, lowStock } = await fetchReportData(match, shopObjectId);

  const filename = `reports_${range}_${new Date().toISOString().slice(0, 10)}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = buildReportsPdfDocument(summary, lowStock, productsSold, {
    title: "Sales Report",
    range: `${range.charAt(0).toUpperCase() + range.slice(1)}`,
  });

  doc.pipe(res);
  doc.end();
});

// ══════════════════════════════════════════════════════════
// Sales Page Exports (from/to dates + paymentMethod filter)
// ══════════════════════════════════════════════════════════

export const exportSalesCsv = asyncHandler(async (req, res) => {
  const shopId = getRequestShopId(req);
  const match = buildSalesMatch(req.query, shopId);

  const sales = await fetchSales(match);
  const csv = salesToCsvRows(sales);

  const filename = `sales_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(csv);
});

export const exportSalesPdf = asyncHandler(async (req, res) => {
  const shopId = getRequestShopId(req);
  const match = buildSalesMatch(req.query, shopId);

  const sales = await fetchSales(match);

  const filename = `sales_${new Date().toISOString().slice(0, 10)}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = buildPdfDocument(sales, {
    title: "CounterCraft POS — Transaction History",
  });

  doc.pipe(res);
  doc.end();
});
