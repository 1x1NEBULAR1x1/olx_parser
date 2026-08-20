"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Box, Button, Checkbox, Chip, CircularProgress, FormControl, FormControlLabel,
  InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { ArrowLeft, BarChart3, ChevronLeft, ChevronRight, Layers, Megaphone, ShoppingBag, Store } from "lucide-react";
import {
  fetchAdminCatalogDetail,
  fetchAdminCatalogParts,
  patchAdminCatalogEntry,
  type CatalogPartsCacheRow,
  type CatalogStorageStat,
  type DeviceCatalogRow,
} from "@/shared/api/client";
import { inferPartSource, PART_SOURCE_I18N_KEY } from "@/shared/lib/part-utils";
import { RangeSlider } from "@/shared/ui/range-slider/RangeSlider";
import { TermHint } from "@/shared/ui/term-hint/TermHint";
import { PartSourceBadge } from "@/shared/ui/part-source-badge/PartSourceBadge";
import { PartImage } from "@/shared/ui/part-image/PartImage";
import type { CatalogNeighborInfo, ManualPartsSource } from "@/shared/types/catalog";
import type { PartSource } from "@/shared/types/domain";
import {
  catalogDeviceHref,
  catalogListHref,
  DEFAULT_CATALOG_LIST_QUERY,
  parseCatalogListQuery,
  type CatalogListQuery,
} from "../lib/catalog-list-query";
import { useCatalogEnrichmentLive } from "../lib/use-catalog-enrichment-live";
import { CatalogManualJobBanner } from "./CatalogJobBanner";
import styles from "./AdminCatalogDevicePage.module.scss";

const DAMAGE_TYPE_KEYS = [
  "screen", "battery", "back_cover", "buttons", "charging_port",
  "camera", "speaker", "microphone", "body", "frame", "locked",
  "water_damage", "software", "sim_slot", "unknown",
] as const;

type DamageTypeKey = (typeof DAMAGE_TYPE_KEYS)[number];

function isDamageTypeKey(value: string): value is DamageTypeKey {
  return (DAMAGE_TYPE_KEYS as readonly string[]).includes(value);
}

interface FlattenedPartRow {
  key: string;
  title: string;
  price: number | null;
  currency: string | null;
  url: string;
  image: string | null;
  damage_type: string;
  source: PartSource;
}

