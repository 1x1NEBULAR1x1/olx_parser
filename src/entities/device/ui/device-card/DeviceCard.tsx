"use client";

import Link from "next/link";
import { AlertTriangle, Battery, Calendar, EyeOff, HardDrive, Heart, MapPin, Package, Smartphone } from "lucide-react";
import styles from "./DeviceCard.module.scss";
import { DamageTag } from "@/entities/device/ui/damage-tag/DamageTag";
import { StatBar } from "@/shared/ui/stat-bar/StatBar";
import { useTranslations } from "next-intl";
import { isSuspiciousListing } from "@/shared/lib/listing-flags";
import type { AnalyzedDevice } from "@/shared/api/client";
import { PhotoGallery } from "@/entities/device/ui/photo-gallery/PhotoGallery";
import { useDeviceCardActions } from "@/entities/device/lib/use-device-card-actions";
import { normalizeProfitability } from "@/entities/device/lib/normalize-profitability";

interface DeviceCardProps {
  device: AnalyzedDevice;
  onNavigate?: () => void;
  onListingChange?: () => void;
}

function getProfitValueClass(styles_map: typeof styles, value: number | null): string {
  if (value === null) return styles_map.card_economics_value;
  if (value >= 30) return `${styles_map.card_economics_value} ${styles_map.card_economics_value_positive}`;
  if (value >= 0) return `${styles_map.card_economics_value} ${styles_map.card_economics_value_neutral}`;
  return `${styles_map.card_economics_value} ${styles_map.card_economics_value_negative}`;
}

export function DeviceCard({ device, onNavigate, onListingChange }: DeviceCardProps) {
  const t = useTranslations("device_card");
  const t_auth = useTranslations("auth");
  const t_app = useTranslations("app");
  const { is_busy, handleListingAction } = useDeviceCardActions(device.id, onListingChange);

  const repairability_display =
    device.repairability_score !== null && device.repairability_scale
      ? ((device.repairability_score / device.repairability_scale) * 10).toFixed(1)
      : null;
  const repairability_bar_value = repairability_display !== null
    ? Number(repairability_display) * 10
    : null;
  const profitability_bar_value = normalizeProfitability(
    device.risk_adjusted_profitability_pct ?? device.profitability_pct,
  );
  const is_suspicious = isSuspiciousListing(device.damage_types);
  const is_favorite = Boolean(device.is_favorite);
  const photo_count = device.photos.length;
  const display_profit = device.risk_adjusted_profit ?? device.profit_estimate;

  const has_tags = device.damage_types.length > 0
    || is_suspicious
    || device.storage_gb !== null
    || device.has_box
    || device.release_year !== null
    || device.battery_health_percent !== null;

  return (
    <article className={styles.card} data-testid="device-card">
      <div className={styles.card_media}>
        {photo_count > 0 ? (
          <PhotoGallery
            photos={device.photos}
            alt={device.title}
            variant="card"
            test_id="card-photo-gallery"
          />
        ) : (
          <div className={styles.card_image_placeholder}>
            <Smartphone size={40} aria-hidden />
          </div>
        )}
        {display_profit !== null && (
          <span className={`${styles.card_profit_badge} ${display_profit >= 0 ? styles.card_profit_badge_plus : styles.card_profit_badge_minus}`}>
            {display_profit >= 0 ? "+" : ""}{display_profit} zł
          </span>
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

      <Link
        href={`/devices/${device.id}`}
        className={styles.card_link}
        onClick={() => onNavigate?.()}
      >
        <div className={styles.card_body}>
          <div className={styles.card_header}>
            <div className={styles.card_brand_row}>
              <div className={styles.card_brand}>
                {device.brand === "unknown" ? t_app("brand_fallback") : device.brand}
                {device.model_line_label && (
                  <span className={styles.card_model_line}> · {device.model_line_label}</span>
                )}
              </div>
              {device.confidence_label && device.confidence_score !== null && (
                <span
                  className={[
                    styles.card_confidence,
                    styles[`card_confidence_${device.confidence_label}`],
                  ].join(" ")}
                  title={t("confidence_tooltip", {
                    score: device.confidence_score,
                    real: device.parts_real_count,
                    estimate: device.parts_estimate_count,
                  })}
                >
                  {t(`confidence_${device.confidence_label}`)}
                </span>
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
                  device.damage_types.includes("battery") ? styles.card_badge_warning : "",
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
                hint={t("liquidity_hint")}
                value={device.liquidity_score}
                display_value={device.liquidity_score !== null ? `${Math.round(device.liquidity_score)}` : "—"}
              />
              <StatBar
                label={t("profitability")}
                hint={t("profitability_hint")}
                value={profitability_bar_value}
                display_value={
                  (device.risk_adjusted_profitability_pct ?? device.profitability_pct) !== null
                    ? `${device.risk_adjusted_profitability_pct ?? device.profitability_pct}%`
                    : "—"
                }
              />
              <StatBar
                label={t("repairability")}
                hint={t("repairability_hint")}
                value={repairability_bar_value}
                display_value={repairability_display !== null ? `${repairability_display}/10` : "—"}
              />
            </div>

            <div className={styles.card_economics}>
              <div className={styles.card_economics_row}>
                <div className={styles.card_economics_col}>
                  <span className={styles.card_economics_label} data-testid="card-expected-profit-label">{t("expected_profit")}</span>
                  <span className={getProfitValueClass(styles, display_profit)}>
                    {display_profit !== null ? `${display_profit} zł` : "—"}
                  </span>
                  {device.risk_adjusted_profit !== null
                    && device.profit_estimate !== null
                    && device.risk_adjusted_profit !== device.profit_estimate && (
                    <span className={styles.card_economics_hint} title={t("expected_profit_tooltip")}>
                      {t("gross_profit_hint", { value: device.profit_estimate })}
                    </span>
                  )}
                </div>
                <div className={`${styles.card_economics_col} ${styles.card_economics_col_end}`}>
                  <span className={styles.card_economics_label}>{t("repair_cost")}</span>
                  <span className={styles.card_economics_value}>
                    {device.parts_cost_estimate !== null ? `~${device.parts_cost_estimate} zł` : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.card_footer}>
          <div className={styles.card_price_row}>
            <div className={styles.card_price_col}>
              <div className={styles.card_price}>
                {device.price_buy !== null ? `${device.price_buy} zł` : "—"}
              </div>
              {device.is_negotiable && (
                <span className={styles.card_price_negotiable}>{t("negotiable")}</span>
              )}
            </div>
            {device.city && (
              <div className={styles.card_location_col}>
                <div className={styles.card_location}>
                  <MapPin size={12} aria-hidden /> {device.city}
                </div>
              </div>
            )}
          </div>
          <span className={styles.card_btn}>{t("view_details")}</span>
        </div>
      </Link>
    </article>
  );
}
