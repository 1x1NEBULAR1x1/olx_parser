"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { HeaderActions } from "@/components/HeaderActions/HeaderActions";
import { CheckboxGroup } from "@/components/CheckboxGroup/CheckboxGroup";
import type { CheckboxOption } from "@/components/CheckboxGroup/CheckboxGroup";
import { RangeSlider } from "@/components/RangeSlider/RangeSlider";
import {
  fetchDevices, fetchNotificationSettings, updateNotificationSettings,
} from "@/lib/api";
import type { NotificationSettings, AnalyzedDevice } from "@/lib/api";

const PRICE_BOUNDS_FALLBACK: [number, number] = [0, 5000];
const PROFITABILITY_BOUNDS_FALLBACK: [number, number] = [-100, 150];

function buildBounds(values: number[], fallback: [number, number]): [number, number] {
  if (values.length === 0) return fallback;
  return [Math.min(...values), Math.max(...values)];
}

function countBy<T>(items: T[], get_key: (item: T) => string | null): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = get_key(item);
    if (key === null) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export default function NotificationSettingsPage() {
  const t = useTranslations("notification_settings");
  const t_notifications = useTranslations("notifications");
  const tc = useTranslations("common");
  const [devices, set_devices] = useState<AnalyzedDevice[]>([]);
  const [settings, set_settings] = useState<NotificationSettings | null>(null);
  const [loading, set_loading] = useState(true);
  const [saving, set_saving] = useState(false);
  const [saved_at, set_saved_at] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([fetchDevices(), fetchNotificationSettings()])
      .then(([devices_res, settings_res]) => {
        set_devices(devices_res.devices);
        set_settings(settings_res);
      })
      .finally(() => set_loading(false));
  }, []);

  const brand_options: CheckboxOption[] = useMemo(() => {
    const counts = countBy(devices, (d) => (d.brand !== "unknown" ? d.brand : null));
    return Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([brand, count]) => ({
        value: brand,
        label: brand.charAt(0).toUpperCase() + brand.slice(1),
        count,
      }));
  }, [devices]);

  const model_options: CheckboxOption[] = useMemo(() => {
    const result: CheckboxOption[] = [];
    for (const device of devices) {
      if (device.brand === "unknown" || !device.model_key) continue;
      const existing = result.find((o) => o.value === device.model_key);
      if (existing) {
        existing.count = (existing.count ?? 0) + 1;
      } else {
        result.push({ value: device.model_key, label: device.model_label || device.model_key, count: 1 });
      }
    }
    return result.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  }, [devices]);

  const region_options: CheckboxOption[] = useMemo(() => {
    const counts = countBy(devices, (d) => d.region);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([region, count]) => ({ value: region, label: region, count }));
  }, [devices]);

  const price_bounds = useMemo(
    () => buildBounds(devices.map((d) => d.price_buy).filter((v): v is number => v !== null), PRICE_BOUNDS_FALLBACK),
    [devices],
  );
  const profitability_bounds = useMemo(
    () => buildBounds(devices.map((d) => d.profitability_pct).filter((v): v is number => v !== null), PROFITABILITY_BOUNDS_FALLBACK),
    [devices],
  );

  function updateField<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) {
    set_settings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!settings) return;
    set_saving(true);
    try {
      const saved = await updateNotificationSettings({
        enabled: settings.enabled,
        brands: settings.brands,
        model_keys: settings.model_keys,
        regions: settings.regions,
        min_profitability_pct: settings.min_profitability_pct,
        max_profitability_pct: settings.max_profitability_pct,
        min_price: settings.min_price,
        max_price: settings.max_price,
      });
      set_settings((prev) => (prev ? { ...prev, ...saved } : saved));
      set_saved_at(Date.now());
    } finally {
      set_saving(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-3 flex-wrap">
          <Link href="/" className="text-sm font-bold app-text ">← SmartFlip</Link>
          <span className="app-divider hidden sm:inline">/</span>
          <Link href="/notifications" className="text-sm app-text-muted ">{t_notifications("title")}</Link>
          <span className="app-divider hidden sm:inline">/</span>
          <span className="text-sm app-text-muted flex-1">{t("title")}</span>
          <HeaderActions />
        </div>
      </header>

      <div className="max-w-screen-md mx-auto px-3 sm:px-4 py-6 sm:py-10">
        <h1 className="text-xl sm:text-2xl font-black app-text mb-1">{t("title")}</h1>
        <p className="text-sm app-text-muted mb-8">{t("tagline")}</p>

        {loading || !settings ? (
          <div className="app-text-faint text-sm">{tc("loading")}</div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="app-panel p-5 sm:p-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => updateField("enabled", e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[var(--color-primary)] flex-shrink-0"
                />
                <span className="text-sm font-bold app-text">{t("enabled_label")}</span>
              </label>

              <p className={`text-xs mt-3 ${settings.telegram_configured ? "text-emerald-600 dark:text-emerald-400" : "app-text-faint"}`}>
                {settings.telegram_configured ? t("telegram_configured") : t("telegram_not_configured")}
              </p>
            </div>

            <div className={`flex flex-col gap-5 ${settings.enabled ? "" : "opacity-40 pointer-events-none"}`}>
              <div className="app-panel p-5 sm:p-6">
                <label className="block text-sm font-bold app-text mb-3">{t("brands_label")}</label>
                <CheckboxGroup
                  options={brand_options}
                  selected={settings.brands}
                  onChange={(next) => updateField("brands", next)}
                />
              </div>

              <div className="app-panel p-5 sm:p-6">
                <label className="block text-sm font-bold app-text mb-3">{t("models_label")}</label>
                <CheckboxGroup
                  options={model_options}
                  selected={settings.model_keys}
                  onChange={(next) => updateField("model_keys", next)}
                />
              </div>

              <div className="app-panel p-5 sm:p-6">
                <label className="block text-sm font-bold app-text mb-3">{t("regions_label")}</label>
                <CheckboxGroup
                  options={region_options}
                  selected={settings.regions}
                  onChange={(next) => updateField("regions", next)}
                />
              </div>

              <div className="app-panel p-5 sm:p-6">
                <label className="block text-sm font-bold app-text mb-3">{t("profitability_range_label")}</label>
                <RangeSlider
                  min={profitability_bounds[0]}
                  max={profitability_bounds[1]}
                  step={5}
                  value={[
                    settings.min_profitability_pct ?? profitability_bounds[0],
                    settings.max_profitability_pct ?? profitability_bounds[1],
                  ]}
                  onChange={([min, max]) => {
                    updateField("min_profitability_pct", min);
                    updateField("max_profitability_pct", max);
                  }}
                  formatValue={(v) => `${Math.round(v)}%`}
                />
              </div>

              <div className="app-panel p-5 sm:p-6">
                <label className="block text-sm font-bold app-text mb-3">{t("price_range_label")}</label>
                <RangeSlider
                  min={price_bounds[0]}
                  max={price_bounds[1]}
                  step={10}
                  value={[
                    settings.min_price ?? price_bounds[0],
                    settings.max_price ?? price_bounds[1],
                  ]}
                  onChange={([min, max]) => {
                    updateField("min_price", min);
                    updateField("max_price", max);
                  }}
                  formatValue={(v) => `${Math.round(v)} zł`}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="app-btn-primary disabled:opacity-60 text-white text-sm font-bold rounded-xl px-5 py-2.5 transition-colors"
                >
                  {saving ? t("saving") : t("save")}
                </button>
                {saved_at !== null && (
                  <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">{t("saved")}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
