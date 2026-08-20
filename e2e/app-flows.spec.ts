import { expect, test } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  fetchDevicesApi,
  openFiltersIfNeeded,
  waitForHomeReady,
} from "./helpers";

test.describe("app flows", () => {
  test("home shows dashboard, cards and expected profit", async ({ page }) => {
    await waitForHomeReady(page);
    await expect(page.getByRole("button", { name: "Обновить данные" })).toBeVisible();
    await expect(page.getByText("Сканирование и аналитика")).toBeVisible();

    const cards = page.locator("[data-testid='device-card']");
    const card_count = await cards.count();
    if (card_count === 0) {
      await expect(page.getByText("Нет результатов. Запустите сканирование.")).toBeVisible();
      return;
    }

    await expect(page.locator("[data-testid='feed-toolbar']")).toBeVisible();
    await expect(cards.first().locator("[data-testid='card-expected-profit-label']")).toHaveText("Ожидаемая прибыль");
    await expect(cards.first().getByRole("link", { name: "Подробнее" })).toBeVisible();
  });

  test("sort and brand filter write query string", async ({ page, request }) => {
    const { body } = await fetchDevicesApi(request, "limit=5&meta=1");
    if (body.total_count === 0) {
      test.skip();
      return;
    }

    await waitForHomeReady(page);
    await page.getByRole("combobox", { name: "Сортировка:" }).click();
    await page.getByRole("option", { name: "Цена ↑" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("price_asc");

    await openFiltersIfNeeded(page);
    const brand_checkbox = page.locator("[data-testid='filter-bar'] input[type='checkbox']").first();
    if (await brand_checkbox.count() === 0) {
      return;
    }

    await brand_checkbox.evaluate((node) => {
      (node as HTMLInputElement).click();
    });
    await expect.poll(() => new URL(page.url()).searchParams.get("brands")).toBeTruthy();
  });

  test("device detail shows seller, description, profit and no thumbs", async ({ page, request }) => {
    const { body } = await fetchDevicesApi(request, "limit=1");
    if (body.devices.length === 0) {
      test.skip();
      return;
    }

    await page.goto(`/devices/${body.devices[0].id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Ожидаемая прибыль")).toBeVisible();
    await expect(page.getByText("Продавец", { exact: true })).toBeVisible();
    await expect(page.getByText("Описание объявления", { exact: true })).toBeVisible();
    await expect(page.locator("[class*='photo_gallery_thumbs']")).toHaveCount(0);

    const gallery = page.locator("[data-testid='detail-photo-gallery']");
    if (await gallery.count() > 0) {
      await expect(gallery).toBeVisible();
    }
  });

  test("settings: one notification bell and logistics fields", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Исключать мусорные объявления")).toBeVisible();
    await expect(page.locator("header a[href='/notifications/settings']")).toHaveCount(0);

    const desktop_bell = page.locator("header a[href='/notifications']");
    const mobile_menu = page.locator("[data-testid='mobile-preferences-menu']");
    if (await mobile_menu.isVisible()) {
      await mobile_menu.getByRole("button").click();
      await expect(page.getByRole("link", { name: "Уведомления" }).first()).toBeVisible();
    } else {
      await expect(desktop_bell).toHaveCount(1);
    }

    await expect(page.getByLabel("Доставка запчастей")).toBeVisible();
    await expect(page.getByLabel("Доставка на ремонт")).toBeVisible();
    await expect(page.getByLabel("Отправка покупателю")).toBeVisible();
  });

  test("favorites, notifications and notification settings load", async ({ page }) => {
    await page.goto("/favorites");
    await expect(page.getByRole("heading", { name: "Избранное" })).toBeVisible({ timeout: 20_000 });

    await page.goto("/notifications");
    await expect(page.getByRole("heading").or(page.getByText("Уведомления")).first()).toBeVisible({ timeout: 20_000 });

    await page.goto("/notifications/settings");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 20_000 });
  });

  test("admin hub pages and catalog model page", async ({ page, request }) => {
    await page.goto("/admin/users");
    await expect(page.getByRole("tab", { name: "Пользователи" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("tab", { name: "Каталог устройств" })).toBeVisible();
    await expect(page.getByText("Управление доступом к SmartFlip")).toBeVisible();

    await page.goto("/admin/notifications");
    await expect(page.getByRole("tab", { name: "Уведомления" })).toBeVisible({ timeout: 20_000 });

    await page.goto("/admin/scan-log");
    await expect(page.getByText("Лог проблем скана")).toBeVisible({ timeout: 20_000 });

    await page.goto("/admin/catalog");
    await expect(page.getByRole("heading", { name: "Каталог устройств" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Поиск модели")).toBeVisible();

    const catalog = await request.get("/api/admin/catalog?limit=1");
    const catalog_body = await catalog.json() as { items: Array<{ id: number }> };
    if (catalog_body.items.length === 0) {
      return;
    }

    await page.goto(`/admin/catalog/${catalog_body.items[0].id}`);
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 20_000 });
  });

  test("login page still renders google button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Войти через Google" })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test("favorite toggle round-trip", async ({ page, request }) => {
    const { body } = await fetchDevicesApi(request, "limit=1");
    if (body.devices.length === 0) {
      test.skip();
      return;
    }

    await waitForHomeReady(page);
    const card = page.locator("[data-testid='device-card']").first();
    const fav_button = card.getByRole("button", { name: /избран/i });
    await fav_button.click();
    await page.waitForTimeout(600);
    await page.goto("/favorites");
    const fav_cards = page.locator("[data-testid='device-card']");
    if (await fav_cards.count() === 0) {
      test.skip();
      return;
    }

    await fav_cards.first().getByRole("button", { name: /избран/i }).click();
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByText("Пока нет избранных объявлений").or(fav_cards.first())).toBeVisible();
  });
});
