const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const BASE_URL = process.env.POS_CAPTURE_URL || "http://127.0.0.1:5501";
const OUTPUT_DIR = path.join(process.cwd(), "test-results", "admin-page-shots");

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 900 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 900 },
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
    stock: 7,
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
  {
    id: "u2",
    username: "cashier01",
    displayName: "Counter Staff",
    role: "cashier",
    isActive: true,
    updatedAt: "2026-04-05T10:20:00.000Z",
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

let paymentSettingsState = {
  shopId: "default-shop",
  upiId: "countercraft@upi",
  qrImage: "",
  configured: true,
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

    if (method === "POST" && pathname.endsWith("/api/auth/logout")) {
      return json({ success: true, data: {} });
    }

    if (method === "GET" && pathname.endsWith("/api/products")) {
      return json({ success: true, data: MOCK_PRODUCTS });
    }

    if (method === "POST" && pathname.endsWith("/api/products")) {
      const body = request.postDataJSON() || {};
      const created = {
        _id: `p${MOCK_PRODUCTS.length + 1}`,
        ...body,
        isActive: true,
      };
      MOCK_PRODUCTS.push(created);
      return json({ success: true, data: created });
    }

    if (method === "PUT" && /\/api\/products\/.+/.test(pathname)) {
      return json({ success: true, data: {} });
    }

    if (method === "DELETE" && /\/api\/products\/.+/.test(pathname)) {
      return json({ success: true, data: {} });
    }

    if (method === "GET" && /\/api\/products\/barcode\//.test(pathname)) {
      const barcode = decodeURIComponent(pathname.split("/").pop() || "");
      const product = MOCK_PRODUCTS.find((entry) => entry.barcode === barcode);

      if (!product) {
        return json({ success: false, message: "Product not found" }, 404);
      }

      return json({ success: true, data: product });
    }

    if (method === "PATCH" && /\/api\/products\/.+\/stock$/.test(pathname)) {
      return json({ success: true, data: {} });
    }

    if (method === "GET" && pathname.endsWith("/api/inventory/low-stock")) {
      return json({
        success: true,
        data: MOCK_PRODUCTS.filter((entry) => entry.stock <= 5),
      });
    }

    if (method === "GET" && pathname.endsWith("/api/inventory/overview")) {
      return json({
        success: true,
        data: {
          inventoryValue: 97840,
        },
      });
    }

    if (method === "GET" && pathname.endsWith("/api/sales/summary")) {
      return json({ success: true, data: MOCK_SUMMARY });
    }

    if (method === "GET" && pathname.endsWith("/api/sales")) {
      return json({ success: true, data: [] });
    }

    if (method === "GET" && pathname.endsWith("/api/auth/users")) {
      return json({ success: true, data: MOCK_USERS });
    }

    if (method === "PATCH" && /\/api\/auth\/users\/.+\/(password|status)$/.test(pathname)) {
      return json({ success: true, data: {} });
    }

    if (method === "GET" && pathname.endsWith("/api/payment/settings")) {
      return json({ success: true, data: paymentSettingsState });
    }

    if (method === "POST" && pathname.endsWith("/api/payment/settings")) {
      const body = request.postDataJSON() || {};
      paymentSettingsState = {
        ...paymentSettingsState,
        ...body,
        configured: true,
      };
      return json({ success: true, data: paymentSettingsState });
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
  await page.waitForSelector('[data-tab="admin"]:not(.hidden)', { timeout: 20000 });
  await page.locator('[data-tab="admin"]').click();

  await page.waitForSelector("#panel-admin:not(.hidden)", { timeout: 20000 });
  await page.waitForSelector("#product-form", { timeout: 20000 });

  const productSuffix = String(viewport.name || "view").replace(/[^a-z0-9]/gi, "").toUpperCase();
  await page.fill('#product-form input[name="name"]', `Sample ${viewport.name}`);
  await page.fill('#product-form input[name="barcode"]', `SAMPLE-${productSuffix}`);
  await page.selectOption('#product-form select[name="category"]', "Biscuit");
  await page.fill('#product-form input[name="price"]', "49");
  await page.fill('#product-form input[name="stock"]', "15");
  await page.locator("#product-form-submit").click();
  await page.waitForFunction(() => {
    const nameInput = document.querySelector('#product-form input[name="name"]');
    return nameInput instanceof HTMLInputElement && nameInput.value === "";
  });

  await page.screenshot({
    path: path.join(OUTPUT_DIR, `admin-main-${viewport.name}.png`),
    fullPage: true,
  });

  await page.locator("#admin-menu-button").click();
  await page.waitForSelector("#admin-menu-overlay:not(.hidden)", { timeout: 20000 });
  await page.waitForSelector("#admin-menu-page-main:not(.hidden)", { timeout: 20000 });

  await page.screenshot({
    path: path.join(OUTPUT_DIR, `admin-menu-main-${viewport.name}.png`),
    fullPage: true,
  });

  await page.locator("#admin-menu-open-settings").click();
  await page.waitForSelector("#admin-menu-page-settings:not(.hidden)", { timeout: 20000 });
  await page.fill("#payment-upi-id", "countercraft-admin@upi");
  await page.locator("#payment-settings-save").click();
  await page.waitForFunction(() => {
    const input = document.querySelector("#payment-upi-id");
    const saveButton = document.querySelector("#payment-settings-save");
    return (
      input instanceof HTMLInputElement &&
      saveButton instanceof HTMLButtonElement &&
      input.value === "countercraft-admin@upi" &&
      saveButton.disabled === false
    );
  });

  await page.screenshot({
    path: path.join(OUTPUT_DIR, `admin-menu-settings-${viewport.name}.png`),
    fullPage: true,
  });

  await page.locator("#admin-menu-back-button").click();
  await page.waitForSelector("#admin-menu-page-main:not(.hidden)", { timeout: 20000 });

  await page.locator("#admin-menu-open-inventory").click();
  await page.waitForSelector("#admin-menu-page-inventory:not(.hidden)", { timeout: 20000 });
  await page.waitForSelector("#product-table-body tr", { timeout: 20000 });

  const restockButton = page.locator('[data-product-action="restock"]').first();
  if ((await restockButton.count()) > 0) {
    await restockButton.click();
    await page.waitForTimeout(200);
  }

  await page.screenshot({
    path: path.join(OUTPUT_DIR, `admin-menu-inventory-${viewport.name}.png`),
    fullPage: true,
  });

  await browser.close();
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const viewport of VIEWPORTS) {
    await captureViewport(viewport);
  }

  console.log(`Saved Admin screenshots to: ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
