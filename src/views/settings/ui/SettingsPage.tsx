"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Bell, Smartphone } from "lucide-react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  Box, Button, Checkbox, FormControlLabel, IconButton, Slider, Stack,
  ToggleButton, ToggleButtonGroup, Typography, useTheme,
} from "@mui/material";
import { HeaderActions } from "@/widgets/header/ui/header-actions/HeaderActions";
import { fetchSettings, updateSettings } from "@/shared/api/client";
import { AppShell, LoadingCenter, PageContainer, StickyHeader } from "@/shared/ui/page-layout";
import { SettingPanel } from "@/shared/ui/setting-panel/SettingPanel";

const CURRENT_YEAR = new Date().getFullYear();
const AUTO_SCAN_OPTIONS = [0, 15, 30, 60, 180, 360] as const;
const MIN_CACHE_TTL_HOURS = 6;
const MAX_CACHE_TTL_HOURS = 2160;

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

function CheckboxField({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <FormControlLabel
      sx={{ alignItems: "flex-start", m: 0 }}
      control={(
        <Checkbox
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          sx={{ mt: -0.5 }}
        />
      )}
      label={(
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{label}</Typography>
          {hint && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
              {hint}
            </Typography>
          )}
        </Box>
      )}
    />
  );
}

export function SettingsPage() {
  const t = useTranslations("settings");
  const t_app = useTranslations("app");
  const theme = useTheme();
  const { data: session } = useSession();
  const is_admin = session?.user?.role === "admin";

  const [threshold, set_threshold] = useState(80);
  const [exclude_junk, set_exclude_junk] = useState(true);
  const [exclude_iphone, set_exclude_iphone] = useState(false);
  const [exclude_android, set_exclude_android] = useState(false);
  const [junk_min_year, set_junk_min_year] = useState(2017);
  const [auto_scan_minutes, set_auto_scan_minutes] = useState(0);
  const [cache_ttl_hours, set_cache_ttl_hours] = useState(72);
  const [loading, set_loading] = useState(true);
  const [saving_personal, set_saving_personal] = useState(false);
  const [saving_admin, set_saving_admin] = useState(false);
  const [saved_personal_at, set_saved_personal_at] = useState<number | null>(null);
  const [saved_admin_at, set_saved_admin_at] = useState<number | null>(null);

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

  async function handleSavePersonal() {
    set_saving_personal(true);
    try {
      await updateSettings({
        exclude_junk_listings: exclude_junk,
        exclude_iphone,
        exclude_android,
        junk_min_release_year: junk_min_year,
        battery_health_threshold_percent: threshold,
      });
      set_saved_personal_at(Date.now());
    } finally {
      set_saving_personal(false);
    }
  }

  async function handleSaveAdmin() {
    if (!is_admin) return;
    set_saving_admin(true);
    try {
      await updateSettings({
        auto_scan_interval_minutes: auto_scan_minutes,
        cache_ttl_hours,
      });
      set_saved_admin_at(Date.now());
    } finally {
      set_saving_admin(false);
    }
  }

  return (
    <AppShell>
      <StickyHeader
        title={(
          <Typography
            variant="h3"
            component={Link}
            href="/"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              fontWeight: 900,
              textDecoration: "none",
              color: "text.primary",
            }}
          >
            <Smartphone size={22} color={theme.palette.primary.main} aria-hidden />
            SmartFlip
          </Typography>
        )}
        subtitle={(
          <Typography variant="caption" color="text.secondary" noWrap>
            {t("title")}
          </Typography>
        )}
        actions={(
          <>
            <IconButton
              component={Link}
              href="/notifications/settings"
              size="small"
              aria-label={t_app("notification_settings_link")}
              title={t_app("notification_settings_link")}
              sx={{ display: { xs: "none", sm: "inline-flex" } }}
            >
              <Bell size={18} />
            </IconButton>
            <HeaderActions />
          </>
        )}
      />

      <PageContainer maxWidth="md">
        <Typography variant="h2" component="h1" sx={{ mb: 0.5, fontWeight: 900 }}>
          {t("title")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          {t("tagline")}
        </Typography>

        {loading ? (
          <LoadingCenter />
        ) : (
          <Stack spacing={4}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                {t("personal_section_title")}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
                {t("personal_section_hint")}
              </Typography>

              <Stack spacing={2.5}>
                <SettingPanel>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                    {t("junk_section_title")}
                  </Typography>
                  <CheckboxField
                    checked={exclude_junk}
                    onChange={set_exclude_junk}
                    label={t("exclude_junk_label")}
                    hint={t("exclude_junk_hint")}
                  />
                  <Box sx={{ mt: 2, pl: 4, opacity: exclude_junk ? 1 : 0.4 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{t("junk_min_year_label")}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
                      {t("junk_min_year_hint")}
                    </Typography>
                    <Stack direction="row" spacing={2}>
                      <Slider
                        min={2000}
                        max={CURRENT_YEAR}
                        step={1}
                        value={junk_min_year}
                        disabled={!exclude_junk}
                        onChange={(_, value) => set_junk_min_year(value as number)}
                        sx={{ flex: 1 }}
                      />
                      <Typography variant="h3" color="primary.main" sx={{ fontWeight: 900, minWidth: 48, textAlign: "right" }}>
                        {junk_min_year}
                      </Typography>
                    </Stack>
                  </Box>
                </SettingPanel>

                <SettingPanel>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                    {t("platform_section_title")}
                  </Typography>
                  <Stack spacing={1.5}>
                    <CheckboxField
                      checked={exclude_iphone}
                      onChange={set_exclude_iphone}
                      label={t("exclude_iphone_label")}
                      hint={t("exclude_iphone_hint")}
                    />
                    <CheckboxField
                      checked={exclude_android}
                      onChange={set_exclude_android}
                      label={t("exclude_android_label")}
                      hint={t("exclude_android_hint")}
                    />
                  </Stack>
                </SettingPanel>

                <SettingPanel>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{t("battery_threshold_label")}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
                    {t("battery_threshold_personal_hint")}
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={threshold}
                      onChange={(_, value) => set_threshold(value as number)}
                      sx={{ flex: 1 }}
                    />
                    <Typography variant="h3" color="primary.main" sx={{ fontWeight: 900, minWidth: 48, textAlign: "right" }}>
                      {threshold}%
                    </Typography>
                  </Stack>
                </SettingPanel>

                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: "block" }}>
                    {t("applies_feed_immediately")}
                  </Typography>
                  <Stack direction="row" spacing={1.5}>
                    <Button variant="contained" onClick={handleSavePersonal} disabled={saving_personal}>
                      {saving_personal ? t("saving") : t("save_personal")}
                    </Button>
                    {saved_personal_at !== null && (
                      <Typography variant="body2" color="success.main" sx={{ fontWeight: 600 }}>
                        {t("saved")}
                      </Typography>
                    )}
                  </Stack>
                </Box>
              </Stack>
            </Box>

            {is_admin && (
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {t("admin_section_title")}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
                  {t("admin_section_hint")}
                </Typography>

                <Stack spacing={2.5}>
                  <SettingPanel>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{t("auto_scan_label")}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
                      {t("auto_scan_hint")}
                    </Typography>
                    <ToggleButtonGroup
                      value={auto_scan_minutes}
                      exclusive
                      onChange={(_, value) => value !== null && set_auto_scan_minutes(value)}
                      sx={{ flexWrap: "wrap", gap: 1 }}
                    >
                      {AUTO_SCAN_OPTIONS.map((minutes) => (
                        <ToggleButton key={minutes} value={minutes} size="small" sx={{ fontWeight: 600 }}>
                          {formatAutoScanOption(minutes, t)}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </SettingPanel>

                  <SettingPanel>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{t("cache_ttl_label")}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
                      {t("cache_ttl_hint")}
                    </Typography>
                    <Stack direction="row" spacing={2}>
                      <Slider
                        min={MIN_CACHE_TTL_HOURS}
                        max={MAX_CACHE_TTL_HOURS}
                        step={6}
                        value={cache_ttl_hours}
                        onChange={(_, value) => set_cache_ttl_hours(value as number)}
                        sx={{ flex: 1 }}
                      />
                      <Typography variant="h3" color="primary.main" sx={{ fontWeight: 900, minWidth: 80, textAlign: "right" }}>
                        {formatCacheTtl(cache_ttl_hours, t)}
                      </Typography>
                    </Stack>
                  </SettingPanel>

                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: "block" }}>
                      {t("applies_next_scan")}
                    </Typography>
                    <Stack direction="row" spacing={1.5}>
                      <Button variant="contained" onClick={handleSaveAdmin} disabled={saving_admin}>
                        {saving_admin ? t("saving") : t("save_admin")}
                      </Button>
                      {saved_admin_at !== null && (
                        <Typography variant="body2" color="success.main" sx={{ fontWeight: 600 }}>
                          {t("saved")}
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </PageContainer>
    </AppShell>
  );
}
