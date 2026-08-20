"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import {
  Box, Button, Chip, CircularProgress, FormControl, InputLabel, MenuItem,
  Paper, Select, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography,
} from "@mui/material";
import type { AppLocale } from "@/shared/config/i18n/config";
import {
  fetchAdminScanIssues,
  fetchAdminScans,
  type AdminScanIssueRow,
  type AdminScanRunSummary,
} from "@/shared/api/client";

const DATE_LOCALE_MAP: Record<AppLocale, string> = {
  pl: "pl-PL",
  en: "en-US",
  ru: "ru-RU",
};

const PAGE_SIZE = 50;

type SeverityFilter = "all" | "error" | "warning";

const SCAN_ISSUE_KINDS = [
  "listing_timeout",
  "listing_fetch_failed",
  "listing_analyze_error",
  "degraded_to_lightweight",
  "olx_page_failed",
  "olx_state_failed",
  "parts_source_failed",
  "feed_not_replaced",
  "missing_repairability",
  "repairability_stub",
  "estimate_parts",
  "missing_parts",
  "weak_market_price",
  "missing_market_price",
  "missing_photos",
  "empty_description",
] as const;

type ScanIssueKindKey = typeof SCAN_ISSUE_KINDS[number];

export function AdminScanLogPage() {
  const t = useTranslations("admin.scan_log");
  const locale = useLocale() as AppLocale;
  const [scans, set_scans] = useState<AdminScanRunSummary[]>([]);
  const [selected_scan_id, set_selected_scan_id] = useState<string | null>(null);
  const [severity, set_severity] = useState<SeverityFilter>("all");
  const [items, set_items] = useState<AdminScanIssueRow[]>([]);
  const [total_count, set_total_count] = useState(0);
  const [offset, set_offset] = useState(0);
  const [loading_scans, set_loading_scans] = useState(true);
  const [loading_issues, set_loading_issues] = useState(false);

  const selected_scan = scans.find((scan) => scan.id === selected_scan_id) ?? null;

  const loadScans = useCallback(async () => {
    set_loading_scans(true);
    try {
      const rows = await fetchAdminScans();
      set_scans(rows);
      set_selected_scan_id((prev) => prev ?? rows[0]?.id ?? null);
    } finally {
      set_loading_scans(false);
    }
  }, []);

  const loadIssues = useCallback(async () => {
    if (!selected_scan_id) {
      set_items([]);
      set_total_count(0);
      return;
    }

    set_loading_issues(true);
    try {
      const page = await fetchAdminScanIssues({
        scan_id: selected_scan_id,
        severity: severity === "all" ? undefined : severity,
        offset,
        limit: PAGE_SIZE,
      });
      set_items(page.items);
      set_total_count(page.total_count);
    } finally {
      set_loading_issues(false);
    }
  }, [offset, selected_scan_id, severity]);

  useEffect(() => {
    void loadScans();
  }, [loadScans]);

  useEffect(() => {
    set_offset(0);
  }, [selected_scan_id, severity]);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  function formatDate(value: string | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleString(DATE_LOCALE_MAP[locale], {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function kindLabel(kind: string): string {
    if ((SCAN_ISSUE_KINDS as readonly string[]).includes(kind)) {
      return t(`kinds.${kind as ScanIssueKindKey}`);
    }
    return kind;
  }

  const page_start = total_count === 0 ? 0 : offset + 1;
  const page_end = Math.min(offset + PAGE_SIZE, total_count);
  const can_prev = offset > 0;
  const can_next = offset + PAGE_SIZE < total_count;

  return (
    <>
      <Typography variant="h2" component="h1" sx={{ mb: 0.5, fontWeight: 900 }}>
        {t("title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t("subtitle")}
      </Typography>

      {loading_scans ? (
        <Stack direction="row" spacing={1} color="text.secondary">
          <CircularProgress size={18} color="inherit" />
          <Typography variant="body2">{t("loading")}</Typography>
        </Stack>
      ) : scans.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{t("empty")}</Typography>
      ) : (
        <>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ mb: 2 }}
          >
            <FormControl size="small" sx={{ minWidth: 280, flex: 1 }}>
              <InputLabel id="scan-select-label">{t("scan_label")}</InputLabel>
              <Select
                labelId="scan-select-label"
                label={t("scan_label")}
                value={selected_scan_id ?? ""}
                onChange={(event) => set_selected_scan_id(event.target.value || null)}
              >
                {scans.map((scan) => (
                  <MenuItem key={scan.id} value={scan.id}>
                    {formatDate(scan.started_at)}
                    {" · "}
                    {scan.devices_count} {t("devices_short")}
                    {" · "}
                    {t("counts_short", { issues: scan.issues_count, warnings: scan.warnings_count })}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="severity-select-label">{t("severity_label")}</InputLabel>
              <Select
                labelId="severity-select-label"
                label={t("severity_label")}
                value={severity}
                onChange={(event) => set_severity(event.target.value as SeverityFilter)}
              >
                <MenuItem value="all">{t("severity_all")}</MenuItem>
                <MenuItem value="error">{t("severity_error")}</MenuItem>
                <MenuItem value="warning">{t("severity_warning")}</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          {selected_scan && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2, typography: "caption", color: "text.secondary" }}>
              <span>{t("status")}: {selected_scan.status}</span>
              <span>{t("finished")}: {formatDate(selected_scan.finished_at)}</span>
              <span>{t("counts_short", { issues: selected_scan.issues_count, warnings: selected_scan.warnings_count })}</span>
            </Box>
          )}

          {loading_issues ? (
            <Stack direction="row" spacing={1} color="text.secondary" sx={{ mt: 2 }}>
              <CircularProgress size={18} color="inherit" />
              <Typography variant="body2">{t("loading")}</Typography>
            </Stack>
          ) : items.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {t("no_issues")}
            </Typography>
          ) : (
            <>
              <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>{t("col_severity")}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t("col_kind")}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t("col_listing")}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t("col_message")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Chip
                            label={item.severity === "error" ? t("severity_error") : t("severity_warning")}
                            size="small"
                            color={item.severity === "error" ? "error" : "warning"}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {kindLabel(item.kind)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.title ?? "—"}
                          </Typography>
                          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                            {item.listing_id !== null && (
                              <Typography
                                component={Link}
                                href={`/devices/${item.listing_id}`}
                                variant="caption"
                                color="primary"
                              >
                                #{item.listing_id}
                              </Typography>
                            )}
                            {item.olx_url && (
                              <Typography
                                component="a"
                                href={item.olx_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="caption"
                                color="primary"
                                sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                              >
                                OLX
                                <ExternalLink size={12} aria-hidden />
                              </Typography>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {item.message}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Stack
                spacing={1}
                sx={{
                  mt: 2,
                  flexDirection: { xs: "column", sm: "row" },
                  alignItems: { sm: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {t("page_info", { from: page_start, to: page_end, total: total_count })}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!can_prev}
                    startIcon={<ChevronLeft size={14} />}
                    onClick={() => set_offset((prev) => Math.max(0, prev - PAGE_SIZE))}
                  >
                    {t("prev")}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!can_next}
                    endIcon={<ChevronRight size={14} />}
                    onClick={() => set_offset((prev) => prev + PAGE_SIZE)}
                  >
                    {t("next")}
                  </Button>
                </Stack>
              </Stack>
            </>
          )}
        </>
      )}
    </>
  );
}
