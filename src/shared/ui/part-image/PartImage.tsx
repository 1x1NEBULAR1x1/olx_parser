"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import { normalizeExternalImageUrl } from "@/shared/lib/external-image";
import styles from "./PartImage.module.scss";

interface PartImageProps {
  src: string | null | undefined;
  alt: string;
}

export function PartImage({ src, alt }: PartImageProps) {
  const [failed, set_failed] = useState(false);
  const image_url = normalizeExternalImageUrl(src);

  if (!image_url || failed) {
    return (
      <div className={`${styles.part_image} ${styles.part_image_fallback}`} aria-hidden>
        <Wrench size={22} />
      </div>
    );
  }

  return (
    <img
      src={image_url}
      alt={alt}
      className={styles.part_image}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => set_failed(true)}
    />
  );
}
