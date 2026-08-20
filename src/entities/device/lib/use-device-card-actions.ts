"use client";

import { useState } from "react";
import { updateUserListingAction } from "@/shared/api/client";

export function useDeviceCardActions(
  device_id: number,
  onListingChange?: () => void,
) {
  const [is_busy, set_is_busy] = useState(false);

  async function handleListingAction(action: "favorite" | "unfavorite" | "hide") {
    if (is_busy) return;
    set_is_busy(true);
    try {
      await updateUserListingAction(device_id, action);
      onListingChange?.();
    } finally {
      set_is_busy(false);
    }
  }

  return { is_busy, handleListingAction };
}
