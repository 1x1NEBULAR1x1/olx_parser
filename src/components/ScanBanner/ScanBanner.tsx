"use client";

import { useState } from "react";
import styles from "./ScanBanner.module.scss";
import { useTranslations, useLocale } from "next-intl";
import { startScan } from "@/lib/api";
import type { AppLocale } from "@/i18n/config";
import type { ScanStage } from "@/lib/api";

const DATE_LOCALE_MAP: Record<AppLocale, string> = {
  pl: "pl-PL",
  en: "en-US",
  ru: "ru-RU",
};

interface ScanBannerProps {
  is_scanning: boolean;
  cached_at: string | null;
  devices_count: number;
  stage: ScanStage | null;
  total_listings: number | null;
  processed_listings: number;
  percent: number;
  onScanStarted: () => void;
}

export function ScanBanner({
  is_scanning, cached_at, devices_count,
  stage, total_listings, processed_listings, percent,
  onScanStarted,
}: ScanBannerProps) {
  const t = useTranslations("scan");
  const locale = useLocale() as AppLocale;
  const [starting, set_starting] = useState(false);

  async function handleStart() {
    set_starting(true);
    try {
      await startScan();
      onScanStarted();
    } catch {
      // Игнорируем если уже идёт скан
    } finally {
      set_starting(false);
    }
  }

  const banner_class = [
    styles.banner,
    is_scanning ? styles.banner_scanning : styles.banner_idle,
  ].join(" ");

  const formatted_date = cached_at
    ? new Date(cached_at).toLocaleString(DATE_LOCALE_MAP[locale], {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const stage_label = stage ? t(`stage_${stage}` as const) : t("in_progress");
  const progress_detail = total_listings && is_scanning
    ? stage === "saving"
      ? t("progress_saving", { processed: processed_listings, total: total_listings })
      : stage === "finalizing"
        ? t("progress_finalizing", { processed: processed_listings, total: total_listings })
        : stage === "analyzing"
          ? t("progress_of", { processed: processed_listings, total: total_listings })
          : null
    : null;

  return (
    <div className={banner_class}>
      <div className={styles.banner_main}>
        <div>
          <div className={styles.banner_text}>
            {is_scanning && <span className={styles.banner_spinner} />}
            {is_scanning ? stage_label : `${devices_count} ${t("devices_found")}`}
          </div>
          {formatted_date && !is_scanning && (
            <div className={styles.banner_meta}>
              {t("last_update")}: {formatted_date}
            </div>
          )}
        </div>

        <button
          className={styles.banner_btn}
          onClick={handleStart}
          disabled={is_scanning || starting}
        >
          {starting ? t("starting") : t("start")}
        </button>
      </div>

      {is_scanning && (
        <div className={styles.banner_progress}>
          <div className={styles.banner_progress_track}>
            <div className={styles.banner_progress_fill} style={{ width: `${percent}%` }} />
          </div>
          <div className={styles.banner_progress_label}>
            <span>{percent}%</span>
            {progress_detail && <span>{progress_detail}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
