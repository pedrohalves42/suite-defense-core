import { test, expect } from "@playwright/test";

test.describe("CyberShield Dashboard E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("landing page loads correctly", async ({ page }) => {
    await expect(page).toHaveTitle(/CyberShield/);
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("login page is accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("signup page is accessible", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("navigation between auth pages works", async ({ page }) => {
    await page.goto("/login");
    const signupLink = page.getByRole("link", { name: /cadastr|criar conta|sign up/i });
    if (await signupLink.isVisible()) {
      await signupLink.click();
      await expect(page).toHaveURL(/signup/);
    }
  });

  test("pricing page loads", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("404 page shows for unknown routes", async ({ page }) => {
    await page.goto("/unknown-page-xyz");
    await expect(page.locator("text=/404|não encontrad|not found/i").first()).toBeVisible();
  });

  test("theme is dark by default", async ({ page }) => {
    const html = page.locator("html");
    await expect(html).toHaveClass(/dark/);
  });

  test("PWA manifest is accessible", async ({ page }) => {
    const response = await page.goto("/manifest.webmanifest");
    if (response) {
      expect(response.status()).toBe(200);
    }
  });

  test("responsive: mobile viewport renders correctly", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("landing page has CTA buttons", async ({ page }) => {
    const ctaButton = page.getByRole("link", { name: /começar|trial|experimente|grátis/i }).first();
    await expect(ctaButton).toBeVisible();
  });
});
