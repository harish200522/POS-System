const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const BASE_URL = process.env.POS_CAPTURE_URL || "http://127.0.0.1:5501";
const OUTPUT_DIR = path.join(process.cwd(), "test-results", "pos-page-shots");

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 900, openCartSheet: false },
  { name: "tablet-768", width: 768, height: 1024, openCartSheet: false },
  { name: "desktop-1280", width: 1280, height: 900, openCartSheet: false },
];

const MOCK_PRODUCTS = [
  {
    _id: "p1",
    name: "T shirt",
    barcode: "CCMMTLWAA9991SHD",
    category: "Cloth",
    price: 199,
    stock: 5,
    isActive: true,
  },
  {
    _id: "p2",
    name: "Tiger krunch",
    barcode: "8910106515519",
    category: "Biscuit",
    price: 10,
    stock: 5,
    isActive: true,
  },
  {
    _id: "p3",
    name: "Notebook A4",
    barcode: "NBKA4001",
    category: "Stationery",
    price: 45,
    stock: 5,
    isActive: true,
  },
  {
    _id: "p4",
    name: "Coffee 200g",
    barcode: "CF200G77881",
    category: "Beverage",
    price: 249,
    stock: 6,
    isActive: true,
  },
];

const MOCK_USERS = [
  {
    id: "u1",
    username: "admin",
    displayName: "Admin User",
    role: "admin",
    isActive: true,
    updatedAt: "2026-04-05T14:00:00.000Z",
  },
];

const MOCK_SUMMARY = {
  overview: {
    totalRevenue: 24850,
    totalTransactions: 112,
  },
  lowStockCount: 1,
  paymentBreakdown: [
    { paymentMethod: "cash", count: 61, amount: 13800 },
    { paymentMethod: "upi", count: 51, amount: 11050 },
  ],
  trend: [
    { label: "Mon", revenue: 3800 },
    { label: "Tue", revenue: 4120 },
    { label: "Wed", revenue: 4650 },
    { label: "Thu", revenue: 3980 },
    { label: "Fri", revenue: 5120 },
    { label: "Sat", revenue: 3180 },
  ],
  topProducts: [
    { name: "Whole Wheat Bread", quantity: 44, revenue: 2112 },
    { name: "Organic Milk 1L", quantity: 31, revenue: 1922 },
    { name: "Basmati Rice 5kg", quantity: 12, revenue: 5760 },
  ],
};

async function registerApiMocks(page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const { pathname } = new URL(request.url());

    const json = (payload, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });

    if (method === "GET" && pathname.endsWith("/api/auth/me")) {
      return json({
        success: true,
        data: {
          id: "u1",
          username: "admin",
          displayName: "Admin User",
          role: "admin",
          isActive: true,
        },
      });
    }

    if (method === "GET" && pathname.endsWith("/api/products")) {
      return json({ success: true, data: MOCK_PRODUCTS });
    }

    if (method === "GET" && /\/api\/products\/barcode\//.test(pathname)) {
      const barcode = decodeURIComponent(pathname.split("/").pop() || "");
      const product = MOCK_PRODUCTS.find((entry) => entry.barcode === barcode);

      if (!product) {
        return json({ success: false, message: "Product not found" }, 404);
      }

      return json({ success: true, data: product });
    }

    if (method === "GET" && pathname.endsWith("/api/inventory/low-stock")) {
      return json({
        success: true,
        data: MOCK_PRODUCTS.filter((entry) => entry.stock <= 5),
      });
    }

    if (method === "GET" && pathname.endsWith("/api/sales/summary")) {
      return json({ success: true, data: MOCK_SUMMARY });
    }

    if (method === "GET" && pathname.endsWith("/api/inventory/overview")) {
      return json({
        success: true,
        data: {
          inventoryValue: 97840,
        },
      });
    }

    if (method === "GET" && pathname.endsWith("/api/sales")) {
      return json({ success: true, data: [] });
    }

    if (method === "GET" && pathname.endsWith("/api/auth/users")) {
      return json({ success: true, data: MOCK_USERS });
    }

    if (method === "PATCH" && /\/api\/products\/.+\/stock$/.test(pathname)) {
      return json({ success: true, data: {} });
    }

    if (method === "PATCH" && /\/api\/auth\/users\/.+\/(password|status)$/.test(pathname)) {
      return json({ success: true, data: {} });
    }

    return json({ success: true, data: {} });
  });
}

async function captureViewport(viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: "en-IN",
  });

  const page = await context.newPage();
  await registerApiMocks(page);

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#panel-pos:not(.hidden)", { timeout: 20000 });
  await page.waitForSelector("#product-results .product-card", { timeout: 20000 });

  if (viewport.openCartSheet) {
    await page.locator("#mobile-cart-open-button").click();
    await page.waitForSelector("#mobile-cart-sheet.mobile-cart-sheet-open", { timeout: 20000 });
  }

  await page.screenshot({
    path: path.join(OUTPUT_DIR, `pos-page-${viewport.name}.png`),
    fullPage: true,
  });

  await browser.close();
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const viewport of VIEWPORTS) {
    await captureViewport(viewport);
  }

  console.log(`Saved POS screenshots to: ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
