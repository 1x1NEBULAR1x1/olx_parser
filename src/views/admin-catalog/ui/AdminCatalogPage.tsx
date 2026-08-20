"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Box, Checkbox, Chip, FormControl, InputLabel, MenuItem,
  Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography,
} from "@mui/material";
import {
  AlertCircle, CheckCircle2, Clock, Database, Play, RefreshCw, Search,
  Settings2, ShieldAlert, Wand2,
} from "lucide-react";
import {
  enrichAdminCatalog,
  fetchAdminCatalog,
  fetchAdminCatalogIds,
  fetchSettings,
  syncAdminCatalog,
  updateSettings,
  type DeviceCatalogRow,
} from "@/shared/api/client";
import { Pagination } from "@/shared/ui/pagination/Pagination";
import { TermHint } from "@/shared/ui/term-hint/TermHint";
import { ErrorState, LoadingCenter } from "@/shared/ui/page-layout";
import { getErrorCopy } from "@/shared/lib/api-error";
import { CatalogJobBanner } from "./CatalogJobBanner";
import {
  CATALOG_PAGE_SIZE_OPTIONS,
  catalogDeviceHref,
  catalogListHref,
  parseCatalogListQuery,
  type CatalogListQuery,
} from "../lib/catalog-list-query";
import { useCatalogEnrichmentLive } from "../lib/use-catalog-enrichment-live";
import styles from "./AdminCatalogPage.module.scss";

type CatalogBusyAction =
  | "refresh"
  | "sync"
  | "enrich_pending"
  | "enrich_all"
  | "enrich_selected"
  | "select_matching"
  | "save_settings"
  | null;

const CATALOG_AUTO_INTERVALS = [0, 60, 180, 360, 720, 1440] as const;

function statusIcon(status: DeviceCatalogRow["enrichment_status"]) {
  if (status === "ready") return CheckCircle2;
  if (status === "enriching") return RefreshCw;
  if (status === "stale") return Clock;
  if (status === "error") return AlertCircle;
  return Clock;
}

