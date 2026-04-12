const { test, expect } = require('@playwright/test');

// Visual regression test for the login page

test.describe('Login Page Visual', () => {
  test('should match login page screenshot', async ({ page }) => {
    await page.goto('/');
    // Ensure the login modal is visible (simulate logged-out state)
    await page.waitForSelector('#auth-modal', { state: 'visible' });
    await expect(page.locator('#auth-modal')).toBeVisible();
    await expect(page).toHaveScreenshot('login-page.png', { fullPage: true });
  });
});
