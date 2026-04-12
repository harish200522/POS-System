const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const BASE_URL = process.env.LOGIN_CAPTURE_URL || "http://127.0.0.1:5501";
const OUTPUT_DIR = path.join(process.cwd(), "test-results", "login-page-shots");

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 900 },
  { name: "mobile-425", width: 425, height: 950 },
  { name: "desktop-1024", width: 1024, height: 900 },
];

async function captureSetupCard(viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: "en-IN",
  });

  const page = await context.newPage();

  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());

    if (pathname.endsWith("/api/auth/me")) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "Unauthorized" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#auth-modal:not(.hidden)", { timeout: 15000 });
  await page.waitForSelector("#auth-show-setup", { timeout: 15000 });

  await page.click("#auth-show-setup");
  await page.waitForSelector("#auth-setup-view:not(.hidden)", { timeout: 15000 });

  await page.evaluate(() => {
    const authError = document.getElementById("auth-error");
    if (authError) {
      authError.textContent = "";
      authError.classList.add("hidden");
    }
  });

  const setupCard = page.locator("#auth-modal .auth-modal-card");
  await setupCard.screenshot({
    path: path.join(OUTPUT_DIR, `create-admin-page-${viewport.name}.png`),
  });

  await browser.close();
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const viewport of VIEWPORTS) {
    await captureSetupCard(viewport);
  }

  console.log(`Saved create-admin screenshots to: ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
