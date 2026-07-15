"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import styles from "./PhotoGallery.module.scss";

interface PhotoGalleryProps {
  photos: string[];
  alt: string;
  variant?: "card" | "detail";
  show_thumbnails?: boolean;
  test_id?: string;
}

export function PhotoGallery({
  photos,
  alt,
  variant = "card",
  show_thumbnails = false,
  test_id = "photo-gallery",
}: PhotoGalleryProps) {
  const t = useTranslations("device_card");
  const [active_photo, set_active_photo] = useState(0);
  const gallery_ref = useRef<HTMLDivElement>(null);
  const photo_count = photos.length;

  const syncActivePhoto = useCallback(() => {
    const gallery = gallery_ref.current;
    if (!gallery || photo_count <= 1) return;
    const slide_width = gallery.clientWidth;
    if (slide_width <= 0) return;
    const next_index = Math.round(gallery.scrollLeft / slide_width);
    set_active_photo(Math.min(Math.max(next_index, 0), photo_count - 1));
  }, [photo_count]);

  const scrollToPhoto = useCallback((index: number) => {
    const gallery = gallery_ref.current;
    if (!gallery) return;
    const clamped = Math.min(Math.max(index, 0), photo_count - 1);
    gallery.scrollTo({ left: gallery.clientWidth * clamped, behavior: "smooth" });
    set_active_photo(clamped);
  }, [photo_count]);

  if (photo_count === 0) return null;

  return (
    <div
      className={[
        styles.photo_gallery,
        variant === "detail" ? styles.photo_gallery_detail : styles.photo_gallery_card,
      ].join(" ")}
    >
      <div
        ref={gallery_ref}
        className={styles.photo_gallery_track}
        data-testid={test_id}
        onScroll={syncActivePhoto}
      >
        {photos.map((photo, index) => (
          <img
            key={`${photo}-${index}`}
            src={photo}
            alt={`${alt} — ${index + 1}`}
            className={styles.photo_gallery_slide}
            loading={index === 0 ? "eager" : "lazy"}
            draggable={false}
          />
        ))}
      </div>

      {photo_count > 1 && (
        <>
          <div className={styles.photo_gallery_counter} aria-hidden>
            {active_photo + 1}/{photo_count}
          </div>
          {!show_thumbnails && (
            <div className={styles.photo_gallery_dots} role="tablist" aria-label={t("photos")}>
              {photos.map((_, index) => (
                <button
                  key={`dot-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={index === active_photo}
                  aria-label={t("photo_index", { index: index + 1 })}
                  className={[
                    styles.photo_gallery_dot,
                    index === active_photo ? styles.photo_gallery_dot_active : "",
                  ].join(" ")}
                  onClick={() => scrollToPhoto(index)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {show_thumbnails && photo_count > 1 && (
        <div className={styles.photo_gallery_thumbs}>
          {photos.map((photo, index) => (
            <button
              key={`thumb-${index}`}
              type="button"
              className={[
                styles.photo_gallery_thumb,
                index === active_photo ? styles.photo_gallery_thumb_active : "",
              ].join(" ")}
              aria-label={t("photo_index", { index: index + 1 })}
              aria-current={index === active_photo ? "true" : undefined}
              onClick={() => scrollToPhoto(index)}
            >
              <img src={photo} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
