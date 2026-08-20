"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { Chip, Stack } from "@mui/material";
import {
  ArrowLeft, AlertTriangle, Battery, Box as BoxIcon, Calendar, ExternalLink,
  HardDrive, Loader2, MapPin, Package, Smartphone, Star, User, Wrench,
} from "lucide-react";
import type { DeviceDetailResponse } from "@/shared/api/client";
import { DamageTag } from "@/entities/device/ui/damage-tag/DamageTag";
import { isSuspiciousListing } from "@/shared/lib/listing-flags";
import { PhotoGallery } from "@/entities/device/ui/photo-gallery/PhotoGallery";
import { StatBar } from "@/shared/ui/stat-bar/StatBar";
import { PartSourceBadge } from "@/shared/ui/part-source-badge/PartSourceBadge";
import { PartImage } from "@/shared/ui/part-image/PartImage";
import type { AppLocale } from "@/shared/config/i18n/config";
import { AppShell } from "@/shared/ui/page-layout";
import styles from "./DeviceDetailPage.module.scss";
import { isPartEstimate } from "@/shared/lib/part-utils";
import { selectRankedParts } from "@/shared/lib/parts-rank";
import { getMetricHighlight, normalizeProfitability } from "@/entities/device/lib/normalize-profitability";
import { useDeviceDetail } from "../lib/use-device-detail";

const DATE_LOCALE_MAP: Record<AppLocale, string> = {
  pl: "pl-PL",
  en: "en-US",
  ru: "ru-RU",
};

interface DeviceDetailPageProps {
  initial?: DeviceDetailResponse | null;
}

