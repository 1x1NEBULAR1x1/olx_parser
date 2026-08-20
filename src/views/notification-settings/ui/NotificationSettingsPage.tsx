"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button, Checkbox, FormControlLabel, Stack, Typography,
} from "@mui/material";
import { CheckboxGroup } from "@/shared/ui/checkbox-group/CheckboxGroup";
import type { CheckboxOption } from "@/shared/ui/checkbox-group/CheckboxGroup";
import { RangeSlider } from "@/shared/ui/range-slider/RangeSlider";
import {
  fetchDevices, fetchNotificationSettings, updateNotificationSettings,
} from "@/shared/api/client";
import type { DevicesFilterMeta, NotificationSettings } from "@/shared/api/client";
import { AppShell, LoadingCenter, PageContainer } from "@/shared/ui/page-layout";
import { SettingPanel } from "@/shared/ui/setting-panel/SettingPanel";
import {
  getPushPermissionState,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/features/notifications";

const PRICE_BOUNDS_FALLBACK: [number, number] = [0, 5000];
const PROFITABILITY_BOUNDS_FALLBACK: [number, number] = [-100, 150];

type PushUiState = "default" | "granted" | "denied" | "unsupported" | "subscribed" | "not_configured";

export function NotificationSettingsPage() {
  const t = useTranslations("notification_settings");
  const [filter_meta, set_filter_meta] = useState<DevicesFilterMeta | null>(null);
  const [settings, set_settings] = useState<NotificationSettings | null>(null);
  const [loading, set_loading] = useState(true);
  const [saving, set_saving] = useState(false);
  const [saved_at, set_saved_at] = useState<number | null>(null);
  const [push_state, set_push_state] = useState<PushUiState>("default");
  const [push_busy, set_push_busy] = useState(false);
  const [push_error, set_push_error] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchDevices({ limit: 1, include_meta: true }), fetchNotificationSettings()])
      .then(([devices_res, settings_res]) => {
        set_filter_meta(devices_res.filter_meta);
        set_settings(settings_res);
      })
      .finally(() => set_loading(false));
  }, []);

  useEffect(() => {
    void (async () => {
      const permission = await getPushPermissionState();
      if (permission === "unsupported") {
        set_push_state("unsupported");
        return;
      }
      if (permission === "denied") {
        set_push_state("denied");
        return;
      }
      if (permission === "granted") {
        const registration = "serviceWorker" in navigator
          ? await navigator.serviceWorker.getRegistration()
          : null;
        const sub = await registration?.pushManager.getSubscription();
        set_push_state(sub ? "subscribed" : "granted");
        return;
      }
      set_push_state("default");
    })();
  }, []);

  async function handlePushToggle() {
    set_push_busy(true);
    set_push_error(null);
    try {
      if (push_state === "subscribed") {
        await unsubscribeFromPush();
        set_push_state("default");
      } else {
        const result = await subscribeToPush();
        if (result === "subscribed") set_push_state("subscribed");
        else if (result === "denied") set_push_state("denied");
        else if (result === "not_configured") set_push_state("not_configured");
        else set_push_state("unsupported");
      }
    } catch (error) {
      set_push_error(error instanceof Error ? error.message : String(error));
    } finally {
      set_push_busy(false);
    }
  }

  const brand_options: CheckboxOption[] = useMemo(() => {
    return (filter_meta?.brand_options ?? [])
      .filter((option) => option.value !== "unknown")
      .map((option) => ({
        value: option.value,
        label: option.label,
        count: option.count,
      }));
  }, [filter_meta]);

  const model_options: CheckboxOption[] = useMemo(() => {
    const result: CheckboxOption[] = [];
    for (const models of Object.values(filter_meta?.models_by_brand ?? {})) {
      for (const model of models) {
        result.push({ value: model.value, label: model.label, count: model.count });
      }
    }
    return result.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  }, [filter_meta]);

  const region_options: CheckboxOption[] = useMemo(
    () => (filter_meta?.region_options ?? []).map((option) => ({
      value: option.value,
      label: option.label,
      count: option.count,
    })),
    [filter_meta],
  );

  const price_bounds = filter_meta?.price_bounds ?? PRICE_BOUNDS_FALLBACK;
  const profitability_bounds = filter_meta?.profitability_bounds ?? PROFITABILITY_BOUNDS_FALLBACK;

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
      <PageContainer max_width="md">
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
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                {t("delivery_hint")}
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 2, alignItems: { sm: "center" } }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => void handlePushToggle()}
                  disabled={push_busy || push_state === "unsupported" || push_state === "not_configured"}
                >
                  {push_busy
                    ? t("push_working")
                    : push_state === "subscribed"
                      ? t("push_disable")
                      : t("push_enable")}
                </Button>
                <Typography variant="caption" color="text.secondary">
                  {push_state === "subscribed" && t("push_status_on")}
                  {push_state === "denied" && t("push_status_denied")}
                  {push_state === "unsupported" && t("push_status_unsupported")}
                  {push_state === "not_configured" && t("push_status_not_configured")}
                  {push_state === "default" && t("push_status_off")}
                </Typography>
              </Stack>
              {push_error && (
                <Typography variant="caption" color="error.main" sx={{ mt: 1, display: "block" }}>
                  {push_error}
                </Typography>
              )}
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
