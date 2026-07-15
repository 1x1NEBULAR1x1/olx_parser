"use client";

import { useLayoutEffect } from "react";
import { applyTheme, readThemeChoice, type ThemeChoice } from "@/shared/lib/theme";

/**
 * Синхронизирует тему после гидратации и при смене системных настроек.
 * Anti-FOUC в layout.tsx покрывает первый paint; здесь — клиентские переходы
 * (OAuth callback, soft navigation) и matchMedia listener.
 */
export function ThemeInit() {
  useLayoutEffect(() => {
    let choice = readThemeChoice();
    applyTheme(choice);

    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function handleSystemChange() {
      const current = readThemeChoice();
      if (current === "system") {
        applyTheme("system");
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== "smartflip-theme") return;
      const next = (event.newValue as ThemeChoice | null) ?? "system";
      if (next === "light" || next === "dark" || next === "system") {
        choice = next;
        applyTheme(next);
      }
    }

    media.addEventListener("change", handleSystemChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      media.removeEventListener("change", handleSystemChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return null;
}
