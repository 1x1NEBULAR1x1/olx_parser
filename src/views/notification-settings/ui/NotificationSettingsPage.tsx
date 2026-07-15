"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Button, Checkbox, FormControlLabel, Link as MuiLink, Stack, Typography,
} from "@mui/material";
import { HeaderActions } from "@/widgets/header/ui/header-actions/HeaderActions";
import { CheckboxGroup } from "@/shared/ui/checkbox-group/CheckboxGroup";
import type { CheckboxOption } from "@/shared/ui/checkbox-group/CheckboxGroup";
import { RangeSlider } from "@/shared/ui/range-slider/RangeSlider";
import {
  fetchDevices, fetchNotificationSettings, updateNotificationSettings,
} from "@/shared/api/client";
import type { NotificationSettings, AnalyzedDevice } from "@/shared/api/client";
import { AppShell, LoadingCenter, PageContainer, StickyHeader } from "@/shared/ui/page-layout";
import { SettingPanel } from "@/shared/ui/setting-panel/SettingPanel";

const PRICE_BOUNDS_FALLBACK: [number, number] = [0, 5000];
const PROFITABILITY_BOUNDS_FALLBACK: [number, number] = [-100, 150];

function buildBounds(values: number[], fallback: [number, number]): [number, number] {
  if (values.length === 0) return fallback;
  return [Math.min(...values), Math.max(...values)];
}

