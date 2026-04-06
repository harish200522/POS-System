const { test, expect } = require("@playwright/test");

const FIXED_TIME_MS = Date.parse("2026-04-06T10:00:00.000Z");

const VIEWPORTS = [
  { name: "320", width: 320, height: 900 },
  { name: "375", width: 375, height: 900 },
  { name: "425", width: 425, height: 950 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 900 },
];

const MOCK_PRODUCTS = [
  {
    _id: "p1",
    name: "Whole Wheat Bread",
    barcode: "8901234567890",
    category: "Bakery",
    price: 48,
    stock: 18,
    isActive: true,
  },
  {
    _id: "p2",
    name: "Organic Milk 1L",
    barcode: "8901987654321",
    category: "Dairy",
    price: 62,
    stock: 4,
    isActive: true,
  },
  {
    _id: "p3",
    name: "Basmati Rice 5kg",
    barcode: "8901000001112",
    category: "Grocery",
    price: 480,
    stock: 7,
    isActive: true,
  },
  {
    _id: "p4",
    name: "Sparkling Water",
    barcode: "8901222233334",
    category: "Beverages",
    price: 35,
    stock: 0,
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
    username: "cashier1",
    displayName: "Front Counter",
    role: "cashier",
    isActive: true,
    updatedAt: "2026-04-05T14:30:00.000Z",
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

test.beforeEach(async ({ page }) => {
  await page.addInitScript((fixedTime) => {
    const RealDate = Date;

    class FixedDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) {
          super(fixedTime);
          return;
        }

        super(...args);
      }

      static now() {
        return fixedTime;
      }
    }

    FixedDate.UTC = RealDate.UTC;
    FixedDate.parse = RealDate.parse;
    window.Date = FixedDate;

    localStorage.setItem("pos_access_token", "visual-test-token");
  }, FIXED_TIME_MS);

  await registerApiMocks(page);
});

for (const viewport of VIEWPORTS) {
  test(`responsive baseline ${viewport.name}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");

    await expect(page.locator("#product-results [data-product-id]").first()).toBeVisible();
    await page.locator("#product-results [data-product-id]").first().click();
    await expect(page.locator("#cart-list .cart-row")).toHaveCount(1);

    if (viewport.width <= 768) {
      await page.locator("#mobile-cart-open-button").click();
      await expect(page.locator("#mobile-cart-sheet")).toHaveClass(/mobile-cart-sheet-open/);
    }

    await expect(page).toHaveScreenshot(`pos-layout-${viewport.name}.png`, {
      fullPage: true,
      animations: "disabled",
    });
  });
}
