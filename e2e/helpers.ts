import { expect, type APIRequestContext, type Page } from "@playwright/test";

export interface DevicesListPayload {
  devices: Array<{
    id: number;
    title: string;
    brand: string;
    price_buy: number | null;
    profit_estimate: number | null;
    risk_adjusted_profit: number | null;
    seller_name: string | null;
  }>;
  total_count: number;
  logistics: {
    shipping_parts_pln: number;
    shipping_to_repair_pln: number;
    shipping_to_customer_pln: number;
    repair_labor_base_pln: number;
  };
  filter_meta: {
    brand_tree?: Array<{ brand: string; label: string; count: number }>;
  } | null;
}

export async function fetchDevicesApi(
  request: APIRequestContext,
  query = "limit=12&meta=1",
): Promise<{ status: number; body: DevicesListPayload }> {
  const response = await request.get(`/api/devices?${query}`);
  const body = await response.json() as DevicesListPayload;
  return { status: response.status(), body };
}

export async function waitForHomeReady(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("main, [data-testid='scan-dashboard']", { timeout: 30_000 });
  await expect(page.getByText("SmartFlip").first()).toBeVisible();
  await page.locator("[data-testid='scan-dashboard']").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(400);
}

export async function openFiltersIfNeeded(page: Page): Promise<void> {
  const drawer_button = page.getByRole("button", { name: "Фильтры" });
  if (await drawer_button.isVisible()) {
    await drawer_button.click();
  }
  await expect(page.locator("[data-testid='filter-bar']").first()).toBeVisible();
}

export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scroll_width: document.documentElement.scrollWidth,
    client_width: document.documentElement.clientWidth,
  }));
  expect(metrics.scroll_width).toBeLessThanOrEqual(metrics.client_width + 1);
}
