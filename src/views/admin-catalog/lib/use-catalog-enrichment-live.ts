"use client";

import { useEffect, useState } from "react";
import { fetchCatalogEnrichmentStatus } from "@/shared/api/client";
import { isAbortError, runLongPollLoop } from "@/shared/lib/long-poll-client";
import type { CatalogEnrichmentStatusResponse } from "@/shared/types/catalog";

export function useCatalogEnrichmentLive(): CatalogEnrichmentStatusResponse | null {
  const [status, set_status] = useState<CatalogEnrichmentStatusResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cursor = "";

    void runLongPollLoop({
      signal: controller.signal,
      poll: async (signal) => {
        const next_status = await fetchCatalogEnrichmentStatus({
          wait: true,
          cursor,
          signal,
        });
        if (signal.aborted) return;
        cursor = next_status.cursor ?? cursor;
        set_status(next_status);
      },
    }).catch((error) => {
      if (!isAbortError(error)) {
        console.error("[catalog-enrich] loop failed", error);
      }
    });

    return () => controller.abort();
  }, []);

  return status;
}
