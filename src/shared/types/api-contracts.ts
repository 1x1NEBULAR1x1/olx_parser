import type { AnalyzedDevice, DevicesFilterMeta, ScanStage } from "./domain";

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
  issues_count: number;
  warnings_count: number;
  last_scan_id: string | null;
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
  issues_count: number;
  warnings_count: number;
  last_scan_id: string | null;
}

export interface AppSettings {
  auto_scan_interval_minutes: number;
  cache_ttl_hours: number;
}

export interface UserDisplaySettings {
  exclude_junk_listings: boolean;
  junk_min_release_year: number;
  exclude_iphone: boolean;
  exclude_android: boolean;
  battery_health_threshold_percent: number;
}

export interface SettingsResponse extends AppSettings, UserDisplaySettings {
  is_admin: boolean;
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

export interface UserListingIds {
  favorite_ids: number[];
  hidden_ids: number[];
}

export type UserListingAction = "favorite" | "unfavorite" | "hide" | "unhide";

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

export interface AdminScanRunSummary {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  devices_count: number;
  issues_count: number;
  warnings_count: number;
}

export interface AdminScanIssueRow {
  id: number;
  scan_id: string;
  listing_id: number | null;
  olx_url: string | null;
  title: string | null;
  severity: "error" | "warning";
  kind: string;
  message: string;
  created_at: string;
}

export interface PartsCostCacheEntry {
  parts: import("./domain").AllegroPart[];
  search_url: string | null;
}
