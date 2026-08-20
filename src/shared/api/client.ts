import type {
  AdminNotificationLogRow,
  AdminNotificationsPage,
  AdminScanIssueRow,
  AdminScanRunSummary,
  AdminTestNotificationResult,
  AdminUserRow,
  AnalyzedDevice,
  AppNotification,
  AppSettings,
  BrandFilterTreeNode,
  DeviceDetailResponse,
  DevicesListResponse,
  NotificationSettings,
  NotificationsWaitResponse,
  ScanStage,
  ScanStatusResponse,
  SettingsResponse,
  UserDisplaySettings,
  UserListingAction,
  UserListingIds,
} from "@/shared/types";
import { readJsonOrThrow } from "@/shared/lib/api-error";
import { appendDeviceFeedQuery } from "@/shared/lib/device-feed-query";
import type { DeviceFeedFilters, DeviceSortKey } from "@/shared/types/filters";

export type {
  AdminNotificationLogRow,
  AdminNotificationsPage,
  AdminScanIssueRow,
  AdminScanRunSummary,
  AdminTestNotificationResult,
  AdminUserRow,
  AnalyzedDevice,
  AppNotification,
  AppSettings,
  BrandFilterTreeNode,
  DeviceDetailResponse,
  DevicesListResponse,
  NotificationSettings,
  NotificationsWaitResponse,
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
  sort?: DeviceSortKey;
  filters?: DeviceFeedFilters;
}

export async function fetchDevices(params: FetchDevicesParams = {}): Promise<DevicesListResponse> {
  const search = new URLSearchParams();
  appendDeviceFeedQuery(search, {
    offset: params.offset,
    limit: params.limit,
    sort: params.sort,
    include_meta: params.include_meta,
    filters: params.filters,
  });
  if (params.favorites_only) search.set("favorites_only", "1");
  if (params.include_hidden) search.set("include_hidden", "1");

  const query = search.toString();
  const url = query ? `${API_BASE}/devices?${query}` : `${API_BASE}/devices`;
  const res = await fetch(url);
  return readJsonOrThrow<DevicesListResponse>(res);
}

export async function fetchDevice(id: number): Promise<DeviceDetailResponse> {
  const res = await fetch(`${API_BASE}/devices/${id}`);
  const body = await readJsonOrThrow<DeviceDetailResponse | AnalyzedDevice>(res);
  if ("device" in body && "logistics" in body) {
    return body;
  }
  return {
    device: body,
    logistics: {
      shipping_parts_pln: 0,
      shipping_to_repair_pln: 0,
      shipping_to_customer_pln: 0,
      repair_labor_base_pln: 0,
    },
  };
}

export async function refreshDeviceListingSignals(id: number): Promise<AnalyzedDevice> {
  const res = await fetch(`${API_BASE}/devices/${id}/listing-signals`, { method: "POST" });
  const body = await readJsonOrThrow<{ device: AnalyzedDevice }>(res);
  return body.device;
}

export async function fetchScanStatus(options?: {
  light?: boolean;
  wait?: boolean;
  cursor?: string;
  signal?: AbortSignal;
}): Promise<ScanStatusResponse> {
  const search = new URLSearchParams();
  if (options?.light) search.set("light", "1");
  if (options?.wait) search.set("wait", "1");
  if (options?.cursor) search.set("cursor", options.cursor);
  const query = search.toString();
  const res = await fetch(`${API_BASE}/scan/status${query ? `?${query}` : ""}`, {
    signal: options?.signal,
  });
  return readJsonOrThrow<ScanStatusResponse>(res);
}

export async function startScan(): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/scan/start`, { method: "POST" });
  return readJsonOrThrow<{ message: string }>(res);
}

export async function fetchSettings(): Promise<SettingsResponse> {
  const res = await fetch(`${API_BASE}/settings`);
  return readJsonOrThrow<SettingsResponse>(res);
}

export async function updateSettings(patch: Partial<SettingsResponse>): Promise<SettingsResponse> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return readJsonOrThrow<SettingsResponse>(res);
}

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const res = await fetch(`${API_BASE}/notification-settings`);
  return readJsonOrThrow<NotificationSettings>(res);
}

export async function updateNotificationSettings(
  patch: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const res = await fetch(`${API_BASE}/notification-settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return readJsonOrThrow<NotificationSettings>(res);
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const res = await fetch(`${API_BASE}/notifications`);
  const body = await readJsonOrThrow<{ notifications: AppNotification[] }>(res);
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
  const body = await readJsonOrThrow<{ count: number }>(res);
  return body.count;
}

export async function waitNotifications(params: {
  cursor: number;
  count: number;
  signal?: AbortSignal;
}): Promise<NotificationsWaitResponse> {
  const search = new URLSearchParams({
    wait: "1",
    cursor: String(params.cursor),
    count: String(params.count),
  });
  const res = await fetch(`${API_BASE}/notifications/unread-count?${search.toString()}`, {
    signal: params.signal,
  });
  return readJsonOrThrow<NotificationsWaitResponse>(res);
}

export async function fetchAdminNotifications(params: {
  offset?: number;
  limit?: number;
  user_id?: string;
  source?: "scan" | "test" | "scan_health";
}): Promise<AdminNotificationsPage> {
  const search = new URLSearchParams();
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.user_id) search.set("user_id", params.user_id);
  if (params.source) search.set("source", params.source);
  const res = await fetch(`${API_BASE}/admin/notifications?${search.toString()}`);
  return readJsonOrThrow<AdminNotificationsPage>(res);
}

