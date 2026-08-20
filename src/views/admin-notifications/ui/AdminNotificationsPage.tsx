"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import {
  Box, Button, Checkbox, Chip, CircularProgress, FormControl, FormControlLabel,
  InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from "@mui/material";
import type { AppLocale } from "@/shared/config/i18n/config";
import {
  fetchAdminNotifications,
  fetchAdminUsers,
  sendAdminTestNotification,
  type AdminNotificationLogRow,
  type AdminUserRow,
} from "@/shared/api/client";

const DATE_LOCALE_MAP: Record<AppLocale, string> = {
  pl: "pl-PL",
  en: "en-US",
  ru: "ru-RU",
};

const PAGE_SIZE = 50;

type SourceFilter = "all" | "scan" | "test" | "scan_health";

export function AdminNotificationsPage() {
  const t = useTranslations("admin.notifications");
  const locale = useLocale() as AppLocale;

  const [users, set_users] = useState<AdminUserRow[]>([]);
  const [items, set_items] = useState<AdminNotificationLogRow[]>([]);
  const [total_count, set_total_count] = useState(0);
  const [offset, set_offset] = useState(0);
  const [user_filter, set_user_filter] = useState<string>("all");
  const [source_filter, set_source_filter] = useState<SourceFilter>("all");
  const [loading, set_loading] = useState(true);

  const [test_user_id, set_test_user_id] = useState<string>("");
  const [send_telegram, set_send_telegram] = useState(false);
  const [testing, set_testing] = useState(false);
  const [test_message, set_test_message] = useState<string | null>(null);
  const [test_error, set_test_error] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const rows = await fetchAdminUsers();
    const approved = rows.filter((u) => u.is_approved);
    set_users(approved);
    set_test_user_id((prev) => prev || approved[0]?.id || "");
  }, []);

  const loadLogs = useCallback(async () => {
    set_loading(true);
    try {
      const page = await fetchAdminNotifications({
        offset,
        limit: PAGE_SIZE,
        user_id: user_filter === "all" ? undefined : user_filter,
        source: source_filter === "all" ? undefined : source_filter,
      });
      set_items(page.items);
      set_total_count(page.total_count);
    } finally {
      set_loading(false);
    }
  }, [offset, source_filter, user_filter]);

  useEffect(() => {
    void loadUsers().catch(() => undefined);
  }, [loadUsers]);

  useEffect(() => {
    set_offset(0);
  }, [user_filter, source_filter]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  function formatDate(value: string): string {
    return new Date(value).toLocaleString(DATE_LOCALE_MAP[locale], {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function telegramChipColor(
    status: AdminNotificationLogRow["telegram_status"],
  ): "default" | "success" | "error" | "warning" {
    if (status === "sent") return "success";
    if (status === "failed") return "error";
    if (status === "not_configured") return "warning";
    return "default";
  }

  async function handleTest() {
    if (!test_user_id) return;
    set_testing(true);
    set_test_message(null);
    set_test_error(null);
    try {
      const result = await sendAdminTestNotification({
        user_id: test_user_id,
        send_telegram,
      });
      set_test_message(
        t("test_success", {
          email: result.user_email,
          telegram: t(`telegram_${result.telegram_status}`),
        }),
      );
      await loadLogs();
    } catch (error) {
      set_test_error(error instanceof Error ? error.message : String(error));
    } finally {
      set_testing(false);
    }
  }

  const from = total_count === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total_count);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>{t("title")}</Typography>
        <Typography variant="body2" color="text.secondary">{t("subtitle")}</Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
          {t("test_title")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("test_hint")}
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="test-user-label">{t("test_user_label")}</InputLabel>
            <Select
              labelId="test-user-label"
              label={t("test_user_label")}
              value={test_user_id}
              onChange={(e) => set_test_user_id(e.target.value)}
            >
              {users.map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  {user.email}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={(
              <Checkbox
                checked={send_telegram}
                onChange={(e) => set_send_telegram(e.target.checked)}
              />
            )}
            label={t("test_send_telegram")}
          />
          <Button
            variant="contained"
            onClick={() => void handleTest()}
            disabled={testing || !test_user_id}
          >
            {testing ? t("test_sending") : t("test_send")}
          </Button>
        </Stack>
        {test_message && (
          <Typography variant="body2" color="success.main" sx={{ mt: 1.5, fontWeight: 600 }}>
            {test_message}
          </Typography>
        )}
        {test_error && (
          <Typography variant="body2" color="error.main" sx={{ mt: 1.5 }}>
            {test_error}
          </Typography>
        )}
      </Paper>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="log-user-label">{t("filter_user")}</InputLabel>
          <Select
            labelId="log-user-label"
            label={t("filter_user")}
            value={user_filter}
            onChange={(e) => set_user_filter(e.target.value)}
          >
            <MenuItem value="all">{t("filter_user_all")}</MenuItem>
            {users.map((user) => (
              <MenuItem key={user.id} value={user.id}>{user.email}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="log-source-label">{t("filter_source")}</InputLabel>
          <Select
            labelId="log-source-label"
            label={t("filter_source")}
            value={source_filter}
            onChange={(e) => set_source_filter(e.target.value as SourceFilter)}
          >
            <MenuItem value="all">{t("filter_source_all")}</MenuItem>
            <MenuItem value="scan">{t("source_scan")}</MenuItem>
            <MenuItem value="scan_health">{t("source_scan_health")}</MenuItem>
            <MenuItem value="test">{t("source_test")}</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : items.length === 0 ? (
        <Typography color="text.secondary">{t("empty")}</Typography>
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("col_time")}</TableCell>
                  <TableCell>{t("col_user")}</TableCell>
                  <TableCell>{t("col_listing")}</TableCell>
                  <TableCell>{t("col_source")}</TableCell>
                  <TableCell>{t("col_telegram")}</TableCell>
                  <TableCell>{t("col_metrics")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDate(row.created_at)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.user_email}</Typography>
                      {row.user_name && (
                        <Typography variant="caption" color="text.secondary">{row.user_name}</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.25}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.title}</Typography>
                        {row.olx_listing_id > 0 && (
                          <Button
                            component="a"
                            href={row.olx_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="small"
                            startIcon={<ExternalLink size={14} />}
                            sx={{ alignSelf: "flex-start", px: 0, minWidth: 0 }}
                          >
                            OLX #{row.olx_listing_id}
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={
                          row.source === "test"
                            ? t("source_test")
                            : row.source === "scan_health"
                              ? t("source_scan_health")
                              : t("source_scan")
                        }
                        color={row.source === "test" ? "secondary" : row.source === "scan_health" ? "warning" : "default"}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={t(`telegram_${row.telegram_status}`)}
                        color={telegramChipColor(row.telegram_status)}
                      />
                      {row.telegram_error && (
                        <Typography variant="caption" color="error.main" sx={{ mt: 0.5, maxWidth: 180, display: "block" }}>
                          {row.telegram_error}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ display: "block" }}>
                        {row.price_buy !== null ? `${row.price_buy} zł` : "—"}
                        {" · "}
                        {row.profitability_pct !== null ? `${row.profitability_pct}%` : "—"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
            <Typography variant="body2" color="text.secondary">
              {t("page_info", { from, to, total: total_count })}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              disabled={offset === 0}
              onClick={() => set_offset((v) => Math.max(0, v - PAGE_SIZE))}
            >
              {t("prev")}
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={offset + PAGE_SIZE >= total_count}
              onClick={() => set_offset((v) => v + PAGE_SIZE)}
            >
              {t("next")}
            </Button>
          </Stack>
        </>
      )}
    </Stack>
  );
}