export function DeviceDetailPage({ initial = null }: DeviceDetailPageProps) {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const t = useTranslations("device_detail");
  const t_repair_stub = useTranslations("repair_stub");
  const tc = useTranslations("common");
  const t_app = useTranslations("app");
  const locale = useLocale() as AppLocale;
  const { device, logistics, loading, signals_loading, error } = useDeviceDetail(id, initial);

  if (loading) {
    return (
      <AppShell>
        <div className={styles.detail_loading}>
          <span className={styles.detail_spinner} aria-hidden />
          {tc("loading")}
        </div>
      </AppShell>
    );
  }

  if (error || !device) {
    return (
      <AppShell>
        <div className={styles.detail_error}>
          <p>{error ?? tc("not_found")}</p>
          <Link href="/" className={styles.detail_back}>{tc("back")}</Link>
        </div>
      </AppShell>
    );
  }

  const repairability_normalized =
    device.repairability_score !== null && device.repairability_scale
      ? ((device.repairability_score / device.repairability_scale) * 10).toFixed(1)
      : null;

  const posted_date = new Date(device.created_at).toLocaleDateString(DATE_LOCALE_MAP[locale], {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const display_profit = device.risk_adjusted_profit ?? device.profit_estimate;
  const profitability_pct_normalized = normalizeProfitability(
    device.risk_adjusted_profitability_pct ?? device.profitability_pct,
  );
  const is_repairability_stub = !device.ifixit_device_name && repairability_normalized !== null;
  const has_estimate_parts = device.allegro_parts.some((part) => isPartEstimate(part));
  const display_parts = selectRankedParts(device.allegro_parts);
  const shipping_total = logistics
    ? logistics.shipping_parts_pln + logistics.shipping_to_repair_pln + logistics.shipping_to_customer_pln + logistics.repair_labor_base_pln
    : 0;

  return (
    <AppShell>
      <div className={styles.detail_body}>
        <nav className={styles.detail_crumbs} aria-label="breadcrumb">
          <Link href="/" className={styles.detail_back}>
            <ArrowLeft size={16} aria-hidden />
            {t_app("nav_feed")}
          </Link>
          <span className={styles.detail_crumbs_sep}>/</span>
          <span className={styles.detail_crumbs_current}>{device.title}</span>
        </nav>
        <div className={styles.detail_grid}>
          <div className={styles.detail_photos}>
            {device.photos.length > 0 ? (
              <PhotoGallery
                photos={device.photos}
                alt={device.title}
                variant="detail"
                test_id="detail-photo-gallery"
              />
            ) : (
              <div className={styles.detail_photo_placeholder}>
                <Smartphone size={48} aria-hidden />
              </div>
            )}

            <div className={styles.detail_links}>
              <a href={device.olx_url} target="_blank" rel="noopener noreferrer" className={`${styles.detail_link} ${styles.detail_link_primary}`}>
                <ExternalLink size={14} aria-hidden /> {t("olx_listing")}
              </a>
              {device.allegro_search_url && (
                <a href={device.allegro_search_url} target="_blank" rel="noopener noreferrer" className={styles.detail_link}>
                  <Wrench size={14} aria-hidden /> {t("allegro_search")}
                </a>
              )}
              {device.ifixit_url && (
                <a href={device.ifixit_url} target="_blank" rel="noopener noreferrer" className={styles.detail_link}>
                  {t("ifixit_guide")}
                </a>
              )}
            </div>
          </div>

          <div className={styles.detail_info}>
            <div>
              <div className={styles.detail_brand}>
                {device.brand !== "unknown" ? device.brand : t_app("brand_fallback")}
                {device.model_line_label ? ` · ${device.model_line_label}` : ""}
              </div>
              <h1 className={styles.detail_title}>{device.title}</h1>
            </div>

            {device.damage_types.length > 0 && (
              <div className={styles.detail_damages}>
                <div className={styles.detail_section_label}>{t("damage_types")}</div>
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                  {device.damage_types.map((dt) => (
                    <DamageTag key={dt} type={dt} />
                  ))}
                </Stack>
              </div>
            )}

            {isSuspiciousListing(device.damage_types) && (
              <Chip
                icon={<AlertTriangle size={14} />}
                label={t("suspicious")}
                color="error"
                size="small"
                variant="outlined"
              />
            )}

            <div className={styles.detail_badges}>
              {device.storage_gb !== null && (
                <span className={styles.detail_badge}>
                  <HardDrive size={12} aria-hidden /> {device.storage_gb} GB
                </span>
              )}
              {device.has_box && (
                <span className={styles.detail_badge}>
                  <BoxIcon size={12} aria-hidden /> {t("has_box")}
                </span>
              )}
              {device.release_year !== null && (
                <span className={styles.detail_badge}>
                  <Calendar size={12} aria-hidden /> {device.release_year}
                </span>
              )}
              {device.battery_health_percent !== null && (
                <span className={[
                  styles.detail_badge,
                  device.damage_types.includes("battery") ? styles.detail_badge_warning : "",
                ].join(" ")}>
                  <Battery size={12} aria-hidden /> {device.battery_health_percent}%
                </span>
              )}
            </div>

            <div className={styles.detail_stats_grid}>
              <StatBar
                label={t("liquidity_score")}
                hint={t("liquidity_hint")}
                value={device.liquidity_score}
                display_value={device.liquidity_score !== null ? `${Math.round(device.liquidity_score)}` : "—"}
              />
              <StatBar
                label={t("profitability_pct")}
                hint={t("profitability_hint")}
                value={profitability_pct_normalized}
                display_value={
                  (device.risk_adjusted_profitability_pct ?? device.profitability_pct) !== null
                    ? `${device.risk_adjusted_profitability_pct ?? device.profitability_pct}%`
                    : "—"
                }
              />
              <div>
                <StatBar
                  label={t("repairability_score")}
                  hint={t("repairability_hint")}
                  value={repairability_normalized !== null ? Number(repairability_normalized) * 10 : null}
                  display_value={repairability_normalized !== null ? `${repairability_normalized}/10` : "—"}
                />
                {is_repairability_stub && (
                  <p className={styles.detail_price_source}>{t("repairability_stub")}</p>
                )}
              </div>
            </div>

            <div className={styles.detail_metrics_grid}>
              <div className={styles.detail_metric}>
                <div className={styles.detail_metric_label}>{t("buy_price")}</div>
                <div className={styles.detail_metric_value}>
                  {device.price_buy !== null ? `${device.price_buy} zł` : "—"}
                </div>
              </div>
              <div className={styles.detail_metric}>
                <div className={styles.detail_metric_label}>{t("parts_cost")}</div>
                <div className={styles.detail_metric_value}>
                  {device.parts_cost_estimate !== null ? `~${device.parts_cost_estimate} zł` : "—"}
                </div>
              </div>
              <div className={styles.detail_metric}>
                <div className={styles.detail_metric_label}>{t("sell_price_estimate")}</div>
                <div className={styles.detail_metric_value}>
                  {device.market_sell_price !== null ? `~${device.market_sell_price} zł` : "—"}
                </div>
              </div>
              <div className={styles.detail_metric}>
                <div className={styles.detail_metric_label}>{t("expected_profit")}</div>
                <div className={[
                  styles.detail_metric_value,
                  getMetricHighlight(display_profit) === "positive" ? styles.detail_metric_value_positive : "",
                  getMetricHighlight(display_profit) === "negative" ? styles.detail_metric_value_negative : "",
                ].join(" ")}>
                  {display_profit !== null ? `${display_profit} zł` : "—"}
                </div>
                <p className={styles.detail_price_source}>{t("expected_profit_hint")}</p>
                {device.profit_estimate !== null
                  && device.risk_adjusted_profit !== null
                  && device.profit_estimate !== device.risk_adjusted_profit && (
                  <p className={styles.detail_price_source}>
                    {t("gross_profit_hint", { value: device.profit_estimate })}
                  </p>
                )}
                {shipping_total > 0 && (
                  <p className={styles.detail_price_source}>
                    {t("shipping_included", { value: shipping_total })}
                  </p>
                )}
              </div>
            </div>

            {device.market_sell_price_source && (
              <p className={styles.detail_price_source}>
                {device.market_sell_price_source === "model_median"
                  ? t("price_source_median")
                  : device.market_sell_price_source === "cached_median"
                    ? t("price_source_cached")
                    : device.market_sell_price_source === "model_hint"
                      ? t("price_source_hint")
                      : t("price_source_estimate")}
              </p>
            )}

            <div className={styles.detail_location}>
              <div className={styles.detail_section_label}>{t("seller_title")}</div>
              {device.city && (
                <p>
                  <MapPin size={14} aria-hidden /> {device.city}{device.region ? `, ${device.region}` : ""}
                </p>
              )}
              <p>
                <User size={14} aria-hidden />{" "}
                {device.seller_name
                  || (signals_loading ? t("seller_loading") : t("seller_unknown"))}
              </p>
              {device.seller_ads_count !== null && (
                <p>{t("seller_ads_count")}: {device.seller_ads_count}</p>
              )}
              {device.seller_member_since && (
                <p>{t("seller_member_since")}: {device.seller_member_since}</p>
              )}
              <p className={styles.detail_posted}>{t("posted")}: {posted_date}</p>
            </div>

            <div className={styles.detail_description}>
              <div className={styles.detail_section_label}>{t("description")}</div>
              {signals_loading && !device.post_summary ? (
                <p className={styles.detail_description_loading}>
                  <Loader2 size={14} className="animate-spin" aria-hidden /> {t("description_loading")}
                </p>
              ) : (
                <p className={styles.detail_description_text}>
                  {device.post_summary || t("description_empty")}
                </p>
              )}
            </div>
          </div>
        </div>

        {(device.allegro_parts.length > 0 || device.damage_types.length > 0) && (
          <section className={styles.detail_parts}>
            <div className={styles.detail_parts_header}>
              <h2 className={styles.detail_parts_title}>
                <Package size={18} aria-hidden /> {t("parts_title")}
              </h2>
              {has_estimate_parts && (
                <span className={styles.detail_parts_estimate_note}>
                  <Star size={12} aria-hidden /> {t("estimate_note")}
                </span>
              )}
            </div>
            <div className={styles.detail_parts_grid}>
              {display_parts.map((part, index) => {
                const is_estimate = isPartEstimate(part);
                const repair_note_text = is_estimate && part.damage_type
                  ? t_repair_stub(part.damage_type as never)
                  : null;
                return (
                  <a
                    key={`${part.url}-${index}`}
                    href={part.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={[
                      styles.detail_part_card,
                      is_estimate ? styles.detail_part_card_estimate : "",
                    ].join(" ")}
                  >
                    <PartImage src={part.image} alt={part.title} />
                    <div className={styles.detail_part_info}>
                      <div className={styles.detail_part_source}>
                        <PartSourceBadge part={part} />
                      </div>
                      <div className={styles.detail_part_title}>{part.title}</div>
                      {repair_note_text && (
                        <p className={styles.detail_price_source}>{repair_note_text}</p>
                      )}
                      {part.price !== null && (
                        <div className={styles.detail_part_price}>
                          {part.price} {part.currency ?? "zł"}
                          {is_estimate && <span className={styles.detail_part_est_badge}>{t("estimate_badge")}</span>}
                        </div>
                      )}
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
