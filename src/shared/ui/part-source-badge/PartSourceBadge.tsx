"use client";

import { useState } from "react";
import { BarChart3, Megaphone, ShoppingBag, Star, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { getPartSourceHost, inferPartSource, PART_SOURCE_I18N_KEY } from "@/shared/lib/part-utils";
import type { PartSource } from "@/shared/types/domain";
import styles from "./PartSourceBadge.module.scss";

const SOURCE_ICONS: Record<PartSource, typeof ShoppingBag> = {
  allegro: ShoppingBag,
  ceneo: BarChart3,
  parts_store: Store,
  shop: Store,
  olx: Megaphone,
  estimate: Star,
};

interface PartSourceBadgeProps {
  part: {
    title?: string;
    url?: string;
    source?: string;
    is_estimate?: boolean;
  };
}

export function PartSourceBadge({ part }: PartSourceBadgeProps) {
  const t = useTranslations("device_detail");
  const [favicon_failed, set_favicon_failed] = useState(false);
  const source = inferPartSource({
    title: part.title ?? "",
    url: part.url ?? "",
    source: part.source,
    is_estimate: part.is_estimate,
  });
  const host = getPartSourceHost({ url: part.url, source: part.source });
  const Icon = SOURCE_ICONS[source];
  const label = source === "shop" && host ? host : t(PART_SOURCE_I18N_KEY[source]);
  const favicon_url = host && !favicon_failed
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`
    : null;

  return (
    <span className={styles.badge} title={host ?? label}>
      {favicon_url ? (
        <img
          src={favicon_url}
          alt=""
          className={styles.badge_favicon}
          width={14}
          height={14}
          referrerPolicy="no-referrer"
          onError={() => set_favicon_failed(true)}
        />
      ) : (
        <Icon size={12} aria-hidden className={styles.badge_icon} />
      )}
      <span className={styles.badge_label}>{label}</span>
    </span>
  );
}