function countBy<T>(items: T[], get_key: (item: T) => string | null): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = get_key(item);
    if (key === null) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function NotificationSettingsPage() {
  const t = useTranslations("notification_settings");
  const t_notifications = useTranslations("notifications");
  const [devices, set_devices] = useState<AnalyzedDevice[]>([]);
  const [settings, set_settings] = useState<NotificationSettings | null>(null);
  const [loading, set_loading] = useState(true);
  const [saving, set_saving] = useState(false);
  const [saved_at, set_saved_at] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([fetchDevices(), fetchNotificationSettings()])
      .then(([devices_res, settings_res]) => {
        set_devices(devices_res.devices);
        set_settings(settings_res);
      })
      .finally(() => set_loading(false));
  }, []);

  const brand_options: CheckboxOption[] = useMemo(() => {
    const counts = countBy(devices, (d) => (d.brand !== "unknown" ? d.brand : null));
    return Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([brand, count]) => ({
        value: brand,
        label: brand.charAt(0).toUpperCase() + brand.slice(1),
        count,
      }));
  }, [devices]);

  const model_options: CheckboxOption[] = useMemo(() => {
    const result: CheckboxOption[] = [];
    for (const device of devices) {
      if (device.brand === "unknown" || !device.model_key) continue;
      const existing = result.find((o) => o.value === device.model_key);
      if (existing) {
        existing.count = (existing.count ?? 0) + 1;
      } else {
        result.push({ value: device.model_key, label: device.model_label || device.model_key, count: 1 });
      }
    }
    return result.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  }, [devices]);

  const region_options: CheckboxOption[] = useMemo(() => {
    const counts = countBy(devices, (d) => d.region);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([region, count]) => ({ value: region, label: region, count }));
  }, [devices]);

  const price_bounds = useMemo(
    () => buildBounds(devices.map((d) => d.price_buy).filter((v): v is number => v !== null), PRICE_BOUNDS_FALLBACK),
    [devices],
  );
  const profitability_bounds = useMemo(
    () => buildBounds(devices.map((d) => d.profitability_pct).filter((v): v is number => v !== null), PROFITABILITY_BOUNDS_FALLBACK),
    [devices],
  );

  function updateField<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) {
    set_settings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!settings) return;
    set_saving(true);
    try {
      const saved = await updateNotificationSettings({
        enabled: settings.enabled,
        brands: settings.brands,
        model_keys: settings.model_keys,
        regions: settings.regions,
        min_profitability_pct: settings.min_profitability_pct,
        max_profitability_pct: settings.max_profitability_pct,
        min_price: settings.min_price,
        max_price: settings.max_price,
      });
      set_settings((prev) => (prev ? { ...prev, ...saved } : saved));
      set_saved_at(Date.now());
    } finally {
      set_saving(false);
    }
  }

  return (
    <AppShell>
      <StickyHeader
        breadcrumb={(
          <Stack direction="row" spacing={0.75} sx={{ mb: 0.5, typography: "body2" }}>
            <MuiLink component={Link} href="/" underline="hover" color="inherit" sx={{ fontWeight: 700 }}>
              SmartFlip
            </MuiLink>
            <Typography color="text.secondary">/</Typography>
            <MuiLink component={Link} href="/notifications" color="text.secondary" underline="hover">
              {t_notifications("title")}
            </MuiLink>
            <Typography color="text.secondary">/</Typography>
            <Typography color="text.secondary">{t("title")}</Typography>
          </Stack>
        )}
        title={null}
        actions={<HeaderActions />}
      />

      <PageContainer maxWidth="md">
        <Typography variant="h2" component="h1" sx={{ mb: 0.5, fontWeight: 900 }}>
          {t("title")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          {t("tagline")}
        </Typography>

        {loading || !settings ? (
          <LoadingCenter />
        ) : (
          <Stack spacing={2.5}>
            <SettingPanel>
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={settings.enabled}
                    onChange={(e) => updateField("enabled", e.target.checked)}
                  />
                )}
                label={<Typography variant="body2" sx={{ fontWeight: 700 }}>{t("enabled_label")}</Typography>}
              />
              <Typography
                variant="caption"
                sx={{ mt: 1.5, display: "block" }}
                color={settings.telegram_configured ? "success.main" : "text.secondary"}
              >
                {settings.telegram_configured ? t("telegram_configured") : t("telegram_not_configured")}
              </Typography>
            </SettingPanel>

            <Stack spacing={2.5} sx={{ opacity: settings.enabled ? 1 : 0.4, pointerEvents: settings.enabled ? "auto" : "none" }}>
              <SettingPanel>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 2 }}>{t("brands_label")}</Typography>
                <CheckboxGroup
                  options={brand_options}
                  selected={settings.brands}
                  onChange={(next) => updateField("brands", next)}
                />
              </SettingPanel>

              <SettingPanel>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 2 }}>{t("models_label")}</Typography>
                <CheckboxGroup
                  options={model_options}
                  selected={settings.model_keys}
                  onChange={(next) => updateField("model_keys", next)}
                />
              </SettingPanel>

              <SettingPanel>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 2 }}>{t("regions_label")}</Typography>
                <CheckboxGroup
                  options={region_options}
                  selected={settings.regions}
                  onChange={(next) => updateField("regions", next)}
                />
              </SettingPanel>

              <SettingPanel>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 2 }}>{t("profitability_range_label")}</Typography>
                <RangeSlider
                  min={profitability_bounds[0]}
                  max={profitability_bounds[1]}
                  step={5}
                  value={[
                    settings.min_profitability_pct ?? profitability_bounds[0],
                    settings.max_profitability_pct ?? profitability_bounds[1],
                  ]}
                  onChange={([min, max]) => {
                    updateField("min_profitability_pct", min);
                    updateField("max_profitability_pct", max);
                  }}
                  formatValue={(v) => `${Math.round(v)}%`}
                />
              </SettingPanel>

              <SettingPanel>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 2 }}>{t("price_range_label")}</Typography>
                <RangeSlider
                  min={price_bounds[0]}
                  max={price_bounds[1]}
                  step={10}
                  value={[
                    settings.min_price ?? price_bounds[0],
                    settings.max_price ?? price_bounds[1],
                  ]}
                  onChange={([min, max]) => {
                    updateField("min_price", min);
                    updateField("max_price", max);
                  }}
                  formatValue={(v) => `${Math.round(v)} zł`}
                />
              </SettingPanel>
            </Stack>

            <Stack direction="row" spacing={1.5}>
              <Button variant="contained" onClick={handleSave} disabled={saving}>
                {saving ? t("saving") : t("save")}
              </Button>
              {saved_at !== null && (
                <Typography variant="body2" color="success.main" sx={{ fontWeight: 600 }}>
                  {t("saved")}
                </Typography>
              )}
            </Stack>
          </Stack>
        )}
      </PageContainer>
    </AppShell>
  );
}
