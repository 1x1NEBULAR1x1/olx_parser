import type { AnalyzedDevice, DevicesFilterMeta, ScanStage } from "./domain";

export interface DealLogistics {
  shipping_parts_pln: number;
  shipping_to_repair_pln: number;
  shipping_to_customer_pln: number;
  repair_labor_base_pln: number;
}

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
  last_scan_status?: string | null;
  last_scan_error?: string | null;
  outcome_status?: "ok" | "degraded" | "failed";
  kept_previous_feed?: boolean;
  feed_error?: string | null;
  dashboard?: ScanDashboardStats;
  favorite_ids?: number[];
  hidden_ids?: number[];
  logistics: DealLogistics;
}

export interface DeviceDetailResponse {
  device: AnalyzedDevice;
  logistics: DealLogistics;
}

export interface ScanDashboardLastScan {
  scan_id: string;
  finished_at: string;
  duration_sec: number | null;
  listings_total: number | null;
  devices_saved: number;
  yield_pct: number;
  issues_count: number;
  warnings_count: number;
  health_pct: number;
  status?: string;
  error_message?: string | null;
}

export interface ScanDashboardCache {
  model_cache_total: number;
  model_cache_fresh: number;
  parts_cache_total: number;
  parts_cache_fresh: number;
  catalog_total: number;
  catalog_ready: number;
  freshness_pct: number;
  cache_ttl_hours: number;
}

export interface ScanDashboardMarket {
  total_devices: number;
  damaged_count: number;
  undamaged_count: number;
  profitable_count: number;
  high_profit_count: number;
  negotiable_count: number;
  avg_profitability_pct: number | null;
  avg_price_pln: number | null;
  damaged_share_pct: number;
  profitable_share_pct: number;
  high_profit_share_pct: number;
}

export interface ScanDashboardStats {
  last_scan: ScanDashboardLastScan | null;
  cache: ScanDashboardCache;
  market: ScanDashboardMarket;
}

export interface ScanStatusResponse {
  is_scanning: boolean;
  scan_started_at: string | null;
  last_scan_finished_at: string | null;
  last_scan_status: string | null;
  last_scan_error: string | null;
  outcome_status: "ok" | "degraded" | "failed";
  kept_previous_feed: boolean;
  devices_count: number;
  stage: ScanStage | null;
  total_listings: number | null;
  processed_listings: number;
  percent: number;
  issues_count: number;
  warnings_count: number;
  last_scan_id: string | null;
  dashboard: ScanDashboardStats;
  cursor?: string;
  timed_out?: boolean;
}

export interface AppSettings {
  auto_scan_interval_minutes: number;
  cache_ttl_hours: number;
  shipping_parts_pln: number;
  shipping_to_repair_pln: number;
  shipping_to_customer_pln: number;
  repair_labor_base_pln: number;
  subscription_basic_pln: number;
  subscription_pro_pln: number;
  allegro_parts_auto_enabled: boolean;
  catalog_auto_enrich_interval_minutes: number;
  catalog_antibot_wait_seconds: number;
  catalog_antibot_retries: number;
  catalog_source_delay_ms: number;
}

export interface UserDisplaySettings {
  exclude_junk_listings: boolean;
  junk_min_release_year: number;
  exclude_iphone: boolean;
  exclude_android: boolean;
  battery_health_threshold_percent: number;
  exclude_unprofitable: boolean;
  min_profit_pln: number;
  min_profit_pct_of_price: number;
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
  user_id: string;
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
  source: "scan" | "test" | "scan_health";
  telegram_status: "skipped" | "sent" | "failed" | "not_configured";
  telegram_error: string | null;
  created_at: string;
}

export interface NotificationsWaitResponse {
  count: number;
  cursor: number;
  items: AppNotification[];
  timed_out: boolean;
}

export interface AdminNotificationLogRow extends AppNotification {
  user_email: string;
  user_name: string | null;
}

export interface AdminNotificationsPage {
  items: AdminNotificationLogRow[];
  total_count: number;
}

export interface AdminTestNotificationResult {
  notification_id: number;
  telegram_status: AppNotification["telegram_status"];
  telegram_error: string | null;
  user_email: string;
  telegram_configured: boolean;
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
