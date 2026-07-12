"use client";

import Link from "next/link";
import { Heart, Loader2 } from "lucide-react";
import { DeviceCard } from "@/components/DeviceCard/DeviceCard";
import { HeaderActions } from "@/components/HeaderActions/HeaderActions";
import { useDevicesFeed } from "@/hooks/useDevicesFeed";
import { useTranslations } from "next-intl";

export default function FavoritesPage() {
  const t = useTranslations("auth");
  const { devices, initial_loading, reload } = useDevicesFeed({ favorites_only: true });

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-3 flex-wrap">
          <Link href="/" className="text-sm font-bold app-link">← SmartFlip</Link>
          <span className="app-divider hidden sm:inline">/</span>
          <span className="text-sm app-text-muted flex-1 flex items-center gap-2">
            <Heart size={16} className="app-accent" aria-hidden />
            {t("favorites")}
          </span>
          <HeaderActions />
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-6">
        {initial_loading ? (
          <div className="flex items-center justify-center py-24 app-text-faint">
            <Loader2 size={32} className="animate-spin mr-3" aria-hidden />
          </div>
        ) : devices.length === 0 ? (
          <div className="text-center py-24 app-text-faint">
            <Heart size={48} className="mx-auto mb-4 opacity-50" aria-hidden />
            <p>{t("favorites_empty")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
            {devices.map((device) => (
              <DeviceCard key={device.id} device={device} onListingChange={reload} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