export function AdminCatalogPage() {
  const t = useTranslations("admin.catalog");
  const te = useTranslations("errors");
  const router = useRouter();
  const [items, set_items] = useState<DeviceCatalogRow[]>([]);
  const [brands, set_brands] = useState<string[]>([]);
  const [model_lines, set_model_lines] = useState<Array<{ value: string; label: string }>>([]);
  const [total_count, set_total_count] = useState(0);
  const [page, set_page] = useState(1);
  const [page_size, set_page_size] = useState(30);
  const [search_input, set_search_input] = useState("");
  const [search, set_search] = useState("");
  const [brand, set_brand] = useState("");
  const [model_line, set_model_line] = useState("");
  const [status, set_status] = useState("");
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<unknown>(null);
  const [busy_action, set_busy_action] = useState<CatalogBusyAction>(null);
  const enrich_status = useCatalogEnrichmentLive();
  const [selected_ids, set_selected_ids] = useState<Set<number>>(new Set());
  const [settings_open, set_settings_open] = useState(false);
  const [auto_interval, set_auto_interval] = useState(0);
  const [antibot_wait, set_antibot_wait] = useState(45);
  const [antibot_retries, set_antibot_retries] = useState(2);
  const [source_delay, set_source_delay] = useState(400);
  const [settings_saved, set_settings_saved] = useState(false);
  const [list_ready, set_list_ready] = useState(false);
  const [is_pending, set_is_pending] = useState(false);
  const was_running = useRef(false);
  const skip_search_page_reset = useRef(true);
  const url_write_mode = useRef<"replace" | "push" | null>(null);

  const list_query = useMemo<CatalogListQuery>(() => ({
    page,
    page_size,
    search,
    brand,
    model_line,
    status,
  }), [page, page_size, search, brand, model_line, status]);

  function applyListQuery(query: CatalogListQuery) {
    set_page(query.page);
    set_page_size(query.page_size);
    set_search_input(query.search);
    set_search(query.search);
    set_brand(query.brand);
    set_model_line(query.model_line);
    set_status(query.status);
  }

  useLayoutEffect(() => {
    applyListQuery(parseCatalogListQuery(new URLSearchParams(window.location.search)));
    set_list_ready(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next_search = search_input.trim();
      set_search(next_search);
      if (skip_search_page_reset.current) {
        skip_search_page_reset.current = false;
        return;
      }
      if (next_search !== search) {
        url_write_mode.current = "replace";
        set_page(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search_input, search]);

  const loadItems = useCallback(async () => {
    if (!list_ready) return;
    set_is_pending(true);
    try {
      const page_result = await fetchAdminCatalog({
        offset: (page - 1) * page_size,
        limit: page_size,
        search: search || undefined,
        brand: brand || undefined,
        model_line: model_line || undefined,
        status: status || undefined,
      });
      set_items(page_result.items);
      set_total_count(page_result.total_count);
      set_brands(page_result.brands ?? []);
      set_model_lines(page_result.model_lines ?? []);
      set_error(null);
    } catch (caught) {
      set_error(caught);
    } finally {
      set_loading(false);
      set_is_pending(false);
    }
  }, [list_ready, page, page_size, search, brand, model_line, status]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!list_ready) return;
    const next_url = catalogListHref(list_query);
    const current = `${window.location.pathname}${window.location.search}`;
    if (current === next_url) {
      url_write_mode.current = null;
      return;
    }
    const mode = url_write_mode.current ?? "replace";
    url_write_mode.current = null;
    if (mode === "push") {
      window.history.pushState(window.history.state, "", next_url);
    } else {
      window.history.replaceState(window.history.state, "", next_url);
    }
  }, [list_ready, list_query]);

  useEffect(() => {
    function handlePopState() {
      skip_search_page_reset.current = true;
      applyListQuery(parseCatalogListQuery(new URLSearchParams(window.location.search)));
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    void fetchSettings().then((settings) => {
      set_auto_interval(settings.catalog_auto_enrich_interval_minutes ?? 0);
      set_antibot_wait(settings.catalog_antibot_wait_seconds ?? 45);
      set_antibot_retries(settings.catalog_antibot_retries ?? 2);
      set_source_delay(settings.catalog_source_delay_ms ?? 400);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (was_running.current && !enrich_status?.is_running) {
      void loadItems();
    }
    was_running.current = Boolean(enrich_status?.is_running);
  }, [enrich_status?.is_running, loadItems]);

  const total_pages = Math.max(1, Math.ceil(total_count / page_size));
  const current_page = Math.min(page, total_pages);
  const page_from = total_count === 0 ? 0 : (current_page - 1) * page_size + 1;
  const page_to = Math.min(current_page * page_size, total_count);
  const page_ids = useMemo(() => items.map((item) => item.id), [items]);
  const all_page_selected = page_ids.length > 0 && page_ids.every((id) => selected_ids.has(id));
  const some_page_selected = page_ids.some((id) => selected_ids.has(id));

  useEffect(() => {
    if (loading) return;
    if (page > total_pages) {
      url_write_mode.current = "replace";
      set_page(total_pages);
    }
  }, [loading, page, total_pages]);

  async function handleRefresh() {
    set_busy_action("refresh");
    try {
      await loadItems();
    } finally {
      set_busy_action(null);
    }
  }

  async function handleSync() {
    set_busy_action("sync");
    try {
      await syncAdminCatalog();
      url_write_mode.current = "replace";
      set_page(1);
      await loadItems();
    } finally {
      set_busy_action(null);
    }
  }

  async function handleEnrich(only_pending: boolean) {
    set_busy_action(only_pending ? "enrich_pending" : "enrich_all");
    try {
      await enrichAdminCatalog({ only_pending });
    } finally {
      set_busy_action(null);
    }
  }

  async function handleEnrichSelected() {
    if (selected_ids.size === 0) return;
    set_busy_action("enrich_selected");
    try {
      await enrichAdminCatalog({ entry_ids: [...selected_ids] });
    } finally {
      set_busy_action(null);
    }
  }

  async function handleSelectMatching() {
    set_busy_action("select_matching");
    try {
      const result = await fetchAdminCatalogIds({
        search: search || undefined,
        brand: brand || undefined,
        model_line: model_line || undefined,
        status: status || undefined,
      });
      set_selected_ids(new Set(result.entry_ids));
    } finally {
      set_busy_action(null);
    }
  }

  function togglePageSelection() {
    set_selected_ids((prev) => {
      const next = new Set(prev);
      if (all_page_selected) {
        for (const id of page_ids) next.delete(id);
      } else {
        for (const id of page_ids) next.add(id);
      }
      return next;
    });
  }

  function toggleRow(id: number) {
    set_selected_ids((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSaveSettings() {
    set_busy_action("save_settings");
    set_settings_saved(false);
    try {
      await updateSettings({
        catalog_auto_enrich_interval_minutes: auto_interval,
        catalog_antibot_wait_seconds: antibot_wait,
        catalog_antibot_retries: antibot_retries,
        catalog_source_delay_ms: source_delay,
      });
      set_settings_saved(true);
    } finally {
      set_busy_action(null);
    }
  }

  return (
    <>
      <Typography variant="h2" component="h1" sx={{ mb: 0.5, fontWeight: 900 }}>
        {t("title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t("subtitle")}
      </Typography>

      <div className={styles.catalog_toolbar}>
        <TextField
          size="small"
          label={t("search")}
          value={search_input}
          onChange={(event) => set_search_input(event.target.value)}
          className={styles.catalog_search}
          slotProps={{
            input: {
              startAdornment: <Search size={14} className={styles.catalog_search_icon} />,
            },
          }}
        />
        <FormControl size="small" className={styles.catalog_field}>
          <InputLabel>{t("filter_brand")}</InputLabel>
          <Select
            label={t("filter_brand")}
            value={brand}
            onChange={(event) => {
              url_write_mode.current = "replace";
              set_brand(event.target.value);
              set_model_line("");
              set_page(1);
            }}
          >
            <MenuItem value="">{t("filter_all")}</MenuItem>
            {brands.map((item) => (
              <MenuItem key={item} value={item}>{item}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" className={styles.catalog_field}>
          <InputLabel>{t("filter_line")}</InputLabel>
          <Select
            label={t("filter_line")}
            value={model_line}
            onChange={(event) => {
              url_write_mode.current = "replace";
              set_model_line(event.target.value);
              set_page(1);
            }}
          >
            <MenuItem value="">{t("filter_all")}</MenuItem>
            {model_lines.map((item) => (
              <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" className={styles.catalog_field}>
          <InputLabel>{t("filter_status")}</InputLabel>
          <Select
            label={t("filter_status")}
            value={status}
            onChange={(event) => {
              url_write_mode.current = "replace";
              set_status(event.target.value);
              set_page(1);
            }}
          >
            <MenuItem value="">{t("filter_all")}</MenuItem>
            {["pending", "enriching", "ready", "stale", "error"].map((item) => (
              <MenuItem key={item} value={item}>{t(`status_${item}`)}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <div className={styles.catalog_actions}>
          <button
            type="button"
            className={`${styles.catalog_btn} ${busy_action === "refresh" ? styles.catalog_btn_busy : ""}`}
            disabled={busy_action !== null}
            onClick={() => void handleRefresh()}
          >
            <RefreshCw size={14} />
            {busy_action === "refresh" ? t("refresh_working") : t("refresh")}
          </button>
          <button
            type="button"
            className={`${styles.catalog_btn} ${styles.catalog_btn_primary} ${busy_action === "sync" ? styles.catalog_btn_busy : ""}`}
            disabled={busy_action !== null}
            onClick={() => void handleSync()}
          >
            <Database size={14} />
            {busy_action === "sync" ? t("sync_working") : t("sync_from_scan")}
          </button>
          <button
            type="button"
            className={`${styles.catalog_btn} ${styles.catalog_btn_primary} ${busy_action === "enrich_pending" ? styles.catalog_btn_busy : ""}`}
            disabled={busy_action !== null || Boolean(enrich_status?.is_running)}
            onClick={() => void handleEnrich(true)}
          >
            <Wand2 size={14} />
            {busy_action === "enrich_pending" ? t("enrich_working") : t("enrich_pending")}
          </button>
          <button
            type="button"
            className={`${styles.catalog_btn} ${busy_action === "enrich_all" ? styles.catalog_btn_busy : ""}`}
            disabled={busy_action !== null || Boolean(enrich_status?.is_running)}
            onClick={() => void handleEnrich(false)}
          >
            <RefreshCw size={14} />
            {busy_action === "enrich_all" ? t("enrich_working") : t("enrich_all")}
          </button>
          <button
            type="button"
            className={styles.catalog_btn}
            onClick={() => set_settings_open((open) => !open)}
          >
            <Settings2 size={14} />
            {t("settings_title")}
          </button>
        </div>
      </div>

      {settings_open && (
        <Paper variant="outlined" className={styles.catalog_settings}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>
            {t("settings_title")}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
            {t("settings_hint")}
          </Typography>
          <div className={styles.catalog_settings_grid}>
            <FormControl size="small">
              <InputLabel>{t("settings_auto")}</InputLabel>
              <Select
                label={t("settings_auto")}
                value={auto_interval}
                onChange={(event) => set_auto_interval(Number(event.target.value))}
              >
                {CATALOG_AUTO_INTERVALS.map((minutes) => (
                  <MenuItem key={minutes} value={minutes}>{t(`settings_auto_${minutes}`)}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              type="number"
              label={t("settings_antibot_wait")}
              helperText={t("settings_antibot_wait_hint")}
              value={antibot_wait}
              onChange={(event) => set_antibot_wait(Number(event.target.value))}
              slotProps={{
                input: {
                  startAdornment: <ShieldAlert size={14} className={styles.catalog_search_icon} />,
                },
              }}
            />
            <TextField
              size="small"
              type="number"
              label={t("settings_antibot_retries")}
              value={antibot_retries}
              onChange={(event) => set_antibot_retries(Number(event.target.value))}
            />
            <TextField
              size="small"
              type="number"
              label={t("settings_source_delay")}
              value={source_delay}
              onChange={(event) => set_source_delay(Number(event.target.value))}
            />
          </div>
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: "center" }}>
            <button
              type="button"
              className={`${styles.catalog_btn} ${styles.catalog_btn_primary}`}
              disabled={busy_action !== null}
              onClick={() => void handleSaveSettings()}
            >
              {busy_action === "save_settings" ? t("settings_saving") : t("settings_save")}
            </button>
            {settings_saved && (
              <Typography variant="body2" color="success.main" sx={{ fontWeight: 600 }}>
                {t("settings_saved")}
              </Typography>
            )}
          </Stack>
        </Paper>
      )}

      <div className={styles.catalog_selection}>
        <Typography variant="body2" color="text.secondary">
          {t("selected_count", { count: selected_ids.size })}
        </Typography>
        <button type="button" className={styles.catalog_btn} onClick={handleSelectMatching} disabled={busy_action !== null}>
          {busy_action === "select_matching" ? t("select_matching_working") : t("select_matching")}
        </button>
        <button
          type="button"
          className={`${styles.catalog_btn} ${styles.catalog_btn_primary}`}
          disabled={selected_ids.size === 0 || busy_action !== null || Boolean(enrich_status?.is_running)}
          onClick={() => void handleEnrichSelected()}
        >
          <Play size={14} />
          {busy_action === "enrich_selected" ? t("enrich_selected_working") : t("enrich_selected")}
        </button>
        {selected_ids.size > 0 && (
          <button type="button" className={styles.catalog_btn} onClick={() => set_selected_ids(new Set())}>
            {t("clear_selection")}
          </button>
        )}
      </div>

      <CatalogJobBanner status={enrich_status} />

      {loading && items.length === 0 ? (
        <LoadingCenter label={t("loading")} compact />
      ) : error && items.length === 0 ? (
        <ErrorState
          message={getErrorCopy(error, te)}
          onRetry={() => void loadItems()}
        />
      ) : (
        <>
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ overflowX: "auto" }}
            className={is_pending ? styles.catalog_table_pending : undefined}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={all_page_selected}
                      indeterminate={some_page_selected && !all_page_selected}
                      onChange={togglePageSelection}
                      slotProps={{ input: { "aria-label": t("select_all_page") } }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{t("col_model")}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>
                    <TermHint label={t("col_status")} hint={t("col_status_hint")} />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>
                    <TermHint label={t("col_repair")} hint={t("col_repair_hint")} />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>
                    <TermHint label={t("col_market")} hint={t("col_market_hint")} />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>
                    <TermHint label={t("col_listings")} hint={t("col_listings_hint")} />
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary">{t("list_empty")}</Typography>
                    </TableCell>
                  </TableRow>
                ) : items.map((item) => {
                  const Icon = statusIcon(item.enrichment_status);
                  const is_current = enrich_status?.is_running && enrich_status.current_entry_id === item.id;
                  const live_status = is_current ? "enriching" : item.enrichment_status;
                  return (
                    <TableRow
                      key={item.id}
                      hover
                      selected={selected_ids.has(item.id)}
                      className={is_current ? styles.catalog_row_live : undefined}
                      sx={{ cursor: "pointer" }}
                      onClick={() => router.push(catalogDeviceHref(item.id, list_query))}
                    >
                      <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          size="small"
                          checked={selected_ids.has(item.id)}
                          onChange={() => toggleRow(item.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {item.model_label || item.model_key}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.brand}
                          {item.model_line_label ? ` · ${item.model_line_label}` : ""}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={<Icon size={13} className={live_status === "enriching" ? styles.catalog_status_spin : undefined} />}
                          label={is_current
                            ? (enrich_status?.current_stage === "waiting_antibot"
                              ? t("status_waiting")
                              : t("status_enriching"))
                            : t(`status_${item.enrichment_status}`)}
                          size="small"
                          variant="outlined"
                          color={item.enrichment_status === "error" ? "error" : "default"}
                        />
                      </TableCell>
                      <TableCell>
                        {item.lock_repairability && item.manual_repairability_score !== null
                          ? `${item.manual_repairability_score}/${item.manual_repairability_scale ?? "?"}`
                          : item.repairability_score !== null
                            ? `${item.repairability_score}/${item.repairability_scale ?? "?"}`
                            : "—"}
                      </TableCell>
                      <TableCell>
                        {item.lock_market_price && item.manual_storage_prices
                          ? t("market_manual")
                          : item.market_sell_price !== null
                            ? `${item.market_sell_price} PLN`
                            : "—"}
                      </TableCell>
                      <TableCell>{item.listings_seen_count}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ mt: 2, alignItems: { sm: "center" } }}
          >
            <Typography variant="body2" color="text.secondary">
              {t("page_info", { from: page_from, to: page_to, total: total_count })}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Pagination
              current_page={current_page}
              total_pages={total_pages}
              page_size={page_size}
              page_size_options={CATALOG_PAGE_SIZE_OPTIONS}
              onChange={(next_page) => {
                url_write_mode.current = "push";
                set_page(next_page);
              }}
              onPageSizeChange={(next_size) => {
                url_write_mode.current = "replace";
                set_page_size(next_size);
                set_page(1);
              }}
            />
          </Stack>
        </>
      )}
    </>
  );
}
