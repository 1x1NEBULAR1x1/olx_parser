export interface AllegroPart {
  title: string;
  price: number | null;
  currency: string | null;
  url: string;
  image: string | null;
  damage_type?: string;
  is_estimate?: boolean;
}

export interface AnalyzedDevice {
  id: number;
  title: string;
  olx_url: string;
  price_buy: number | null;
  price_currency: string | null;
  is_negotiable: boolean | null;
  brand: string;
  model_query: string;
  model_key: string;
  model_label: string;
  model_line: string;
  model_line_label: string;
  photos: string[];
  city: string | null;
  region: string | null;
  created_at: string;
  release_year: number | null;
  has_box: boolean;
  battery_health_percent: number | null;
  storage_gb: number | null;

  seller_name: string | null;
  seller_ads_count: number | null;
  seller_member_since: string | null;

  damage_types: string[];
  post_summary: string;

  repairability_score: number | null;
  repairability_scale: number | null;
  ifixit_device_name: string | null;
  ifixit_url: string | null;

  allegro_parts: AllegroPart[];
  allegro_search_url: string | null;
  parts_cost_estimate: number | null;

  market_sell_price: number | null;
  market_sell_price_source: "model_median" | "cached_median" | "model_hint" | "brand_estimate" | null;
  profit_estimate: number | null;
  profitability_pct: number | null;

  liquidity_score: number | null;
  liquidity_label: string | null;

  is_favorite?: boolean;
  is_hidden?: boolean;

  last_analyzed_at: string;
}

export interface DevicesFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface BrandLineFilterGroup {
  line_value: string;
  line_label: string;
  line_count: number;
  models: DevicesFilterOption[];
}

export interface BrandFilterTreeNode {
  brand: string;
  label: string;
  count: number;
  lines: BrandLineFilterGroup[];
}

export interface DevicesFilterMeta {
  brand_options: DevicesFilterOption[];
  brand_tree: BrandFilterTreeNode[];
  models_by_brand: Record<string, DevicesFilterOption[]>;
  model_lines_by_brand: Record<string, DevicesFilterOption[]>;
  damage_type_counts: Record<string, number>;
  region_options: DevicesFilterOption[];
  price_bounds: [number, number];
  profitability_bounds: [number, number];
  year_bounds: [number, number];
}

export type ScanStage = "fetching_listings" | "analyzing" | "finalizing" | "saving";

export interface DevicesListResponse {
  devices: AnalyzedDevice[];
  total_count: number;
  offset: number;
  limit: number;
  has_more: boolean;
  filter_meta: DevicesFilterMeta | null;
  cached_at: string | null;
  is_scanning: boolean;
  stage: ScanStage | null;
  total_listings: number | null;
  processed_listings: number;
  percent: number;
  favorite_ids?: number[];
  hidden_ids?: number[];
}

export interface ScanStatusResponse {
  is_scanning: boolean;
  scan_started_at: string | null;
  last_scan_finished_at: string | null;
  devices_count: number;
  stage: ScanStage | null;
  total_listings: number | null;
  processed_listings: number;
  percent: number;
}

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

export interface AppSettings {
  battery_health_threshold_percent: number;
  auto_scan_interval_minutes: number;
  cache_ttl_hours: number;
}

export interface UserDisplaySettings {
  exclude_junk_listings: boolean;
  junk_min_release_year: number;
  exclude_iphone: boolean;
  exclude_android: boolean;
}

export interface SettingsResponse extends AppSettings, UserDisplaySettings {
  is_admin: boolean;
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

export interface NotificationSettings {
  enabled: boolean;
  brands: string[];
  model_keys: string[];
  min_profitability_pct: number | null;
  max_profitability_pct: number | null;
  min_price: number | null;
  max_price: number | null;
  regions: string[];
  telegram_configured: boolean;
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

export interface AppNotification {
  id: number;
  olx_listing_id: number;
  title: string;
  olx_url: string;
  price_buy: number | null;
  profitability_pct: number | null;
  market_sell_price: number | null;
  city: string | null;
  region: string | null;
  photo_url: string | null;
  is_read: boolean;
  created_at: string;
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

export interface UserListingIds {
  favorite_ids: number[];
  hidden_ids: number[];
}

export type UserListingAction = "favorite" | "unfavorite" | "hide" | "unhide";

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

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  is_approved: boolean;
  created_at: string;
  favorites_count: number;
  hidden_count: number;
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
