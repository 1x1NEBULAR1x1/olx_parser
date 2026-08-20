import type { AnalyzedDevice } from "@/shared/api/client";
import { filterDeviceFeed, sortDeviceFeed } from "@/shared/lib/device-feed-query";
import {
  DEVICE_SORT_OPTIONS,
  type DeviceFeedFilters,
  type DeviceSortKey,
} from "@/shared/types/filters";

export { DEVICE_SORT_OPTIONS };
export type { DeviceSortKey };

export function sortDevices(devices: AnalyzedDevice[], sort: DeviceSortKey): AnalyzedDevice[] {
  return sortDeviceFeed(devices, sort);
}

export function filterDevices(devices: AnalyzedDevice[], filters: DeviceFeedFilters): AnalyzedDevice[] {
  return filterDeviceFeed(devices, filters);
}
