"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEVICES_CHUNK_SIZE,
  fetchDevices,
  fetchScanStatus,
  type DevicesFilterMeta,
  type DevicesListResponse,
} from "@/shared/api/client";
import type { AnalyzedDevice } from "@/shared/api/client";
import type { DeviceFeedFilters, DeviceSortKey } from "@/shared/types/filters";
import { applyDealLogistics } from "@/shared/lib/deal-economics";
import { isAbortError, runLongPollLoop } from "@/shared/lib/long-poll-client";

interface DevicesFeedState {
  devices: AnalyzedDevice[];
  filter_meta: DevicesFilterMeta | null;
  scan_meta: Omit<DevicesListResponse, "devices" | "filter_meta" | "offset" | "limit" | "has_more" | "logistics"> & {
    scan_started_at?: string | null;
  } | null;
  total_count: number;
  loaded_count: number;
  initial_loading: boolean;
  loading_more: boolean;
  error: unknown;
  reload: () => Promise<void>;
  beginScan: () => void;
}

interface UseDevicesFeedOptions {
  favorites_only?: boolean;
  include_hidden?: boolean;
  filters?: DeviceFeedFilters;
  sort?: DeviceSortKey;
  page?: number;
  page_size?: number;
  load_all?: boolean;
  initial_feed?: DevicesListResponse | null;
}

function mapFeedDevices(feed: DevicesListResponse): AnalyzedDevice[] {
  return feed.devices.map((device) => applyDealLogistics(device, feed.logistics));
}

function toScanMeta(result: DevicesListResponse): DevicesFeedState["scan_meta"] {
  return {
    total_count: result.total_count,
    cached_at: result.cached_at,
    is_scanning: result.is_scanning,
    stage: result.stage,
    total_listings: result.total_listings,
    processed_listings: result.processed_listings,
    percent: result.percent,
    issues_count: result.issues_count,
    warnings_count: result.warnings_count,
    last_scan_id: result.last_scan_id,
    last_scan_status: result.last_scan_status ?? null,
    last_scan_error: result.last_scan_error ?? null,
    outcome_status: result.outcome_status ?? "ok",
    kept_previous_feed: result.kept_previous_feed ?? false,
    dashboard: result.dashboard,
    scan_started_at: null,
    feed_error: null,
  };
}

