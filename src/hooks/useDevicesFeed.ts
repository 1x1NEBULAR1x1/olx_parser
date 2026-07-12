"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEVICES_CHUNK_SIZE,
  DEVICES_INITIAL_CHUNK,
  fetchDevices,
  fetchScanStatus,
  type DevicesFilterMeta,
  type DevicesListResponse,
} from "@/lib/api";
import type { AnalyzedDevice } from "@/lib/api";

interface DevicesFeedState {
  devices: AnalyzedDevice[];
  filter_meta: DevicesFilterMeta | null;
  scan_meta: Omit<DevicesListResponse, "devices" | "filter_meta" | "offset" | "limit" | "has_more"> | null;
  total_count: number;
  loaded_count: number;
  initial_loading: boolean;
  loading_more: boolean;
  reload: () => Promise<void>;
}

interface UseDevicesFeedOptions {
  favorites_only?: boolean;
  include_hidden?: boolean;
}

export function useDevicesFeed(options: UseDevicesFeedOptions = {}): DevicesFeedState {
  const [devices, set_devices] = useState<AnalyzedDevice[]>([]);
  const [filter_meta, set_filter_meta] = useState<DevicesFilterMeta | null>(null);
  const [scan_meta, set_scan_meta] = useState<DevicesFeedState["scan_meta"]>(null);
  const [total_count, set_total_count] = useState(0);
  const [loaded_count, set_loaded_count] = useState(0);
  const [initial_loading, set_initial_loading] = useState(true);
  const [loading_more, set_loading_more] = useState(false);
  const [is_scanning, set_is_scanning] = useState(false);
  const load_generation = useRef(0);

  const applyScanMeta = useCallback((result: DevicesListResponse) => {
    set_scan_meta({
      total_count: result.total_count,
      cached_at: result.cached_at,
      is_scanning: result.is_scanning,
      stage: result.stage,
      total_listings: result.total_listings,
      processed_listings: result.processed_listings,
      percent: result.percent,
    });
    set_is_scanning(result.is_scanning);
  }, []);

  const loadRemainingChunks = useCallback(async (start_offset: number, total: number, generation: number) => {
    set_loading_more(true);
    let offset = start_offset;

    try {
      while (offset < total) {
        if (load_generation.current !== generation) return;

        const chunk = await fetchDevices({
          offset,
          limit: DEVICES_CHUNK_SIZE,
          favorites_only: options.favorites_only,
          include_hidden: options.include_hidden,
        });

        if (load_generation.current !== generation) return;

        set_devices((prev) => [...prev, ...chunk.devices]);
        offset += chunk.devices.length;
        set_loaded_count(offset);
        applyScanMeta(chunk);

        if (!chunk.has_more || chunk.devices.length === 0) break;
      }
    } finally {
      if (load_generation.current === generation) {
        set_loading_more(false);
      }
    }
  }, [applyScanMeta, options.favorites_only, options.include_hidden]);

  const reload = useCallback(async () => {
    const generation = load_generation.current + 1;
    load_generation.current = generation;
    set_loading_more(false);

    try {
      const first_chunk = await fetchDevices({
        offset: 0,
        limit: DEVICES_INITIAL_CHUNK,
        include_meta: true,
        favorites_only: options.favorites_only,
        include_hidden: options.include_hidden,
      });

      if (load_generation.current !== generation) return;

      set_devices(first_chunk.devices);
      set_filter_meta(first_chunk.filter_meta);
      set_total_count(first_chunk.total_count);
      set_loaded_count(first_chunk.devices.length);
      applyScanMeta(first_chunk);

      if (first_chunk.has_more) {
        void loadRemainingChunks(first_chunk.devices.length, first_chunk.total_count, generation);
      }
    } catch {
      // Сервер недоступен — оставляем предыдущие данные.
    } finally {
      if (load_generation.current === generation) {
        set_initial_loading(false);
      }
    }
  }, [applyScanMeta, loadRemainingChunks, options.favorites_only, options.include_hidden]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!is_scanning) return;

    const interval = setInterval(() => {
      void (async () => {
        try {
          const status = await fetchScanStatus();
          set_scan_meta((prev) => ({
            total_count: prev?.total_count ?? 0,
            cached_at: prev?.cached_at ?? null,
            is_scanning: status.is_scanning,
            stage: status.stage,
            total_listings: status.total_listings,
            processed_listings: status.processed_listings,
            percent: status.percent,
          }));
          set_is_scanning(status.is_scanning);
          if (!status.is_scanning) {
            void reload();
          }
        } catch {
          // Временная недоступность API — повторим на следующем тике.
        }
      })();
    }, 2000);

    return () => clearInterval(interval);
  }, [is_scanning, reload]);

  return {
    devices,
    filter_meta,
    scan_meta,
    total_count,
    loaded_count,
    initial_loading,
    loading_more,
    reload,
  };
}
