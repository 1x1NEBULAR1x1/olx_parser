"use client";

export interface ToastNotificationPayload {
  id: number;
  title: string;
  body: string;
  url: string;
  photo_url: string | null;
  olx_url: string | null;
  price_buy: number | null;
  profitability_pct: number | null;
}

function urlBase64ToUint8Array(base64_string: string): Uint8Array {
  const padding = "=".repeat((4 - (base64_string.length % 4)) % 4);
  const base64 = (base64_string + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (error) {
    console.error("[push] SW register failed:", error);
    return null;
  }
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  const res = await fetch("/api/push/vapid-public-key");
  if (!res.ok) return null;
  const body = await res.json() as { configured: boolean; public_key: string | null };
  return body.configured ? body.public_key : null;
}

export async function subscribeToPush(): Promise<"subscribed" | "denied" | "unsupported" | "not_configured"> {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }

  const public_key = await fetchVapidPublicKey();
  if (!public_key) return "not_configured";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const registration = await registerServiceWorker();
  if (!registration) return "unsupported";

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing
    ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(public_key) as BufferSource,
    });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return "unsupported";
  }

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });
  if (!res.ok) throw new Error(`subscribe HTTP ${res.status}`);
  return "subscribed";
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);

  await subscription.unsubscribe().catch(() => undefined);
}

export async function getPushPermissionState(): Promise<"granted" | "denied" | "default" | "unsupported"> {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}
