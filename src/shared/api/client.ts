import type {
  AdminScanIssueRow,
  AdminScanRunSummary,
  AdminUserRow,
  AnalyzedDevice,
  AppNotification,
  AppSettings,
  BrandFilterTreeNode,
  DevicesListResponse,
  NotificationSettings,
  ScanStage,
  ScanStatusResponse,
  SettingsResponse,
  UserDisplaySettings,
  UserListingAction,
  UserListingIds,
} from "@/shared/types";

export type {
  AdminScanIssueRow,
  AdminScanRunSummary,
  AdminUserRow,
  AnalyzedDevice,
  AppNotification,
  AppSettings,
  BrandFilterTreeNode,
  DevicesListResponse,
  NotificationSettings,
  ScanStage,
  ScanStatusResponse,
  SettingsResponse,
  UserDisplaySettings,
  UserListingAction,
  UserListingIds,
};

export type { AllegroPart, DevicesFilterMeta, DevicesFilterOption } from "@/shared/types";

const API_BASE = "/api";

export const DEVICES_INITIAL_CHUNK = 50;
export const DEVICES_CHUNK_SIZE = 50;

export interface FetchDevicesParams {
  offset?: number;
  limit?: number;
  include_meta?: boolean;
  favorites_only?: boolean;
  include_hidden?: boolean;
}

export async function fetchDevices(params: FetchDevicesParams = {}): Promise<DevicesListResponse> {
  const search = new URLSearchParams();
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.include_meta) search.set("meta", "1");
  if (params.favorites_only) search.set("favorites_only", "1");
  if (params.include_hidden) search.set("include_hidden", "1");

  const query = search.toString();
  const url = query ? `${API_BASE}/devices?${query}` : `${API_BASE}/devices`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<DevicesListResponse>;
}

export async function fetchDevice(id: number): Promise<AnalyzedDevice> {
  const res = await fetch(`${API_BASE}/devices/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<AnalyzedDevice>;
}

export async function fetchScanStatus(): Promise<ScanStatusResponse> {
  const res = await fetch(`${API_BASE}/scan/status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ScanStatusResponse>;
}

export async function startScan(): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/scan/start`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json() as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ message: string }>;
}

export async function fetchSettings(): Promise<SettingsResponse> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<SettingsResponse>;
}

export async function updateSettings(patch: Partial<SettingsResponse>): Promise<SettingsResponse> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json() as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<SettingsResponse>;
}

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const res = await fetch(`${API_BASE}/notification-settings`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<NotificationSettings>;
}

export async function updateNotificationSettings(
  patch: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const res = await fetch(`${API_BASE}/notification-settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json() as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<NotificationSettings>;
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const res = await fetch(`${API_BASE}/notifications`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json() as { notifications: AppNotification[] };
  return body.notifications;
}

export async function markNotificationsRead(): Promise<void> {
  await fetch(`${API_BASE}/notifications`, { method: "PATCH" });
}

export async function clearAllNotifications(): Promise<void> {
  await fetch(`${API_BASE}/notifications`, { method: "DELETE" });
}

export async function fetchUnreadNotificationsCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/notifications/unread-count`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json() as { count: number };
  return body.count;
}

export async function updateUserListingAction(
  device_id: number,
  action: UserListingAction,
): Promise<UserListingIds> {
  const res = await fetch(`${API_BASE}/user/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id, action }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<UserListingIds>;
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const res = await fetch(`${API_BASE}/admin/users`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json() as { users: AdminUserRow[] };
  return body.users;
}

export async function patchAdminUser(
  user_id: string,
  patch: { is_approved?: boolean; role?: string },
): Promise<AdminUserRow> {
  const res = await fetch(`${API_BASE}/admin/users/${user_id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json() as { user: AdminUserRow };
  return body.user;
}

export async function fetchAdminScans(): Promise<AdminScanRunSummary[]> {
  const res = await fetch(`${API_BASE}/admin/scans`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json() as { scans: AdminScanRunSummary[] };
  return body.scans;
}

export async function fetchAdminScanIssues(params: {
  scan_id: string;
  severity?: "error" | "warning";
  offset?: number;
  limit?: number;
}): Promise<{ items: AdminScanIssueRow[]; total_count: number }> {
  const search = new URLSearchParams({ scan_id: params.scan_id });
  if (params.severity) search.set("severity", params.severity);
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  if (params.limit !== undefined) search.set("limit", String(params.limit));

  const res = await fetch(`${API_BASE}/admin/scan-issues?${search.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ items: AdminScanIssueRow[]; total_count: number }>;
}
