import Link from "next/link";
import { AlertTriangle, Battery, Calendar, EyeOff, HardDrive, Heart, MapPin, Package, Smartphone } from "lucide-react";
import styles from "./DeviceCard.module.scss";
import { DamageTag } from "@/components/DamageTag/DamageTag";
import { StatBar } from "@/components/StatBar/StatBar";
import { useTranslations } from "next-intl";
import { isSuspiciousListing } from "@/lib/listing-flags";
import { updateUserListingAction } from "@/lib/api";
import type { AnalyzedDevice } from "@/lib/api";
import { useCallback, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

interface DeviceCardProps {
  device: AnalyzedDevice;
  onNavigate?: () => void;
  onListingChange?: () => void;
}

const PROFITABILITY_NORMALIZE_MIN = -20;
const PROFITABILITY_NORMALIZE_MAX = 100;

function normalizeProfitability(pct: number | null): number | null {
  if (pct === null) return null;
  const clamped = Math.min(PROFITABILITY_NORMALIZE_MAX, Math.max(PROFITABILITY_NORMALIZE_MIN, pct));
  return ((clamped - PROFITABILITY_NORMALIZE_MIN) / (PROFITABILITY_NORMALIZE_MAX - PROFITABILITY_NORMALIZE_MIN)) * 100;
}

function getProfitValueClass(value: number | null): string {
  if (value === null) return styles.card_economics_value;
  if (value >= 30) return `${styles.card_economics_value} ${styles.card_economics_value_positive}`;
  if (value >= 0) return `${styles.card_economics_value} ${styles.card_economics_value_neutral}`;
  return `${styles.card_economics_value} ${styles.card_economics_value_negative}`;
}

export function DeviceCard({ device, onNavigate, onListingChange }: DeviceCardProps) {
  const t = useTranslations("device_card");
  const t_auth = useTranslations("auth");
  const t_app = useTranslations("app");
  const [is_busy, set_is_busy] = useState(false);
  const [active_photo, set_active_photo] = useState(0);
  const gallery_ref = useRef<HTMLDivElement>(null);
  const is_compact_layout = useMediaQuery("(max-width: 639px)");

  const repairability_display =
    device.repairability_score !== null && device.repairability_scale
      ? ((device.repairability_score / device.repairability_scale) * 10).toFixed(1)
      : null;
  const repairability_bar_value = repairability_display !== null
    ? Number(repairability_display) * 10
    : null;
  const profitability_bar_value = normalizeProfitability(device.profitability_pct);
  const is_suspicious = isSuspiciousListing(device.damage_types);
  const is_favorite = Boolean(device.is_favorite);
  const photo_count = device.photos.length;

  const has_tags = device.damage_types.length > 0
    || is_suspicious
    || device.storage_gb !== null
    || device.has_box
    || device.release_year !== null
    || device.battery_health_percent !== null;

  const syncActivePhoto = useCallback(() => {
    const gallery = gallery_ref.current;
    if (!gallery || photo_count <= 1) return;
    const slide_width = gallery.clientWidth;
    if (slide_width <= 0) return;
    const next_index = Math.round(gallery.scrollLeft / slide_width);
    set_active_photo(Math.min(Math.max(next_index, 0), photo_count - 1));
  }, [photo_count]);

  function scrollToPhoto(index: number) {
    const gallery = gallery_ref.current;
    if (!gallery) return;
    gallery.scrollTo({ left: gallery.clientWidth * index, behavior: "smooth" });
    set_active_photo(index);
  }

  async function handleListingAction(action: "favorite" | "unfavorite" | "hide") {
    if (is_busy) return;
    set_is_busy(true);
    try {
      await updateUserListingAction(device.id, action);
      onListingChange?.();
    } finally {
      set_is_busy(false);
    }
  }

  return (
    <article className={styles.card}>
      <div className={styles.card_media}>
        {photo_count > 0 ? (
          <>
            <div
              ref={gallery_ref}
              className={styles.card_gallery}
              data-testid="card-photo-gallery"
              onScroll={syncActivePhoto}
            >
              {device.photos.map((photo, index) => (
                <img
                  key={`${device.id}-${index}`}
                  src={photo}
                  alt={`${device.title} — ${index + 1}`}
                  className={styles.card_image}
                  loading={index === 0 ? "lazy" : "lazy"}
                  draggable={false}
                />
              ))}
            </div>
            {photo_count > 1 && (
              <>
                <div className={styles.card_gallery_counter} aria-hidden>
                  {active_photo + 1}/{photo_count}
                </div>
                <div className={styles.card_gallery_dots} role="tablist" aria-label={t("photos")}>
                  {device.photos.map((_, index) => (
                    <button
                      key={`dot-${device.id}-${index}`}
                      type="button"
                      role="tab"
                      aria-selected={index === active_photo}
                      aria-label={t("photo_index", { index: index + 1 })}
                      className={[
                        styles.card_gallery_dot,
                        index === active_photo ? styles.card_gallery_dot_active : "",
                      ].join(" ")}
                      onClick={() => scrollToPhoto(index)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className={styles.card_image_placeholder}>
            <Smartphone size={40} aria-hidden />
          </div>
        )}
        <div className={styles.card_actions}>
          <button
            type="button"
            className={`${styles.card_action_btn} ${is_favorite ? styles.card_action_btn_active : ""}`}
            disabled={is_busy}
            aria-label={is_favorite ? t_auth("remove_favorite") : t_auth("add_favorite")}
            onClick={() => handleListingAction(is_favorite ? "unfavorite" : "favorite")}
          >
            <Heart size={14} aria-hidden fill={is_favorite ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            className={styles.card_action_btn}
            disabled={is_busy}
            aria-label={t_auth("hide_listing")}
            onClick={() => handleListingAction("hide")}
          >
            <EyeOff size={14} aria-hidden />
          </button>
        </div>
      </div>

      <div className={styles.card_body}>
        <div className={styles.card_header}>
          <div className={styles.card_brand}>
            {device.brand === "unknown" ? t_app("brand_fallback") : device.brand}
            {device.model_line_label && (
              <span className={styles.card_model_line}> · {device.model_line_label}</span>
            )}
          </div>
          <h2 className={styles.card_title}>{device.title}</h2>
        </div>

        {has_tags && (
          <div className={styles.card_tags}>
            {device.damage_types.map((dt) => (
              <DamageTag key={dt} type={dt} />
            ))}
            {is_suspicious && (
              <span className={styles.card_suspicious}>
                <AlertTriangle size={12} aria-hidden />
                <span>{t("suspicious")}</span>
              </span>
            )}
            {device.storage_gb !== null && (
              <span className={styles.card_badge}>
                <HardDrive size={12} aria-hidden /> {device.storage_gb} GB
              </span>
            )}
            {device.has_box && (
              <span className={styles.card_badge}>
                <Package size={12} aria-hidden /> {t("has_box")}
              </span>
            )}
            {device.release_year !== null && (
              <span className={styles.card_badge}>
                <Calendar size={12} aria-hidden /> {device.release_year}
              </span>
            )}
            {device.battery_health_percent !== null && (
              <span className={[
                styles.card_badge,
                device.battery_health_percent < 85 ? styles.card_badge_warning : "",
              ].join(" ")}>
                <Battery size={12} aria-hidden /> {device.battery_health_percent}%
              </span>
            )}
          </div>
        )}

        <div className={styles.card_metrics}>
          <div className={styles.card_stats}>
            <StatBar
              label={t("liquidity")}
              value={device.liquidity_score}
              display_value={device.liquidity_score !== null ? `${Math.round(device.liquidity_score)}` : "—"}
              compact={is_compact_layout}
            />
            <StatBar
              label={t("profitability")}
              value={profitability_bar_value}
              display_value={device.profitability_pct !== null ? `${device.profitability_pct}%` : "—"}
              compact={is_compact_layout}
            />
            <StatBar
              label={t("repairability")}
              value={repairability_bar_value}
              display_value={repairability_display !== null ? `${repairability_display}/10` : "—"}
              compact={is_compact_layout}
            />
          </div>

          <div className={styles.card_economics}>
            <div className={`${styles.card_economics_item} ${styles.card_economics_item_highlight}`}>
              <span className={styles.card_economics_label}>{t("profit")}</span>
              <span className={getProfitValueClass(device.profit_estimate)}>
                {device.profit_estimate !== null ? `${device.profit_estimate} zł` : "—"}
              </span>
            </div>
            <div className={styles.card_economics_item}>
              <span className={styles.card_economics_label}>{t("repair_cost")}</span>
              <span className={styles.card_economics_value}>
                {device.parts_cost_estimate !== null ? `~${device.parts_cost_estimate} zł` : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.card_footer}>
        <div className={styles.card_price_block}>
          <div className={styles.card_price}>
            {device.price_buy !== null ? `${device.price_buy} zł` : "—"}
          </div>
          {device.is_negotiable && (
            <span className={styles.card_price_negotiable}>{t("negotiable")}</span>
          )}
          {device.city && (
            <div className={styles.card_location}>
              <MapPin size={12} aria-hidden /> {device.city}
            </div>
          )}
        </div>
        <Link
          href={`/devices/${device.id}`}
          className={styles.card_btn}
          onClick={() => onNavigate?.()}
        >
          {t("view_details")}
        </Link>
      </div>
    </article>
  );
}
