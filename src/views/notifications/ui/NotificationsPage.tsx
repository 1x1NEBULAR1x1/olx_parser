"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, MapPin, Settings, Smartphone } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import {
  Box, Button, Card, CardActionArea, CardContent, Link as MuiLink, Stack, Typography,
} from "@mui/material";
import { HeaderActions } from "@/widgets/header/ui/header-actions/HeaderActions";
import {
  fetchNotifications,
  markNotificationsRead,
  clearAllNotifications,
} from "@/shared/api/client";
import type { AppNotification } from "@/shared/api/client";
import type { AppLocale } from "@/shared/config/i18n/config";
import {
  AppShell, EmptyState, LoadingCenter, PageContainer, StickyHeader,
} from "@/shared/ui/page-layout";

const DATE_LOCALE_MAP: Record<AppLocale, string> = {
  pl: "pl-PL",
  en: "en-US",
  ru: "ru-RU",
};

export function NotificationsPage() {
  const t = useTranslations("notifications");
  const tc = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const [notifications, set_notifications] = useState<AppNotification[]>([]);
  const [loading, set_loading] = useState(true);
  const [clearing, set_clearing] = useState(false);

  useEffect(() => {
    fetchNotifications()
      .then((list) => {
        set_notifications(list);
        set_loading(false);
        if (list.some((n) => !n.is_read)) {
          void markNotificationsRead();
        }
      })
      .catch(() => set_loading(false));
  }, []);

  async function handleClearAll() {
    set_clearing(true);
    try {
      await clearAllNotifications();
      set_notifications([]);
    } finally {
      set_clearing(false);
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
            <Typography color="text.secondary">{t("title")}</Typography>
          </Stack>
        )}
        title={null}
        actions={(
          <>
            <Button
              component={Link}
              href="/notifications/settings"
              variant="outlined"
              size="small"
              startIcon={<Settings size={16} />}
              sx={{ display: { xs: "none", sm: "inline-flex" } }}
            >
              {t("settings")}
            </Button>
            <HeaderActions />
          </>
        )}
      />

      <PageContainer maxWidth="md">
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3, flexWrap: "wrap", gap: 1 }}>
          <Typography variant="h2" component="h1" sx={{ fontWeight: 900 }}>
            {t("title")}
          </Typography>
          {notifications.length > 0 && (
            <Button
              variant="text"
              color="error"
              size="small"
              onClick={handleClearAll}
              disabled={clearing}
            >
              {t("clear_all")}
            </Button>
          )}
        </Box>

        {loading ? (
          <LoadingCenter />
        ) : notifications.length === 0 ? (
          <EmptyState icon={<Bell size={48} />} message={t("empty")} />
        ) : (
          <Stack spacing={1.5}>
            {notifications.map((n) => (
              <Card key={n.id} variant="outlined" sx={{ overflow: "hidden" }}>
                <CardActionArea
                  component="a"
                  href={n.olx_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ display: "flex", alignItems: "stretch", justifyContent: "flex-start" }}
                >
                  {n.photo_url ? (
                    <Box
                      component="img"
                      src={n.photo_url}
                      alt={n.title}
                      sx={{ width: 96, height: 96, objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: 96,
                        height: 96,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        bgcolor: "action.hover",
                        color: "text.secondary",
                        flexShrink: 0,
                      }}
                    >
                      <Smartphone size={28} aria-hidden />
                    </Box>
                  )}
                  <CardContent sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {n.title}
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 0.75 }}>
                      {n.price_buy !== null && (
                        <Typography variant="body2" sx={{ fontWeight: 800 }} color="text.primary">
                          {n.price_buy} zł
                        </Typography>
                      )}
                      {n.profitability_pct !== null && (
                        <Typography variant="body2" sx={{ fontWeight: 800 }} color="success.main">
                          {n.profitability_pct}%
                        </Typography>
                      )}
                      {n.market_sell_price !== null && (
                        <Typography variant="caption" color="text.secondary">
                          ~{n.market_sell_price} zł
                        </Typography>
                      )}
                      {n.city && (
                        <Stack direction="row" spacing={0.5}>
                          <MapPin size={12} aria-hidden />
                          <Typography variant="caption" color="text.secondary">{n.city}</Typography>
                        </Stack>
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: "block" }}>
                      {new Date(n.created_at).toLocaleString(DATE_LOCALE_MAP[locale], {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Typography>
                  </CardContent>
                  <Typography
                    variant="caption"
                    color="primary"
                    sx={{ fontWeight: 700, alignSelf: "center", pr: 2, flexShrink: 0 }}
                  >
                    {tc("open_link")} →
                  </Typography>
                </CardActionArea>
              </Card>
            ))}
          </Stack>
        )}
      </PageContainer>
    </AppShell>
  );
}
