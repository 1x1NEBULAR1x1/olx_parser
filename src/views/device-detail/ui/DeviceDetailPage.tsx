"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import {
  Box, Button, Chip, Divider, Grid, Paper, Stack, Typography,
} from "@mui/material";
import {
  ArrowLeft, AlertTriangle, Battery, Box as BoxIcon, Calendar, ExternalLink,
  HardDrive, Loader2, MapPin, Package, Smartphone, Star, User, Wrench,
} from "lucide-react";
import { fetchDevice } from "@/shared/api/client";
import type { AnalyzedDevice } from "@/shared/api/client";
import { DamageTag } from "@/entities/device/ui/damage-tag/DamageTag";
import { isSuspiciousListing } from "@/shared/lib/listing-flags";
import { HeaderActions } from "@/widgets/header/ui/header-actions/HeaderActions";
import { PhotoGallery } from "@/entities/device/ui/photo-gallery/PhotoGallery";
import { StatBar } from "@/shared/ui/stat-bar/StatBar";
import type { AppLocale } from "@/shared/config/i18n/config";
import { AppShell } from "@/shared/ui/page-layout";
import styles from "./DeviceDetailPage.module.scss";
import { isPartEstimate, inferPartSource } from "@/shared/lib/part-utils";
import type { AllegroPart, PartSource } from "@/shared/types/domain";
import { getMetricHighlight, normalizeProfitability } from "@/entities/device/lib/normalize-profitability";

const DATE_LOCALE_MAP: Record<AppLocale, string> = {
  pl: "pl-PL",
  en: "en-US",
  ru: "ru-RU",
};

function MetricPaper({
  label, value, highlight,
}: {
  label: string;
  value: string;
  highlight?: "positive" | "negative" | "neutral" | null;
}) {
  const color_map = {
    positive: "success.main",
    negative: "error.main",
    neutral: "text.primary",
  } as const;

  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        {label}
      </Typography>
      <Typography
        variant="h6"
        sx={{ fontWeight: 700, color: highlight ? color_map[highlight] : "text.primary" }}
      >
        {value}
      </Typography>
    </Paper>
  );
}

const PART_SOURCE_I18N_KEY: Record<PartSource, string> = {
  allegro: "parts_source_allegro",
  olx: "parts_source_olx",
  parts_store: "parts_source_parts_store",
  ceneo: "parts_source_ceneo",
  estimate: "parts_source_estimate",
};

function getPartSourceLabel(part: AllegroPart, t: ReturnType<typeof useTranslations<"device_detail">>): string {
  const source = inferPartSource(part);
  return t(PART_SOURCE_I18N_KEY[source]);
}

