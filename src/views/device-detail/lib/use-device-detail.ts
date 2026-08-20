"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchDevice, refreshDeviceListingSignals } from "@/shared/api/client";
import { getErrorCopy } from "@/shared/lib/api-error";
import type { AnalyzedDevice, DeviceDetailResponse } from "@/shared/api/client";
import { applyDealLogistics, type DealLogistics } from "@/shared/lib/deal-economics";

export function useDeviceDetail(
  id: string | undefined,
  initial?: DeviceDetailResponse | null,
) {
  const te = useTranslations("errors");
  const [device, set_device] = useState<AnalyzedDevice | null>(() => (
    initial ? applyDealLogistics(initial.device, initial.logistics) : null
  ));
  const [logistics, set_logistics] = useState<DealLogistics | null>(initial?.logistics ?? null);
  const [loading, set_loading] = useState(!initial);
  const [signals_loading, set_signals_loading] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    if (initial && String(initial.device.id) === id) {
      if (!initial.device.post_summary || !initial.device.seller_name) {
        set_signals_loading(true);
        void refreshDeviceListingSignals(initial.device.id)
          .then((updated) => {
            set_device(applyDealLogistics(updated, initial.logistics));
          })
          .catch(() => undefined)
          .finally(() => set_signals_loading(false));
      }
      return;
    }

    fetchDevice(Number(id))
      .then((result) => {
        set_logistics(result.logistics);
        set_device(applyDealLogistics(result.device, result.logistics));
        set_loading(false);
        if (!result.device.post_summary || !result.device.seller_name) {
          set_signals_loading(true);
          void refreshDeviceListingSignals(result.device.id)
            .then((updated) => {
              set_device(applyDealLogistics(updated, result.logistics));
            })
            .catch(() => undefined)
            .finally(() => set_signals_loading(false));
        }
      })
      .catch((caught) => {
        set_error(getErrorCopy(caught, te));
        set_loading(false);
      });
  }, [id, initial, te]);

  return { device, logistics, loading, signals_loading, error };
}
