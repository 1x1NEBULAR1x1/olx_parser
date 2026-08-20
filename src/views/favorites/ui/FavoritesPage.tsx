"use client";

import { Heart } from "lucide-react";
import { DeviceCard } from "@/entities/device/ui/device-card/DeviceCard";
import { useDevicesFeed } from "@/features/scan-control/lib/useDevicesFeed";
import { useTranslations } from "next-intl";
import {
  AppShell, DeviceGrid, DeviceGridItem, EmptyState, ErrorState,
  FeedSkeleton, PageContainer, PageHeader,
} from "@/shared/ui/page-layout";
import { getErrorCopy } from "@/shared/lib/api-error";
import type { DevicesListResponse } from "@/shared/types/api-contracts";

interface FavoritesPageProps {
  initial_feed?: DevicesListResponse | null;
}

export function FavoritesPage({ initial_feed = null }: FavoritesPageProps) {
  const t = useTranslations("auth");
  const te = useTranslations("errors");
  const { devices, initial_loading, error, reload } = useDevicesFeed({
    favorites_only: true,
    load_all: true,
    initial_feed,
  });

  return (
    <AppShell>
      <PageContainer>
        <PageHeader title={t("favorites")} />
        {initial_loading ? (
          <FeedSkeleton count={3} />
        ) : error && devices.length === 0 ? (
          <ErrorState
            message={getErrorCopy(error, te)}
            onRetry={() => void reload()}
          />
        ) : devices.length === 0 ? (
          <EmptyState icon={<Heart size={48} />} message={t("favorites_empty")} />
        ) : (
          <DeviceGrid>
            {devices.map((device, index) => (
              <DeviceGridItem key={device.id} index={index}>
                <DeviceCard device={device} onListingChange={reload} />
              </DeviceGridItem>
            ))}
          </DeviceGrid>
        )}
      </PageContainer>
    </AppShell>
  );
}
