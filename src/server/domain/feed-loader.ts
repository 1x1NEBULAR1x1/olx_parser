import { getSessionUser } from "@/server/auth/auth-guards";
import { getLatestDevicesPage, getDeviceById, getAppSettings, toLogisticsSettings } from "@/server/repositories/devices-repository";
import { getScanStatus } from "@/server/scan/scan-manager";
import { getUserListingIds } from "@/server/repositories/user-listings-repository";
import { getUserDisplaySettings } from "@/server/repositories/user-display-settings-repository";
import { parseDeviceFeedPageQuery } from "@/shared/lib/device-feed-query";
import type { DeviceDetailResponse, DevicesListResponse } from "@/shared/types/api-contracts";
import type { DeviceFeedPageQuery } from "@/shared/lib/device-feed-query";
import { DEFAULT_DEVICE_FEED_FILTERS, DEFAULT_DEVICE_SORT } from "@/shared/types/filters";

const DEFAULT_LIMIT = 24;

export interface LoadDevicesFeedOptions {
  favorites_only?: boolean;
  include_hidden?: boolean;
}

export function searchParamsRecordToURLSearchParams(
  params: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else if (value !== undefined) {
      search.set(key, value);
    }
  }
  return search;
}

export async function loadDevicesFeed(
  user_id: string,
  query: DeviceFeedPageQuery,
  options: LoadDevicesFeedOptions = {},
): Promise<DevicesListResponse> {
  const listing_ids = await getUserListingIds(user_id);
  const display_settings = await getUserDisplaySettings(user_id);

  const [page, scan_status, app_settings] = await Promise.all([
    getLatestDevicesPage(query.offset, query.limit, query.include_meta, {
      hidden_device_ids: listing_ids.hidden_ids,
      favorite_device_ids: listing_ids.favorite_ids,
      favorites_only: options.favorites_only,
      include_hidden: options.include_hidden,
      display_settings,
      sort: query.sort,
      filters: query.filters,
    }),
    getScanStatus(),
    getAppSettings(),
  ]);

  return {
    devices: page.devices,
    total_count: page.total_count,
    offset: page.offset,
    limit: page.limit,
    has_more: page.has_more,
    filter_meta: page.filter_meta,
    cached_at: page.cached_at,
    is_scanning: scan_status.is_scanning,
    stage: scan_status.stage as DevicesListResponse["stage"],
    total_listings: scan_status.total_listings,
    processed_listings: scan_status.processed_listings,
    percent: scan_status.percent,
    issues_count: scan_status.issues_count,
    warnings_count: scan_status.warnings_count,
    last_scan_id: scan_status.last_scan_id,
    last_scan_status: scan_status.last_scan_status,
    last_scan_error: scan_status.last_scan_error,
    outcome_status: scan_status.outcome_status,
    kept_previous_feed: scan_status.kept_previous_feed,
    dashboard: scan_status.dashboard,
    favorite_ids: listing_ids.favorite_ids,
    hidden_ids: listing_ids.hidden_ids,
    logistics: toLogisticsSettings(app_settings),
  };
}

export async function loadHomeFeedFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): Promise<DevicesListResponse | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const search = searchParamsRecordToURLSearchParams(params);
  const query = parseDeviceFeedPageQuery(search, { offset: 0, limit: DEFAULT_LIMIT });
  query.include_meta = true;
  return loadDevicesFeed(user.id, query);
}

export async function loadFavoritesFeed(): Promise<DevicesListResponse | null> {
  const user = await getSessionUser();
  if (!user) return null;

  return loadDevicesFeed(user.id, {
    offset: 0,
    limit: 200,
    sort: DEFAULT_DEVICE_SORT,
    filters: DEFAULT_DEVICE_FEED_FILTERS,
    include_meta: false,
  }, { favorites_only: true });
}

export async function loadDeviceDetail(device_id: number): Promise<DeviceDetailResponse | null> {
  const user = await getSessionUser();
  if (!user || Number.isNaN(device_id)) return null;

  const listing_ids = await getUserListingIds(user.id);
  const display_settings = await getUserDisplaySettings(user.id);
  const [device, app_settings] = await Promise.all([
    getDeviceById(device_id, {
      favorite_ids: new Set(listing_ids.favorite_ids),
      hidden_ids: new Set(listing_ids.hidden_ids),
    }, display_settings),
    getAppSettings(),
  ]);

  if (!device) return null;

  return {
    device,
    logistics: toLogisticsSettings(app_settings),
  };
}