export function DeviceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const t = useTranslations("device_detail");
  const t_repair_stub = useTranslations("repair_stub");
  const tc = useTranslations("common");
  const t_app = useTranslations("app");
  const locale = useLocale() as AppLocale;
  const [device, set_device] = useState<AnalyzedDevice | null>(null);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchDevice(Number(id))
      .then((d) => {
        set_device(d);
        set_loading(false);
      })
      .catch(() => {
        set_error(tc("not_found"));
        set_loading(false);
      });
  }, [id, tc]);

  if (loading) {
    return (
      <Box className={styles.detail_loading}>
        <Loader2 size={24} className="animate-spin" aria-hidden />
        {tc("loading")}
      </Box>
    );
  }

  if (error || !device) {
    return (
      <Box className={styles.detail_error}>
        <Typography>{error ?? tc("not_found")}</Typography>
        <Link href="/" className={styles.detail_back}>{tc("back")}</Link>
      </Box>
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

  const liquidity_pct = device.liquidity_score;
  const repairability_pct_bar = repairability_normalized !== null ? Number(repairability_normalized) * 10 : null;
  const profitability_pct_normalized = normalizeProfitability(device.profitability_pct);
  const is_repairability_stub = !device.ifixit_device_name && repairability_normalized !== null;
  const has_estimate_parts = device.allegro_parts.some((part) => isPartEstimate(part));
  const has_parts_store_parts = device.allegro_parts.some((part) => inferPartSource(part) === "parts_store");

  return (
    <AppShell>
      <Paper square elevation={0} sx={{ borderBottom: 1, borderColor: "divider", position: "sticky", top: 0, zIndex: 10 }}>
        <Stack direction="row" spacing={1.5} sx={{ maxWidth: 1280, mx: "auto", px: { xs: 1.5, sm: 2 }, py: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <Button component={Link} href="/" startIcon={<ArrowLeft size={16} />} size="small" color="inherit">
            SmartFlip
          </Button>
          <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
            {device.title}
          </Typography>
          <HeaderActions />
        </Stack>
      </Paper>

      <Box sx={{ maxWidth: 1280, mx: "auto", px: { xs: 1.5, sm: 2 }, py: { xs: 2.5, sm: 4 } }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 5 }}>
            <Paper variant="outlined" sx={{ overflow: "hidden" }}>
              {device.photos.length > 0 ? (
                <PhotoGallery
                  photos={device.photos}
                  alt={device.title}
                  variant="detail"
                  show_thumbnails
                  test_id="detail-photo-gallery"
                />
              ) : (
                <Box sx={{ aspectRatio: "4/3", display: "flex", alignItems: "center", justifyContent: "center", color: "text.disabled" }}>
                  <Smartphone size={48} aria-hidden />
                </Box>
              )}
            </Paper>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 2 }}>
              <Button
                component="a"
                href={device.olx_url}
                target="_blank"
                rel="noopener noreferrer"
                variant="contained"
                startIcon={<ExternalLink size={16} />}
                fullWidth
              >
                {t("olx_listing")}
              </Button>
              {device.allegro_search_url && (
                <Button
                  component="a"
                  href={device.allegro_search_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outlined"
                  startIcon={<Wrench size={16} />}
                  fullWidth
                >
                  {t("allegro_search")}
                </Button>
              )}
              {device.ifixit_url && (
                <Button
                  component="a"
                  href={device.ifixit_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outlined"
                  fullWidth
                >
                  {t("ifixit_guide")}
                </Button>
              )}
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 7 }}>
            <Stack spacing={2.5}>
              <Box>
                <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: "center", flexWrap: "wrap" }}>
                  <Typography variant="overline" color="primary" sx={{ fontWeight: 700 }}>
                    {device.brand !== "unknown" ? device.brand : t_app("brand_fallback")}
                  </Typography>
                  {device.model_line_label && (
                    <Chip size="small" label={`${t("model_line")}: ${device.model_line_label}`} variant="outlined" />
                  )}
                </Stack>
                <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.3 }}>
                  {device.title}
                </Typography>
              </Box>

              {device.damage_types.length > 0 && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t("damage_types")}
                  </Typography>
                  <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                    {device.damage_types.map((dt) => (
                      <DamageTag key={dt} type={dt} />
                    ))}
                  </Stack>
                </Paper>
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

              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                {device.storage_gb !== null && (
                  <Chip icon={<HardDrive size={14} />} label={`${t("storage")}: ${device.storage_gb} GB`} size="small" />
                )}
                {device.has_box && (
                  <Chip icon={<BoxIcon size={14} />} label={t("has_box")} size="small" />
                )}
                {device.release_year !== null && (
                  <Chip icon={<Calendar size={14} />} label={`${t("release_year")}: ${device.release_year}`} size="small" />
                )}
                {device.battery_health_percent !== null && (
                  <Chip
                    icon={<Battery size={14} />}
                    label={`${t("battery_health")}: ${device.battery_health_percent}%`}
                    size="small"
                    color={device.damage_types.includes("battery") ? "warning" : "default"}
                  />
                )}
              </Stack>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <StatBar
                      label={t("liquidity_score")}
                      value={liquidity_pct}
                      display_value={liquidity_pct !== null ? `${Math.round(liquidity_pct)}` : "—"}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <StatBar
                      label={t("profitability_pct")}
                      value={profitability_pct_normalized}
                      display_value={device.profitability_pct !== null ? `${device.profitability_pct}%` : "—"}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <StatBar
                      label={t("repairability_score")}
                      value={repairability_pct_bar}
                      display_value={repairability_normalized !== null ? `${repairability_normalized}/10` : "—"}
                    />
                    {is_repairability_stub && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                        {t("repairability_stub")}
                      </Typography>
                    )}
                  </Grid>
                </Grid>
              </Paper>

              <Grid container spacing={1.5}>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <MetricPaper label={t("buy_price")} value={device.price_buy !== null ? `${device.price_buy} zł` : "—"} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <MetricPaper label={t("parts_cost")} value={device.parts_cost_estimate !== null ? `~${device.parts_cost_estimate} zł` : "—"} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <MetricPaper
                    label={t("sell_price_estimate")}
                    value={device.market_sell_price !== null ? `~${device.market_sell_price} zł` : "—"}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <MetricPaper
                    label={t("profit_estimate")}
                    value={device.profit_estimate !== null ? `${device.profit_estimate} zł` : "—"}
                    highlight={getMetricHighlight(device.profit_estimate)}
                  />
                </Grid>
              </Grid>

              {device.market_sell_price_source && (
                <Typography variant="caption" color="text.secondary">
                  {device.market_sell_price_source === "model_median"
                    ? t("price_source_median")
                    : device.market_sell_price_source === "cached_median"
                      ? t("price_source_cached")
                      : device.market_sell_price_source === "model_hint"
                        ? t("price_source_hint")
                        : t("price_source_estimate")}
                </Typography>
              )}

              {(device.city || device.seller_name) && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t("location")}
                  </Typography>
                  <Stack spacing={1}>
                    {device.city && (
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <MapPin size={16} />
                        <Typography variant="body2">
                          {device.city}{device.region ? `, ${device.region}` : ""}
                        </Typography>
                      </Stack>
                    )}
                    {device.seller_name && (
                      <>
                        <Divider />
                        <Typography variant="subtitle2" color="text.secondary">
                          {t("seller_title")}
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <User size={16} />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{device.seller_name}</Typography>
                        </Stack>
                        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
                          {device.seller_ads_count !== null && (
                            <Typography variant="caption" color="text.secondary">
                              {t("seller_ads_count")}: {device.seller_ads_count}
                            </Typography>
                          )}
                          {device.seller_member_since && (
                            <Typography variant="caption" color="text.secondary">
                              {t("seller_member_since")}: {device.seller_member_since}
                            </Typography>
                          )}
                        </Stack>
                      </>
                    )}
                  </Stack>
                </Paper>
              )}

              <Typography variant="caption" color="text.secondary">
                {t("posted")}: {posted_date}
              </Typography>

              {device.post_summary && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t("description")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                    {device.post_summary}
                  </Typography>
                </Paper>
              )}
            </Stack>
          </Grid>
        </Grid>

        {(device.allegro_parts.length > 0 || device.damage_types.length > 0) && (
          <Paper variant="outlined" sx={{ mt: 4, p: { xs: 2, sm: 3 } }}>
            <Stack direction="row" sx={{ mb: 2, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                <Package size={18} style={{ verticalAlign: "middle", marginRight: 8 }} />
                {t("parts_title")}
              </Typography>
              {has_estimate_parts && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                  <Star size={12} aria-hidden /> — {t("estimate_note")}
                </Typography>
              )}
              {has_parts_store_parts && !has_estimate_parts && (
                <Typography variant="caption" color="text.secondary">
                  {t("parts_source_parts_store")}
                </Typography>
              )}
            </Stack>
            <Grid container spacing={2}>
              {device.allegro_parts.map((part, i) => {
                const is_estimate = isPartEstimate(part);
                const repair_note_text = is_estimate && part.damage_type
                  ? t_repair_stub(part.damage_type as never)
                  : null;
                return (
                  <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                    <Paper
                      component="a"
                      href={part.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="outlined"
                      sx={{
                        display: "flex", gap: 1.5, p: 1.5, textDecoration: "none", color: "inherit",
                        height: "100%", transition: "box-shadow 0.2s",
                        "&:hover": { boxShadow: 2 },
                        opacity: is_estimate ? 0.9 : 1,
                      }}
                    >
                      {part.image ? (
                        <Box
                          component="img"
                          src={part.image}
                          alt={part.title}
                          sx={{ width: 72, height: 72, objectFit: "cover", borderRadius: 1, flexShrink: 0 }}
                        />
                      ) : (
                        <Box sx={{
                          width: 72, height: 72, borderRadius: 1, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          bgcolor: "action.hover", color: "text.secondary",
                        }}>
                          <Wrench size={22} aria-hidden />
                        </Box>
                      )}
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", mb: 0.5 }}>
                          <Chip
                            size="small"
                            label={getPartSourceLabel(part, t)}
                            variant="outlined"
                            sx={{ height: 20, fontSize: "0.6875rem" }}
                          />
                        </Stack>
                        <Typography variant="body2" sx={{ fontWeight: 600, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {part.title}
                        </Typography>
                        {repair_note_text && (
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {repair_note_text}
                          </Typography>
                        )}
                        {part.price !== null && (
                          <Typography variant="body2" color="primary" sx={{ mt: 0.5, fontWeight: 700 }}>
                            {part.price} {part.currency ?? "zł"}
                            {is_estimate && (
                              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5, display: "inline-flex", alignItems: "center", gap: 0.25 }}>
                                (<Star size={10} aria-hidden /> {t("estimate_badge")})
                              </Typography>
                            )}
                          </Typography>
                        )}
                      </Box>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          </Paper>
        )}
      </Box>
    </AppShell>
  );
}
