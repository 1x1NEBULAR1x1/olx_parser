import { expect, test } from "@playwright/test";
import { fetchDevicesApi } from "./helpers";

test.describe("API contracts", () => {
  test("health is ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    const body = await response.json() as { status: string };
    expect(body.status).toBe("ok");
  });

  test("devices list returns logistics and profit fields", async ({ request }) => {
    const { status, body } = await fetchDevicesApi(request, "limit=8&meta=1");
    expect(status).toBe(200);
    expect(body.logistics).toEqual(expect.objectContaining({
      shipping_parts_pln: expect.any(Number),
      shipping_to_repair_pln: expect.any(Number),
      shipping_to_customer_pln: expect.any(Number),
      repair_labor_base_pln: expect.any(Number),
    }));
    expect(Array.isArray(body.devices)).toBeTruthy();
    expect(typeof body.total_count).toBe("number");

    if (body.devices.length > 0) {
      const device = body.devices[0];
      expect(device).toEqual(expect.objectContaining({
        id: expect.any(Number),
        title: expect.any(String),
        brand: expect.any(String),
      }));
      expect("profit_estimate" in device).toBeTruthy();
      expect("risk_adjusted_profit" in device).toBeTruthy();
    }
  });

  test("device detail returns device + logistics", async ({ request }) => {
    const { body } = await fetchDevicesApi(request, "limit=1");
    if (body.devices.length === 0) {
      test.skip();
      return;
    }

    const response = await request.get(`/api/devices/${body.devices[0].id}`);
    expect(response.ok()).toBeTruthy();
    const detail = await response.json() as {
      device: { id: number; title: string };
      logistics: { shipping_parts_pln: number };
    };
    expect(detail.device.id).toBe(body.devices[0].id);
    expect(detail.device.title).toBeTruthy();
    expect(typeof detail.logistics.shipping_parts_pln).toBe("number");
  });

  test("settings expose logistics and admin flag", async ({ request }) => {
    const response = await request.get("/api/settings");
    expect(response.ok()).toBeTruthy();
    const settings = await response.json() as {
      is_admin: boolean;
      shipping_parts_pln: number;
      exclude_junk_listings: boolean;
    };
    expect(settings.is_admin).toBe(true);
    expect(typeof settings.shipping_parts_pln).toBe("number");
    expect(typeof settings.exclude_junk_listings).toBe("boolean");
  });

  test("scan status, notifications and admin catalog respond", async ({ request }) => {
    const [scan, notifications, notification_settings, catalog, users, admin_notifications] = await Promise.all([
      request.get("/api/scan/status"),
      request.get("/api/notifications"),
      request.get("/api/notification-settings"),
      request.get("/api/admin/catalog?limit=10"),
      request.get("/api/admin/users"),
      request.get("/api/admin/notifications?limit=10"),
    ]);

    expect(scan.ok()).toBeTruthy();
    expect(notifications.ok()).toBeTruthy();
    expect(notification_settings.ok()).toBeTruthy();
    expect(catalog.ok()).toBeTruthy();
    expect(users.ok()).toBeTruthy();
    expect(admin_notifications.ok()).toBeTruthy();

    const scan_body = await scan.json() as { is_scanning: boolean; dashboard?: unknown };
    expect(typeof scan_body.is_scanning).toBe("boolean");

    const catalog_body = await catalog.json() as { items: unknown[]; total_count: number };
    expect(Array.isArray(catalog_body.items)).toBeTruthy();
    expect(typeof catalog_body.total_count).toBe("number");
  });

  test("price_asc sort is monotonic when prices exist", async ({ request }) => {
    const { body } = await fetchDevicesApi(request, "limit=20&sort=price_asc");
    if (body.devices.length < 2) {
      test.skip();
      return;
    }

    const prices = body.devices
      .map((device) => device.price_buy)
      .filter((price): price is number => price !== null);
    if (prices.length < 2) {
      test.skip();
      return;
    }

    const sorted = [...prices].sort((a, b) => a - b);
    expect(prices).toEqual(sorted);
  });

  test("brand filter narrows the feed", async ({ request }) => {
    const { body } = await fetchDevicesApi(request, "limit=5&meta=1");
    const brand = body.filter_meta?.brand_tree?.[0]?.brand;
    if (!brand) {
      test.skip();
      return;
    }

    const filtered = await fetchDevicesApi(request, `limit=50&brands=${encodeURIComponent(brand)}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.devices.every((device) => device.brand === brand)).toBeTruthy();
  });
});