export async function sendAdminTestNotification(body: {
  user_id: string;
  send_telegram?: boolean;
}): Promise<AdminTestNotificationResult> {
  const res = await fetch(`${API_BASE}/admin/notifications/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJsonOrThrow<AdminTestNotificationResult>(res);
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
  return readJsonOrThrow<UserListingIds>(res);
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const res = await fetch(`${API_BASE}/admin/users`);
  const body = await readJsonOrThrow<{ users: AdminUserRow[] }>(res);
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
  const body = await readJsonOrThrow<{ user: AdminUserRow }>(res);
  return body.user;
}

export async function fetchAdminScans(): Promise<AdminScanRunSummary[]> {
  const res = await fetch(`${API_BASE}/admin/scans`);
  const body = await readJsonOrThrow<{ scans: AdminScanRunSummary[] }>(res);
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
  return readJsonOrThrow<{ items: AdminScanIssueRow[]; total_count: number }>(res);
}

export type {
  CatalogEnrichmentStatusResponse,
  CatalogManualJobProgress,
  CatalogModelLineOption,
  CatalogPartsCacheRow,
  CatalogStorageStat,
  DeviceCatalogDetailResponse,
  DeviceCatalogIdsResponse,
  DeviceCatalogListResponse,
  DeviceCatalogPatch,
  DeviceCatalogRow,
} from "@/shared/types/catalog";

export async function fetchAdminCatalog(params: {
  offset?: number;
  limit?: number;
  brand?: string;
  model_line?: string;
  status?: string;
  search?: string;
}): Promise<import("@/shared/types/catalog").DeviceCatalogListResponse> {
  const search = new URLSearchParams();
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.brand) search.set("brand", params.brand);
  if (params.model_line) search.set("model_line", params.model_line);
  if (params.status) search.set("status", params.status);
  if (params.search) search.set("search", params.search);

  const res = await fetch(`${API_BASE}/admin/catalog?${search.toString()}`);
  return readJsonOrThrow<import("@/shared/types/catalog").DeviceCatalogListResponse>(res);
}

export async function fetchAdminCatalogIds(params: {
  brand?: string;
  model_line?: string;
  status?: string;
  search?: string;
}): Promise<import("@/shared/types/catalog").DeviceCatalogIdsResponse> {
  const search = new URLSearchParams();
  search.set("ids_only", "1");
  if (params.brand) search.set("brand", params.brand);
  if (params.model_line) search.set("model_line", params.model_line);
  if (params.status) search.set("status", params.status);
  if (params.search) search.set("search", params.search);

  const res = await fetch(`${API_BASE}/admin/catalog?${search.toString()}`);
  return readJsonOrThrow<import("@/shared/types/catalog").DeviceCatalogIdsResponse>(res);
}

export async function fetchAdminCatalogDetail(
  id: number,
  filters?: {
    brand?: string;
    model_line?: string;
    status?: string;
    search?: string;
  },
): Promise<import("@/shared/types/catalog").DeviceCatalogDetailResponse> {
  const search = new URLSearchParams();
  if (filters?.brand) search.set("brand", filters.brand);
  if (filters?.model_line) search.set("model_line", filters.model_line);
  if (filters?.status) search.set("status", filters.status);
  if (filters?.search) search.set("search", filters.search);
  const query = search.toString();
  const res = await fetch(`${API_BASE}/admin/catalog/${id}${query ? `?${query}` : ""}`);
  return readJsonOrThrow<import("@/shared/types/catalog").DeviceCatalogDetailResponse>(res);
}

export async function patchAdminCatalogEntry(
  id: number,
  patch: import("@/shared/types/catalog").DeviceCatalogPatch,
): Promise<import("@/shared/types/catalog").DeviceCatalogRow> {
  const res = await fetch(`${API_BASE}/admin/catalog/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await readJsonOrThrow<{ item: import("@/shared/types/catalog").DeviceCatalogRow }>(res);
  return body.item;
}

export async function syncAdminCatalog(): Promise<{ synced: number; message: string }> {
  const res = await fetch(`${API_BASE}/admin/catalog/sync`, { method: "POST" });
  return readJsonOrThrow<{ synced: number; message: string }>(res);
}

export async function enrichAdminCatalog(body: {
  entry_ids?: number[];
  only_pending?: boolean;
}): Promise<{ started: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/admin/catalog/enrich`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJsonOrThrow<{ started: boolean; message: string }>(res);
}

export async function fetchCatalogEnrichmentStatus(options?: {
  wait?: boolean;
  cursor?: string;
  signal?: AbortSignal;
}): Promise<import("@/shared/types/catalog").CatalogEnrichmentStatusResponse> {
  const search = new URLSearchParams();
  if (options?.wait) search.set("wait", "1");
  if (options?.cursor) search.set("cursor", options.cursor);
  const query = search.toString();
  const res = await fetch(`${API_BASE}/admin/catalog/enrich/status${query ? `?${query}` : ""}`, {
    signal: options?.signal,
  });
  return readJsonOrThrow<import("@/shared/types/catalog").CatalogEnrichmentStatusResponse>(res);
}

export async function fetchAdminCatalogParts(
  entry_id: number,
  body: import("@/shared/types/catalog").ManualPartsFetchRequest = {},
): Promise<import("@/shared/types/catalog").ManualPartsFetchResponse> {
  const res = await fetch(`${API_BASE}/admin/catalog/${entry_id}/fetch-parts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJsonOrThrow<import("@/shared/types/catalog").ManualPartsFetchResponse>(res);
}
