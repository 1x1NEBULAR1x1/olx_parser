"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { HeaderActions } from "@/components/HeaderActions/HeaderActions";
import { fetchSettings, updateSettings } from "@/lib/api";

const CURRENT_YEAR = new Date().getFullYear();

// Только эти значения соответствуют реальным cron-выражениям в
// scan-scheduler.ts (0 = выключено) — произвольный интервал не поддерживается.
const AUTO_SCAN_OPTIONS = [0, 15, 30, 60, 180, 360] as const;
const MIN_CACHE_TTL_HOURS = 6;
const MAX_CACHE_TTL_HOURS = 2160; // ~3 месяца

type SettingsTranslator = (key: string, values?: Record<string, string | number | Date>) => string;

function formatAutoScanOption(minutes: number, t: SettingsTranslator): string {
  if (minutes === 0) return t("auto_scan_off");
  if (minutes < 60) return t("auto_scan_minutes", { minutes });
  return t("auto_scan_hours", { hours: minutes / 60 });
}

function formatCacheTtl(hours: number, t: SettingsTranslator): string {
  if (hours < 24) return t("cache_ttl_hours_short", { hours });
  const days = Math.round(hours / 24);
  if (days < 30) return t("cache_ttl_days_short", { days });
  const months = Math.round(days / 30);
  return t("cache_ttl_months_short", { months });
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const t_app = useTranslations("app");
  const [threshold, set_threshold] = useState(80);
  const [exclude_junk, set_exclude_junk] = useState(true);
  const [exclude_iphone, set_exclude_iphone] = useState(false);
  const [exclude_android, set_exclude_android] = useState(false);
  const [junk_min_year, set_junk_min_year] = useState(2017);
  const [auto_scan_minutes, set_auto_scan_minutes] = useState(0);
  const [cache_ttl_hours, set_cache_ttl_hours] = useState(72);
  const [loading, set_loading] = useState(true);
  const [saving, set_saving] = useState(false);
  const [saved_at, set_saved_at] = useState<number | null>(null);

  useEffect(() => {
    fetchSettings()
      .then((settings) => {
        set_threshold(settings.battery_health_threshold_percent);
        set_exclude_junk(settings.exclude_junk_listings);
        set_exclude_iphone(settings.exclude_iphone);
        set_exclude_android(settings.exclude_android);
        set_junk_min_year(settings.junk_min_release_year);
        set_auto_scan_minutes(settings.auto_scan_interval_minutes);
        set_cache_ttl_hours(settings.cache_ttl_hours);
      })
      .finally(() => set_loading(false));
  }, []);

  async function handleSave() {
    set_saving(true);
    try {
      await updateSettings({
        battery_health_threshold_percent: threshold,
        exclude_junk_listings: exclude_junk,
        exclude_iphone,
        exclude_android,
        junk_min_release_year: junk_min_year,
        auto_scan_interval_minutes: auto_scan_minutes,
        cache_ttl_hours,
      });
      set_saved_at(Date.now());
    } finally {
      set_saving(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-3 flex-wrap">
          <Link href="/" className="text-sm font-bold app-link">← SmartFlip</Link>
          <span className="app-divider hidden sm:inline">/</span>
          <span className="text-sm app-text-muted flex-1">{t("title")}</span>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/notifications/settings"
              className="app-btn-ghost whitespace-nowrap"
            >
              <Bell size={16} aria-hidden />
              {t_app("notification_settings_link")}
            </Link>
            <HeaderActions />
          </div>
        </div>
      </header>

      <div className="max-w-screen-md mx-auto px-3 sm:px-4 py-6 sm:py-10">
        <h1 className="text-xl sm:text-2xl font-black app-text mb-1">{t("title")}</h1>
        <p className="text-sm app-text-muted mb-8">{t("tagline")}</p>

        {loading ? (
          <div className="app-text-faint text-sm">{t_app("tagline")}</div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="app-panel p-5 sm:p-6">
              <label className="block text-sm font-bold app-text mb-1">
                {t("battery_threshold_label")}
              </label>
              <p className="text-xs app-text-muted mb-4">{t("battery_threshold_hint")}</p>

              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={threshold}
                  onChange={(e) => set_threshold(Number(e.target.value))}
                  className="flex-1 accent-[var(--color-primary)]"
                />
                <span className="w-16 text-right text-lg font-black app-accent tabular-nums">
                  {threshold}%
                </span>
              </div>
            </div>

            <div className="app-panel p-5 sm:p-6">
              <div className="text-sm font-bold app-text mb-4">{t("junk_section_title")}</div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exclude_junk}
                  onChange={(e) => set_exclude_junk(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[var(--color-primary)] flex-shrink-0"
                />
                <span>
                  <span className="block text-sm font-bold app-text">{t("exclude_junk_label")}</span>
                  <span className="block text-xs app-text-muted mt-0.5">{t("exclude_junk_hint")}</span>
                </span>
              </label>

              <div className={`mt-5 pl-7 ${exclude_junk ? "" : "opacity-40"}`}>
                <label className="block text-sm font-bold app-text mb-1">
                  {t("junk_min_year_label")}
                </label>
                <p className="text-xs app-text-muted mb-4">{t("junk_min_year_hint")}</p>

                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={2000}
                    max={CURRENT_YEAR}
                    step={1}
                    value={junk_min_year}
                    disabled={!exclude_junk}
                    onChange={(e) => set_junk_min_year(Number(e.target.value))}
                    className="flex-1 accent-[var(--color-primary)] disabled:cursor-not-allowed"
                  />
                  <span className="w-16 text-right text-lg font-black app-accent tabular-nums">
                    {junk_min_year}
                  </span>
                </div>
              </div>
            </div>

            <div className="app-panel p-5 sm:p-6">
              <div className="text-sm font-bold app-text mb-4">{t("platform_section_title")}</div>

              <div className="flex flex-col gap-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exclude_iphone}
                    onChange={(e) => set_exclude_iphone(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[var(--color-primary)] flex-shrink-0"
                  />
                  <span>
                    <span className="block text-sm font-bold app-text">{t("exclude_iphone_label")}</span>
                    <span className="block text-xs app-text-muted mt-0.5">{t("exclude_iphone_hint")}</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exclude_android}
                    onChange={(e) => set_exclude_android(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[var(--color-primary)] flex-shrink-0"
                  />
                  <span>
                    <span className="block text-sm font-bold app-text">{t("exclude_android_label")}</span>
                    <span className="block text-xs app-text-muted mt-0.5">{t("exclude_android_hint")}</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="app-panel p-5 sm:p-6">
              <label className="block text-sm font-bold app-text mb-1">
                {t("auto_scan_label")}
              </label>
              <p className="text-xs app-text-muted mb-4">{t("auto_scan_hint")}</p>

              <div className="flex flex-wrap gap-2">
                {AUTO_SCAN_OPTIONS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => set_auto_scan_minutes(minutes)}
                    className={[
                      "text-sm font-semibold rounded-lg px-3 py-2 border transition-colors",
                      auto_scan_minutes === minutes
                        ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                        : "bg-[var(--color-surface-hover)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]",
                    ].join(" ")}
                  >
                    {formatAutoScanOption(minutes, t)}
                  </button>
                ))}
              </div>
            </div>

            <div className="app-panel p-5 sm:p-6">
              <label className="block text-sm font-bold app-text mb-1">
                {t("cache_ttl_label")}
              </label>
              <p className="text-xs app-text-muted mb-4">{t("cache_ttl_hint")}</p>

              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={MIN_CACHE_TTL_HOURS}
                  max={MAX_CACHE_TTL_HOURS}
                  step={6}
                  value={cache_ttl_hours}
                  onChange={(e) => set_cache_ttl_hours(Number(e.target.value))}
                  className="flex-1 accent-[var(--color-primary)]"
                />
                <span className="w-24 text-right text-lg font-black app-accent tabular-nums">
                  {formatCacheTtl(cache_ttl_hours, t)}
                </span>
              </div>
            </div>

            <div>
              <p className="text-xs app-text-faint mb-3">{t("applies_next_scan")}</p>
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
