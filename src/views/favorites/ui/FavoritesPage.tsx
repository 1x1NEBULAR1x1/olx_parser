"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { DeviceCard } from "@/entities/device/ui/device-card/DeviceCard";
import { HeaderActions } from "@/widgets/header/ui/header-actions/HeaderActions";
import { useDevicesFeed } from "@/features/scan-control/lib/useDevicesFeed";
import { useTranslations } from "next-intl";
import { Breadcrumbs, Link as MuiLink, Typography, useTheme } from "@mui/material";
import {
  AppShell, DeviceGrid, DeviceGridItem, EmptyState,
  LoadingCenter, PageContainer, StickyHeader,
} from "@/shared/ui/page-layout";

export function FavoritesPage() {
  const t = useTranslations("auth");
  const theme = useTheme();
  const { devices, initial_loading, reload } = useDevicesFeed({ favorites_only: true });

  return (
    <AppShell>
      <StickyHeader
        breadcrumb={(
          <Breadcrumbs sx={{ mb: 0.5, "& .MuiBreadcrumbs-li": { fontSize: "0.875rem" } }}>
            <MuiLink component={Link} href="/" underline="hover" color="inherit" sx={{ fontWeight: 700 }}>
              SmartFlip
            </MuiLink>
            <Typography color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Heart size={16} color={theme.palette.primary.main} aria-hidden />
              {t("favorites")}
            </Typography>
          </Breadcrumbs>
        )}
        title={null}
        actions={<HeaderActions />}
      />

      <PageContainer>
        {initial_loading ? (
          <LoadingCenter />
        ) : devices.length === 0 ? (
          <EmptyState icon={<Heart size={48} />} message={t("favorites_empty")} />
        ) : (
          <DeviceGrid>
            {devices.map((device) => (
              <DeviceGridItem key={device.id}>
                <DeviceCard device={device} onListingChange={reload} />
              </DeviceGridItem>
            ))}
          </DeviceGrid>
        )}
      </PageContainer>
    </AppShell>
  );
}