export function useDevicesFeed(options: UseDevicesFeedOptions = {}): DevicesFeedState {
  const initial_feed = options.initial_feed ?? null;
  const [devices, set_devices] = useState<AnalyzedDevice[]>(() => (
    initial_feed ? mapFeedDevices(initial_feed) : []
  ));
  const [filter_meta, set_filter_meta] = useState<DevicesFilterMeta | null>(initial_feed?.filter_meta ?? null);
  const [scan_meta, set_scan_meta] = useState<DevicesFeedState["scan_meta"]>(
    initial_feed ? toScanMeta(initial_feed) : null,
  );
  const [total_count, set_total_count] = useState(initial_feed?.total_count ?? 0);
  const [loaded_count, set_loaded_count] = useState(initial_feed?.devices.length ?? 0);
  const [initial_loading, set_initial_loading] = useState(!initial_feed);
  const [loading_more, set_loading_more] = useState(false);
  const [error, set_error] = useState<unknown>(null);
  const [is_scanning, set_is_scanning] = useState(Boolean(initial_feed?.is_scanning));
  const load_generation = useRef(0);
  const has_loaded_ref = useRef(Boolean(initial_feed));
  const skip_first_fetch_ref = useRef(Boolean(initial_feed));
  const scanning_ref = useRef(Boolean(initial_feed?.is_scanning));
  scanning_ref.current = is_scanning;

  const applyScanMeta = useCallback((result: DevicesListResponse) => {
    set_scan_meta(toScanMeta(result));
    set_is_scanning(result.is_scanning);
  }, []);

  const beginScan = useCallback(() => {
    set_is_scanning(true);
    set_scan_meta((prev) => ({
      total_count: prev?.total_count ?? 0,
      cached_at: prev?.cached_at ?? null,
      is_scanning: true,
      stage: "fetching_listings",
      total_listings: null,
      processed_listings: 0,
      percent: 1,
      issues_count: prev?.issues_count ?? 0,
      warnings_count: prev?.warnings_count ?? 0,
      last_scan_id: prev?.last_scan_id ?? null,
      last_scan_status: prev?.last_scan_status ?? null,
      last_scan_error: prev?.last_scan_error ?? null,
      outcome_status: prev?.outcome_status ?? "ok",
      kept_previous_feed: prev?.kept_previous_feed ?? false,
      dashboard: prev?.dashboard,
      scan_started_at: new Date().toISOString(),
      feed_error: null,
    }));
  }, []);

  const reload = useCallback(async () => {
    const generation = load_generation.current + 1;
    load_generation.current = generation;
    if (has_loaded_ref.current) set_loading_more(true);

    const page_size = options.page_size ?? DEVICES_CHUNK_SIZE;
    const page = Math.max(1, options.page ?? 1);
    const offset = options.load_all ? 0 : (page - 1) * page_size;
    const limit = options.load_all ? 200 : page_size;

    try {
      const result = await fetchDevices({
        offset,
        limit,
        include_meta: true,
        favorites_only: options.favorites_only,
        include_hidden: options.include_hidden,
        sort: options.sort,
        filters: options.filters,
      });

      if (load_generation.current !== generation) return;

      let next_devices = result.devices;
      let next_offset = offset + result.devices.length;
      let has_more = result.has_more;

      while (options.load_all && has_more && next_offset < result.total_count) {
        if (load_generation.current !== generation) return;
        const chunk = await fetchDevices({
          offset: next_offset,
          limit: DEVICES_CHUNK_SIZE,
          favorites_only: options.favorites_only,
          include_hidden: options.include_hidden,
          sort: options.sort,
          filters: options.filters,
        });
        if (load_generation.current !== generation) return;
        if (chunk.devices.length === 0) break;
        next_devices = [...next_devices, ...chunk.devices];
        next_offset += chunk.devices.length;
        has_more = chunk.has_more;
      }

      set_devices(next_devices.map((device) => applyDealLogistics(device, result.logistics)));
      if (result.filter_meta) set_filter_meta(result.filter_meta);
      set_total_count(result.total_count);
      set_loaded_count(next_devices.length);
      has_loaded_ref.current = true;
      applyScanMeta(result);
      set_error(null);
    } catch (caught) {
      if (load_generation.current !== generation) return;
      set_error(caught);
      const message = caught instanceof Error ? caught.message : "Не удалось загрузить ленту";
      set_scan_meta((prev) => prev
        ? { ...prev, feed_error: message }
        : {
          total_count: 0,
          cached_at: null,
          is_scanning: false,
          stage: null,
          total_listings: null,
          processed_listings: 0,
          percent: 0,
          issues_count: 0,
          warnings_count: 0,
          last_scan_id: null,
          last_scan_status: null,
          last_scan_error: null,
          outcome_status: "failed",
          kept_previous_feed: true,
          dashboard: undefined,
          scan_started_at: null,
          feed_error: message,
        });
    } finally {
      if (load_generation.current === generation) {
        set_initial_loading(false);
        set_loading_more(false);
      }
    }
  }, [
    applyScanMeta,
    options.favorites_only,
    options.filters,
    options.include_hidden,
    options.load_all,
    options.page,
    options.page_size,
    options.sort,
  ]);

  useEffect(() => {
    if (skip_first_fetch_ref.current) {
      skip_first_fetch_ref.current = false;
      return;
    }
    void reload();
  }, [reload]);

  useEffect(() => {
    const controller = new AbortController();
    let cursor = "";

    void runLongPollLoop({
      signal: controller.signal,
      poll: async (signal) => {
        const status = await fetchScanStatus({
          light: true,
          wait: true,
          cursor,
          signal,
        });
        if (signal.aborted) return;
        cursor = status.cursor ?? cursor;
        set_scan_meta((prev) => ({
          total_count: prev?.total_count ?? 0,
          cached_at: prev?.cached_at ?? null,
          is_scanning: status.is_scanning,
          stage: status.stage,
          total_listings: status.total_listings,
          processed_listings: status.processed_listings,
          percent: status.percent,
          issues_count: status.issues_count,
          warnings_count: status.warnings_count,
          last_scan_id: status.last_scan_id,
          last_scan_status: status.last_scan_status,
          last_scan_error: status.last_scan_error,
          outcome_status: status.outcome_status,
          kept_previous_feed: status.kept_previous_feed,
          dashboard: status.dashboard ?? prev?.dashboard,
          scan_started_at: status.scan_started_at ?? prev?.scan_started_at ?? null,
          feed_error: prev?.feed_error ?? null,
        }));
        const was_scanning = scanning_ref.current;
        scanning_ref.current = status.is_scanning;
        set_is_scanning(status.is_scanning);
        if (was_scanning && !status.is_scanning) {
          void reload();
        }
      },
    }).catch((error) => {
      if (!isAbortError(error)) {
        console.error("[scan-live] loop failed", error);
      }
    });

    return () => {
      controller.abort();
    };
  }, [reload]);

  return {
    devices,
    filter_meta,
    scan_meta,
    total_count,
    loaded_count,
    initial_loading,
    loading_more,
    error,
    reload,
    beginScan,
  };
}
