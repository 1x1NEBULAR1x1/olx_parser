import { expect, test } from "@playwright/test";

async function assertNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const metrics = await page.evaluate(() => ({
    scroll_width: document.documentElement.scrollWidth,
    client_width: document.documentElement.clientWidth,
  }));
  expect(metrics.scroll_width).toBeLessThanOrEqual(metrics.client_width + 1);
}

test.describe("mobile layout", () => {
  test("home page fits viewport", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("main", { timeout: 30_000 });
    await assertNoHorizontalOverflow(page);

    const card_count = await page.locator("article").count();
    if (card_count === 0) return;

    const toolbar = page.locator("[data-testid='feed-toolbar']");
    await expect(toolbar).toBeVisible();

    const card = page.locator("article").first();
    const gallery = card.locator("[data-testid='card-photo-gallery']");
    if (await gallery.count()) {
      const box = await gallery.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(0);
    }
  });

  test("login page fits viewport", async ({ page }) => {
    await page.goto("/login");
    await assertNoHorizontalOverflow(page);
    await expect(page.getByRole("button")).toBeVisible();
  });

  test("settings page fits viewport", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForSelector("h1", { timeout: 15_000 });
    await assertNoHorizontalOverflow(page);
  });
});
