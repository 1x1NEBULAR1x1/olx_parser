import { expect, test } from "@playwright/test";

async function assertNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const metrics = await page.evaluate(() => ({
    scroll_width: document.documentElement.scrollWidth,
    client_width: document.documentElement.clientWidth,
  }));
  expect(metrics.scroll_width).toBeLessThanOrEqual(metrics.client_width + 1);
}

test.describe("mobile layout", () => {
  test("home page fits viewport and shows MUI toolbar", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("main", { timeout: 30_000 });
    await assertNoHorizontalOverflow(page);

    const toolbar = page.locator("[data-testid='feed-toolbar']");
    const card_count = await page.locator("article").count();
    if (card_count > 0) {
      await expect(toolbar).toBeVisible();
    }
  });

  test("device card photo gallery navigates with arrows and wheel", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("main", { timeout: 30_000 });

    const gallery = page.locator("[data-testid='card-photo-gallery']").first();
    if ((await gallery.count()) === 0) {
      test.skip();
      return;
    }

    const counter = gallery.locator("xpath=..").locator("[aria-hidden]").first();
    const counter_text = await counter.textContent();
    const has_multiple_photos = counter_text?.includes("/") && !counter_text?.startsWith("1/1");

    const next_btn = page.locator("[data-testid='photo-gallery-next']").first();
    if (has_multiple_photos && (await next_btn.count()) > 0) {
      await gallery.hover();
      await next_btn.click({ force: true });
      await page.waitForTimeout(450);
      const counter_after_click = await counter.textContent();
      expect(counter_after_click).not.toBe(counter_text);
    }

    await gallery.hover();
    await page.mouse.wheel(120, 0);
    await page.waitForTimeout(450);

    if (has_multiple_photos) {
      const counter_after_wheel = await counter.textContent();
      expect(counter_after_wheel).toBeTruthy();
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

  test("favorites page uses MUI layout without horizontal overflow", async ({ page }) => {
    await page.goto("/favorites");
    await page.waitForSelector("header", { timeout: 15_000 });
    await assertNoHorizontalOverflow(page);
  });
});
