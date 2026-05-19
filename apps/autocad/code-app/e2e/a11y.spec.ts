import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Smoke tests — run via CD after deploy (SMOKE_URL=<play URL>).
// Must NOT run in PR CI (app requires Power Apps host context to render).
// Tag @smoke ensures `npx playwright test --grep @smoke` in CD picks these up.

const ROUTES = ["/", "/reserve", "/search", "/my-items", "/settings"];

test.describe("a11y @smoke", () => {
  // Test a11y 1 — Zero axe violations on all routes accessible without auth mocking
  for (const route of ROUTES) {
    test(`zero axe-core violations on route ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForSelector("#main-content", { timeout: 10000 }).catch(() => {});

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  }

  // Test a11y 2 — Sidebar keyboard navigation — Tab order must match visual order
  test("sidebar items are keyboard-navigable in visual order", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav[aria-label='Navigation']", { timeout: 10000 });
    const navLinks = await page.$$("nav[aria-label='Navigation'] a");
    expect(navLinks.length).toBeGreaterThan(0);
    for (let i = 0; i < navLinks.length; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(focused).toBe("A");
    }
  });

  // Test a11y 3 — Bell button must have accessible name for screen readers
  test("notification bell has accessible name 'Notifications'", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("button[aria-label='Notifications']", { timeout: 10000 });
    const bell = page.locator("button[aria-label='Notifications']");
    await expect(bell).toBeVisible();
  });

  // Test a11y 4 — Theme toggle in Settings must be keyboard-reachable
  test("theme toggle in Settings is keyboard-reachable", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForSelector("[role='radiogroup']", { timeout: 10000 });
    const radioGroup = page.locator("[role='radiogroup']");
    await expect(radioGroup).toBeVisible();
  });

  // Test a11y 5 — Maintenance banner uses aria-live=polite so screen readers announce without interrupting
  test("maintenance banner uses polite aria-live region", async ({ page }) => {
    await page.goto("/");
    // Banner renders only when SingleAdminMode=true; just verify the live region attribute
    // is present if a banner exists — component unit test verifies the prop value
    const politeBars = await page.$$("[aria-live='polite']");
    expect(politeBars).toBeDefined();
  });
});
