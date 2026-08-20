/* SmartFlip service worker — Web Push + клик по уведомлению.
 * Онлайн (есть focused client): postMessage → in-app тост.
 * Офлайн / фон: OS Notification.
 */
/* eslint-disable no-restricted-globals */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "SmartFlip",
    body: "",
    url: "/notifications",
    notification_id: 0,
    olx_url: null,
    photo_url: null,
    price_buy: null,
    profitability_pct: null,
  };

  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    // keep defaults
  }

  event.waitUntil(
    (async () => {
      const clients_list = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const has_visible = clients_list.some(
        (client) => client.visibilityState === "visible" || client.focused,
      );

      if (has_visible) {
        for (const client of clients_list) {
          client.postMessage({ type: "SMARTFLIP_TOAST", payload });
        }
        return;
      }

      await self.registration.showNotification(payload.title || "SmartFlip", {
        body: payload.body || "",
        data: {
          url: payload.url || "/notifications",
          olx_url: payload.olx_url,
          notification_id: payload.notification_id,
        },
        tag: payload.notification_id
          ? `smartflip-${payload.notification_id}`
          : `smartflip-${Date.now()}`,
        renotify: true,
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target_url =
    (event.notification.data && event.notification.data.url) || "/notifications";

  event.waitUntil(
    (async () => {
      const clients_list = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients_list) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && typeof client.navigate === "function") {
            try {
              await client.navigate(target_url);
            } catch {
              // ignore
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target_url);
    })(),
  );
});