function flattenPartsCaches(caches: CatalogPartsCacheRow[]): FlattenedPartRow[] {
  const seen = new Set<string>();
  const rows: FlattenedPartRow[] = [];

  for (const cache of caches) {
    const signature_types = cache.damage_signature.split(",").map((item) => item.trim()).filter(Boolean);
    for (const part of cache.parts) {
      const key = part.url || `${part.title}-${part.price ?? "none"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        key,
        title: part.title,
        price: part.price,
        currency: part.currency,
        url: part.url,
        image: part.image,
        damage_type: part.damage_type || signature_types[0] || "unknown",
        source: inferPartSource(part),
      });
    }
  }

  return rows.sort((a, b) => (a.price ?? 999999) - (b.price ?? 999999));
}

const SOURCE_SCAN_ACTIONS: Array<{
  source: ManualPartsSource;
  label_key: "fetch_allegro_parts" | "fetch_ceneo_parts" | "fetch_shop_parts" | "fetch_olx_parts" | "fetch_all_parts";
  icon: typeof ShoppingBag;
  variant: "outlined" | "contained";
}> = [
  { source: "allegro", label_key: "fetch_allegro_parts", icon: ShoppingBag, variant: "outlined" },
  { source: "ceneo", label_key: "fetch_ceneo_parts", icon: BarChart3, variant: "outlined" },
  { source: "shop", label_key: "fetch_shop_parts", icon: Store, variant: "outlined" },
  { source: "olx", label_key: "fetch_olx_parts", icon: Megaphone, variant: "outlined" },
  { source: "all", label_key: "fetch_all_parts", icon: Layers, variant: "contained" },
];

export function AdminCatalogDevicePage() {
  const t = useTranslations("admin.catalog");
  const td = useTranslations("damage_types");
  const t_source = useTranslations("device_detail");
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const [item, set_item] = useState<DeviceCatalogRow | null>(null);
  const [neighbors, set_neighbors] = useState<CatalogNeighborInfo | null>(null);
  const [list_query, set_list_query] = useState<CatalogListQuery>(DEFAULT_CATALOG_LIST_QUERY);
  const [query_ready, set_query_ready] = useState(false);
  const [storage_stats, set_storage_stats] = useState<CatalogStorageStat[]>([]);
  const [parts_caches, set_parts_caches] = useState<CatalogPartsCacheRow[]>([]);
  const [loading, set_loading] = useState(true);
  const [busy, set_busy] = useState(false);
  const [fetching_source, set_fetching_source] = useState<ManualPartsSource | null>(null);
  const [parts_message, set_parts_message] = useState<string | null>(null);
  const enrich_status = useCatalogEnrichmentLive();
  const live_manual_job = enrich_status?.manual_jobs.find((job) => job.entry_id === id) ?? null;
  const [storage_draft, set_storage_draft] = useState<Record<string, string>>({});
  const [type_filter, set_type_filter] = useState("");
  const [source_filter, set_source_filter] = useState("");
  const [price_range, set_price_range] = useState<[number, number] | null>(null);

  useLayoutEffect(() => {
    set_list_query(parseCatalogListQuery(new URLSearchParams(window.location.search)));
    set_query_ready(true);
  }, [id]);

  const loadDetail = useCallback(async () => {
    if (!query_ready || !Number.isFinite(id)) return;
    set_loading(true);
    try {
      const detail = await fetchAdminCatalogDetail(id, {
        brand: list_query.brand || undefined,
        model_line: list_query.model_line || undefined,
        status: list_query.status || undefined,
        search: list_query.search || undefined,
      });
      set_item(detail.item);
      set_neighbors(detail.neighbors);
      set_storage_stats(detail.storage_stats);
      set_parts_caches(detail.parts_caches);
      const draft: Record<string, string> = {};
      for (const stat of detail.storage_stats) {
        draft[String(stat.storage_gb)] = stat.manual_price !== null ? String(stat.manual_price) : "";
      }
      set_storage_draft(draft);
    } finally {
      set_loading(false);
    }
  }, [id, query_ready, list_query.brand, list_query.model_line, list_query.status, list_query.search]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const parts_rows = useMemo(() => flattenPartsCaches(parts_caches), [parts_caches]);
  const type_options = useMemo(
    () => [...new Set(parts_rows.map((row) => row.damage_type))].sort(),
    [parts_rows],
  );
  const source_options = useMemo(
    () => [...new Set(parts_rows.map((row) => row.source))].sort(),
    [parts_rows],
  );
  const price_bounds = useMemo((): [number, number] | null => {
    const prices = parts_rows.map((row) => row.price).filter((price): price is number => price !== null);
    if (prices.length === 0) return null;
    return [Math.floor(Math.min(...prices)), Math.ceil(Math.max(...prices))];
  }, [parts_rows]);

  const active_price_range = price_range ?? price_bounds;

  useEffect(() => {
    set_type_filter("");
    set_source_filter("");
    set_price_range(null);
  }, [parts_caches]);

  const filtered_parts = useMemo(() => {
    const price_filter_active = price_range !== null;
    return parts_rows.filter((row) => {
      if (type_filter && row.damage_type !== type_filter) return false;
      if (source_filter && row.source !== source_filter) return false;
      if (price_filter_active && active_price_range) {
        if (row.price === null) return false;
        if (row.price < active_price_range[0] || row.price > active_price_range[1]) return false;
      }
      return true;
    });
  }, [parts_rows, type_filter, source_filter, price_range, active_price_range]);

  async function handleSave() {
    if (!item) return;
    set_busy(true);
    try {
      const manual_storage_prices: Record<string, number> = {};
      for (const [key, value] of Object.entries(storage_draft)) {
        const parsed = Number(value);
        if (value.trim() !== "" && Number.isFinite(parsed) && parsed > 0) {
          manual_storage_prices[key] = parsed;
        }
      }
      const updated = await patchAdminCatalogEntry(item.id, {
        manual_repairability_score: item.manual_repairability_score,
        manual_repairability_scale: item.manual_repairability_scale,
        manual_market_sell_price: null,
        manual_storage_prices: Object.keys(manual_storage_prices).length > 0 ? manual_storage_prices : null,
        manual_repair_complexity_pct: item.manual_repair_complexity_pct,
        lock_repairability: item.lock_repairability,
        lock_market_price: item.lock_market_price,
        notes: item.notes,
      });
      set_item(updated);
    } finally {
      set_busy(false);
    }
  }

  async function handleFetchParts(sources: ManualPartsSource[]) {
    if (!item) return;
    const active_source = sources[0] ?? "all";
    set_fetching_source(active_source);
    set_parts_message(null);
    try {
      const result = await fetchAdminCatalogParts(item.id, {
        sources,
        use_default_damage_sets: true,
      });
      set_parts_message(t("fetch_parts_done", {
        count: result.parts_found,
        sets: result.damage_sets_processed,
      }));
      await loadDetail();
    } catch {
      set_parts_message(t("fetch_parts_failed"));
    } finally {
      set_fetching_source(null);
    }
  }

  if (loading || !item) {
    return (
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Button component={Link} href={catalogListHref(list_query)} size="small" startIcon={<ArrowLeft size={14} />}>
            {t("back_to_list")}
          </Button>
        </Stack>
        <Stack direction="row" spacing={1} color="text.secondary">
          <CircularProgress size={18} color="inherit" />
          <Typography variant="body2">{t("loading")}</Typography>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Button component={Link} href={catalogListHref(list_query)} size="small" startIcon={<ArrowLeft size={14} />}>
          {t("back_to_list")}
        </Button>
        <div className={styles.nav_pager}>
          {neighbors?.prev_id ? (
            <Button
              component={Link}
              href={catalogDeviceHref(neighbors.prev_id, list_query)}
              size="small"
              aria-label={t("nav_prev")}
            >
              <ChevronLeft size={16} />
            </Button>
          ) : (
            <Button size="small" disabled aria-label={t("nav_prev")}>
              <ChevronLeft size={16} />
            </Button>
          )}
          <Typography variant="body2" color="text.secondary" className={styles.nav_position}>
            {neighbors && neighbors.index > 0
              ? t("nav_position", { index: neighbors.index, total: neighbors.total })
              : "—"}
          </Typography>
          {neighbors?.next_id ? (
            <Button
              component={Link}
              href={catalogDeviceHref(neighbors.next_id, list_query)}
              size="small"
              aria-label={t("nav_next")}
            >
              <ChevronRight size={16} />
            </Button>
          ) : (
            <Button size="small" disabled aria-label={t("nav_next")}>
              <ChevronRight size={16} />
            </Button>
          )}
        </div>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h2" component="h1" sx={{ fontWeight: 900 }}>
            {item.model_label || item.model_key}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {item.brand} · {item.model_key}
            {item.model_line_label ? ` · ${item.model_line_label}` : ""}
            {item.release_year ? ` · ${item.release_year}` : ""}
          </Typography>
        </Box>
        <Chip label={t(`status_${item.enrichment_status}`)} size="small" variant="outlined" />
      </Stack>
      {item.last_enrichment_error && (
        <Typography variant="caption" color="error">{item.last_enrichment_error}</Typography>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          {t("storage_section")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("storage_section_hint")}
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>{t("col_storage")}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>
                  <TermHint label={t("col_listings")} hint={t("col_listings_hint")} />
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>
                  <TermHint label={t("col_median_buy")} hint={t("col_median_buy_hint")} />
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>
                  <TermHint label={t("col_hint_price")} hint={t("col_hint_price_hint")} />
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>
                  <TermHint label={t("col_manual_storage")} hint={t("col_manual_storage_hint")} />
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {storage_stats.map((stat) => (
                <TableRow key={stat.storage_gb}>
                  <TableCell>{stat.storage_gb} GB</TableCell>
                  <TableCell>{stat.listing_count}</TableCell>
                  <TableCell>{stat.median_buy !== null ? `${stat.median_buy} zł` : "—"}</TableCell>
                  <TableCell>{stat.hint_price !== null ? `${stat.hint_price} zł` : "—"}</TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      value={storage_draft[String(stat.storage_gb)] ?? ""}
                      onChange={(event) => set_storage_draft((prev) => ({
                        ...prev,
                        [String(stat.storage_gb)]: event.target.value,
                      }))}
                      sx={{ width: 120 }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
          <FormControlLabel
            sx={{ mt: 2 }}
            control={(
              <Checkbox
                checked={item.lock_market_price}
                onChange={(event) => set_item({ ...item, lock_market_price: event.target.checked })}
              />
            )}
            label={t("field_lock_market")}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", ml: 4, mt: -1 }}>
            {t("field_lock_market_hint")}
          </Typography>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          {t("edit_title")}
        </Typography>
        <Stack spacing={2}>
          <TextField
            label={t("field_manual_repair_score")}
            type="number"
            value={item.manual_repairability_score ?? ""}
            onChange={(event) => set_item({
              ...item,
              manual_repairability_score: event.target.value === "" ? null : Number(event.target.value),
            })}
            helperText={t("field_manual_repair_score_hint")}
          />
          <Typography variant="caption" color="text.secondary">
            {t("repair_keep_previous_hint")}
          </Typography>
          <TextField
            label={t("field_manual_repair_scale")}
            type="number"
            value={item.manual_repairability_scale ?? ""}
            onChange={(event) => set_item({
              ...item,
              manual_repairability_scale: event.target.value === "" ? null : Number(event.target.value),
            })}
            helperText={t("field_manual_repair_scale_hint")}
          />
          <TextField
            label={t("field_repair_complexity_pct")}
            type="number"
            value={item.manual_repair_complexity_pct ?? ""}
            onChange={(event) => set_item({
              ...item,
              manual_repair_complexity_pct: event.target.value === "" ? null : Number(event.target.value),
            })}
            helperText={t("field_repair_complexity_pct_hint")}
          />
          <FormControlLabel
            control={(
              <Checkbox
                checked={item.lock_repairability}
                onChange={(event) => set_item({ ...item, lock_repairability: event.target.checked })}
              />
            )}
            label={t("field_lock_repair")}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", ml: 4, mt: -1 }}>
            {t("field_lock_repair_hint")}
          </Typography>
          <TextField
            label={t("field_notes")}
            multiline
            minRows={3}
            value={item.notes ?? ""}
            onChange={(event) => set_item({ ...item, notes: event.target.value })}
          />
          <Button variant="contained" disabled={busy} onClick={() => void handleSave()}>
            {t("save")}
          </Button>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          {t("parts_section")}
        </Typography>
        <div className={styles.parts_fetch}>
          <span className={styles.parts_fetch_label}>
            <TermHint
              label={t("fetch_parts_manual_label")}
              hint={t("fetch_parts_manual_hint")}
              compact
            />
          </span>
          {SOURCE_SCAN_ACTIONS.map((action) => {
            const Icon = action.icon;
            const is_busy = fetching_source === action.source;
            return (
              <Button
                key={action.source}
                size="small"
                variant={action.variant}
                disabled={fetching_source !== null}
                startIcon={is_busy ? <CircularProgress size={14} color="inherit" /> : <Icon size={14} />}
                onClick={() => void handleFetchParts([action.source])}
              >
                {is_busy ? t("fetch_parts_busy") : t(action.label_key)}
              </Button>
            );
          })}
        </div>
        <CatalogManualJobBanner job={live_manual_job ?? (fetching_source ? {
          entry_id: item.id,
          is_running: true,
          sources: [fetching_source],
          current_source: fetching_source,
          stage: "parts",
          set_index: 0,
          set_total: 0,
          damage_set: null,
          wait_until_ms: null,
          wait_reason: null,
          message: null,
          error: null,
          parts_found: 0,
        } : null)} />
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("parts_priority_hint")}
        </Typography>
        {parts_message && (
          <Typography variant="body2" color="success.main" sx={{ mb: 2 }}>{parts_message}</Typography>
        )}
        {parts_rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">{t("parts_empty")}</Typography>
        ) : (
          <>
            <div className={styles.parts_filters}>
              <FormControl size="small" className={styles.parts_filter}>
                <InputLabel>{t("parts_filter_type")}</InputLabel>
                <Select
                  label={t("parts_filter_type")}
                  value={type_filter}
                  onChange={(event) => set_type_filter(event.target.value)}
                >
                  <MenuItem value="">{t("filter_all")}</MenuItem>
                  {type_options.map((type) => (
                    <MenuItem key={type} value={type}>
                      {isDamageTypeKey(type) ? td(type) : type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" className={styles.parts_filter}>
                <InputLabel>{t("parts_filter_source")}</InputLabel>
                <Select
                  label={t("parts_filter_source")}
                  value={source_filter}
                  onChange={(event) => set_source_filter(event.target.value)}
                >
                  <MenuItem value="">{t("filter_all")}</MenuItem>
                  {source_options.map((source) => (
                    <MenuItem key={source} value={source}>{t_source(PART_SOURCE_I18N_KEY[source])}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {price_bounds && active_price_range && (
                <div className={`${styles.parts_filter} ${styles.parts_filter_price}`}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    {t("parts_filter_price")}
                  </Typography>
                  <RangeSlider
                    min={price_bounds[0]}
                    max={price_bounds[1]}
                    step={1}
                    value={active_price_range}
                    onChange={set_price_range}
                    formatValue={(value) => `${Math.round(value)} zł`}
                  />
                </div>
              )}
            </div>
            <p className={styles.parts_meta}>
              {t("parts_filtered_count", { shown: filtered_parts.length, total: parts_rows.length })}
            </p>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, width: 56 }}>{t("parts_col_photo")}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t("parts_col_title")}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t("parts_filter_type")}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t("parts_filter_price")}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t("parts_filter_source")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered_parts.map((part) => (
                    <TableRow key={part.key}>
                      <TableCell>
                        <div className={styles.parts_thumb}>
                          <PartImage src={part.image} alt={part.title} />
                        </div>
                      </TableCell>
                      <TableCell>
                        {part.url ? (
                          <a href={part.url} target="_blank" rel="noopener noreferrer" className={styles.parts_link}>
                            {part.title}
                          </a>
                        ) : part.title}
                      </TableCell>
                      <TableCell>
                        {isDamageTypeKey(part.damage_type) ? td(part.damage_type) : part.damage_type}
                      </TableCell>
                      <TableCell>
                        {part.price !== null ? `${part.price} ${part.currency ?? "zł"}` : "—"}
                      </TableCell>
                      <TableCell>
                        <PartSourceBadge part={part} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {filtered_parts.length === 0 && (
              <p className={styles.parts_empty}>{t("parts_filter_empty")}</p>
            )}
          </>
        )}
      </Paper>
    </Stack>
  );
}
