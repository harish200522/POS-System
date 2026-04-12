const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { chromium } = require("@playwright/test");

const ROOT_DIR = process.cwd();
const BACKEND_DIR = path.join(ROOT_DIR, "backend");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");

const FRONTEND_PORT = 5501;
const BACKEND_PORT = 5050;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const API_BASE_URL = `http://127.0.0.1:${BACKEND_PORT}/api`;
const OUTPUT_DIR = path.join(ROOT_DIR, "test-results", "admin-backend-e2e");

const E2E_PASSWORD = "Admin1234";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return;
      }
      lastError = new Error(`Unexpected status ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(300);
  }

  throw new Error(`Timed out waiting for ${url}${lastError ? `: ${lastError.message}` : ""}`);
}

function startProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    shell: false,
    windowsHide: true,
    ...options,
  });

  return child;
}

function pipeLogs(child, name) {
  if (!child || !name) {
    return;
  }

  if (child.stdout) {
    child.stdout.on("data", (chunk) => {
      process.stdout.write(`[${name}] ${chunk}`);
    });
  }

  if (child.stderr) {
    child.stderr.on("data", (chunk) => {
      process.stderr.write(`[${name}] ${chunk}`);
    });
  }
}

function killProcessTree(child) {
  if (!child || typeof child.pid !== "number") {
    return;
  }

  try {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
  } catch (_error) {
    // Ignore cleanup failures.
  }
}

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const runSuffix = String(Date.now());
  const adminUsername = `admin${runSuffix.slice(-6)}`;
  const adminEmail = `qa${runSuffix}@example.com`;
  const adminPhone = `+9198${runSuffix.slice(-8)}`;
  const shopName = `QA Shop ${runSuffix.slice(-4)}`;
  const ownerName = "QA Owner";

  const productName = `E2E Product ${runSuffix.slice(-6)}`;
  const productBarcode = `E2E${runSuffix.slice(-10)}`;
  const paymentUpiId = `qa${runSuffix.slice(-6)}@upi`;

  let mongoServer = null;
  let backendProcess = null;
  let frontendProcess = null;
  let browser = null;

  try {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    backendProcess = startProcess("cmd.exe", ["/c", "node", "src/server.js"], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: String(BACKEND_PORT),
        CLIENT_ORIGIN: FRONTEND_URL,
        MONGO_URI: mongoUri,
        JWT_SECRET: "123456789012345678901234567890123456",
        INVOICE_TOKEN_SECRET: "abcdefghijklmnopqrstuvwxyz1234567890",
      },
    });
    pipeLogs(backendProcess, "backend");

    frontendProcess = startProcess(
      "cmd.exe",
      ["/c", "npx", "http-server", FRONTEND_DIR, "-p", String(FRONTEND_PORT), "-c-1"],
      { cwd: ROOT_DIR }
    );
    pipeLogs(frontendProcess, "frontend");

    await waitForHttp(`${API_BASE_URL}/health`, 45000);
    await waitForHttp(FRONTEND_URL, 45000);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 375, height: 900 },
      locale: "en-IN",
      serviceWorkers: "block",
    });

    const page = await context.newPage();

    await page.route("**/app.config.js", async (route) => {
      const configBody = `window.__APP_CONFIG__ = {\n  API_BASE_URL: \"${API_BASE_URL}\",\n  SHOP_NAME: \"CounterCraft POS\",\n  SHOP_ADDRESS: \"Retail Counter\",\n  SHOP_PHONE: \"+91 90000 00000\",\n  SHOP_GSTIN: \"\",\n  BILL_PUBLIC_BASE_URL: \"\",\n  WHATSAPP_DEFAULT_COUNTRY_CODE: \"91\"\n};`;

      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: configBody,
      });
    });

    await page.goto(FRONTEND_URL, { waitUntil: "domcontentloaded" });

    await page.waitForSelector("#auth-modal:not(.hidden)", { timeout: 30000 });
    await page.click("#auth-show-setup");
    await page.waitForSelector("#auth-setup-view:not(.hidden)", { timeout: 30000 });

    await page.fill("#auth-setup-username", adminUsername);
    await page.fill("#auth-setup-password", E2E_PASSWORD);
    await page.fill("#auth-shop-name", shopName);
    await page.fill("#auth-owner-name", ownerName);
    await page.fill("#auth-phone", adminPhone);
    await page.fill("#auth-email", adminEmail);

    await page.click("#auth-bootstrap-button");
    await page.waitForSelector("#auth-modal", { state: "hidden", timeout: 30000 });

    await page.click('[data-tab="admin"]');
    await page.waitForSelector("#panel-admin:not(.hidden)", { timeout: 30000 });

    await page.fill('#product-form input[name="name"]', productName);
    await page.fill('#product-form input[name="barcode"]', productBarcode);
    await page.selectOption('#product-form select[name="category"]', "General");
    await page.fill('#product-form input[name="price"]', "49");
    await page.fill('#product-form input[name="stock"]', "15");
    await page.click("#product-form-submit");

    await page.waitForFunction(() => {
      const input = document.querySelector('#product-form input[name="name"]');
      return input instanceof HTMLInputElement && input.value === "";
    });

    await page.click("#admin-menu-button");
    await page.waitForSelector("#admin-menu-overlay:not(.hidden)", { timeout: 30000 });

    await page.click("#admin-menu-open-settings");
    await page.waitForSelector("#admin-menu-page-settings:not(.hidden)", { timeout: 30000 });
    await page.fill("#payment-upi-id", paymentUpiId);
    await page.click("#payment-settings-save");

    await page.waitForFunction(() => {
      const saveButton = document.querySelector("#payment-settings-save");
      return saveButton instanceof HTMLButtonElement && !saveButton.disabled;
    });

    await page.click("#admin-menu-back-button");
    await page.waitForSelector("#admin-menu-page-main:not(.hidden)", { timeout: 30000 });

    await page.click("#admin-menu-open-inventory");
    await page.waitForSelector("#admin-menu-page-inventory:not(.hidden)", { timeout: 30000 });

    await page.fill("#inventory-search-input", productName);

    const targetRow = page.locator("#product-table-body tr", { hasText: productName }).first();
    await targetRow.waitFor({ state: "visible", timeout: 30000 });

    await targetRow.locator('[data-product-action="restock"]').first().click();
    await page.waitForTimeout(700);

    const productsResponse = await context.request.get(`${API_BASE_URL}/products`);
    if (!productsResponse.ok()) {
      throw new Error(`Failed fetching products: ${productsResponse.status()}`);
    }

    const productsPayload = await productsResponse.json();
    const matchedProduct = (productsPayload?.data || []).find((entry) => entry.barcode === productBarcode);
    if (!matchedProduct) {
      throw new Error("Created product was not found via backend API");
    }

    if (Number(matchedProduct.stock) !== 25) {
      throw new Error(`Expected stock 25 after restock, received ${matchedProduct.stock}`);
    }

    const paymentResponse = await context.request.get(`${API_BASE_URL}/payment/settings`);
    if (!paymentResponse.ok()) {
      throw new Error(`Failed fetching payment settings: ${paymentResponse.status()}`);
    }

    const paymentPayload = await paymentResponse.json();
    const savedUpiId = String(paymentPayload?.data?.upiId || "").toLowerCase();
    if (savedUpiId !== paymentUpiId.toLowerCase()) {
      throw new Error(`Payment settings mismatch. Expected ${paymentUpiId}, received ${savedUpiId}`);
    }

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "admin-backend-e2e-mobile.png"),
      fullPage: true,
    });

    const summary = {
      success: true,
      adminUsername,
      productName,
      productBarcode,
      finalStock: Number(matchedProduct.stock),
      paymentUpiId: savedUpiId,
      screenshot: path.join("test-results", "admin-backend-e2e", "admin-backend-e2e-mobile.png"),
      startedAt: new Date(Number(runSuffix)).toISOString(),
      completedAt: new Date().toISOString(),
    };

    const summaryPath = path.join(OUTPUT_DIR, "admin-backend-e2e-summary.json");
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    console.log("\nAdmin backend-integrated E2E passed.");
    console.log(`Summary: ${summaryPath}`);
    console.log(`Screenshot: ${summary.screenshot}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }

    killProcessTree(frontendProcess);
    killProcessTree(backendProcess);

    if (mongoServer) {
      await mongoServer.stop().catch(() => {});
    }
  }
}

run().catch((error) => {
  console.error("\nAdmin backend-integrated E2E failed:");
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
