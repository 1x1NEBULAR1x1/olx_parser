"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { normalizeExternalImageUrls } from "@/shared/lib/external-image";
import styles from "./PhotoGallery.module.scss";

interface PhotoGalleryProps {
  photos: string[];
  alt: string;
  variant?: "card" | "detail";
  show_thumbnails?: boolean;
  test_id?: string;
}

const SWIPE_THRESHOLD_PX = 72;
const HORIZONTAL_WHEEL_PIXEL_STEP = 90;
const HORIZONTAL_WHEEL_DOMINANCE_RATIO = 1.15;
const WHEEL_NAV_INTERVAL_MS = 320;

function clampPhotoIndex(index: number, photo_count: number): number {
  return Math.min(Math.max(index, 0), photo_count - 1);
}

/** Только горизонтальный жест трекпада (два пальца влево/вправо). Вертикаль — null → скролл страницы. */
function getHorizontalWheelDelta(event: WheelEvent): number | null {
  const abs_x = Math.abs(event.deltaX);
  const abs_y = Math.abs(event.deltaY);
  if (abs_x < 0.5) return null;
  if (abs_x <= abs_y * HORIZONTAL_WHEEL_DOMINANCE_RATIO) return null;
  return event.deltaX;
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
  const viewport_ref = useRef<HTMLDivElement>(null);
  const drag_start_x_ref = useRef<number | null>(null);
  const resolved_photos = useMemo(() => normalizeExternalImageUrls(photos), [photos]);
  const photo_count = resolved_photos.length;

  const goToPhoto = useCallback((index: number) => {
    set_active_photo((prev) => {
      const next = clampPhotoIndex(index, photo_count);
      return prev === next ? prev : next;
    });
  }, [photo_count]);

  const shiftPhoto = useCallback((delta: number) => {
    set_active_photo((prev) => clampPhotoIndex(prev + delta, photo_count));
  }, [photo_count]);

  useEffect(() => {
    set_active_photo((prev) => clampPhotoIndex(prev, photo_count));
  }, [photo_count]);

  useEffect(() => {
    const viewport = viewport_ref.current;
    if (!viewport || photo_count <= 1) return;

    let horizontal_accumulated = 0;
    let last_wheel_nav_at = 0;

    const navigateByWheel = (direction: number) => {
      const now = Date.now();
      if (now - last_wheel_nav_at < WHEEL_NAV_INTERVAL_MS) return;
      last_wheel_nav_at = now;
      set_active_photo((prev) => clampPhotoIndex(prev + direction, photo_count));
    };

    const handleWheel = (event: WheelEvent) => {
      const horizontal_delta = getHorizontalWheelDelta(event);
      if (horizontal_delta === null) return;

      event.preventDefault();
      event.stopPropagation();

      horizontal_accumulated += horizontal_delta;
      if (Math.abs(horizontal_accumulated) < HORIZONTAL_WHEEL_PIXEL_STEP) return;

      const direction = horizontal_accumulated > 0 ? 1 : -1;
      horizontal_accumulated -= direction * HORIZONTAL_WHEEL_PIXEL_STEP;
      navigateByWheel(direction);
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [photo_count]);

  const handleDragStart = useCallback((client_x: number) => {
    drag_start_x_ref.current = client_x;
  }, []);

  const handleDragEnd = useCallback((client_x: number) => {
    const drag_start_x = drag_start_x_ref.current;
    drag_start_x_ref.current = null;
    if (drag_start_x === null) return;

    const delta_x = client_x - drag_start_x;
    if (Math.abs(delta_x) < SWIPE_THRESHOLD_PX) return;

    shiftPhoto(delta_x < 0 ? 1 : -1);
  }, [shiftPhoto]);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    handleDragStart(touch.clientX);
  }, [handleDragStart]);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    handleDragEnd(touch.clientX);
  }, [handleDragEnd]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    handleDragStart(event.clientX);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [handleDragStart]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    handleDragEnd(event.clientX);
  }, [handleDragEnd]);

  if (photo_count === 0) return null;

  const can_go_prev = active_photo > 0;
  const can_go_next = active_photo < photo_count - 1;

  return (
    <div
      ref={gallery_ref}
      className={[
        styles.photo_gallery,
        variant === "detail" ? styles.photo_gallery_detail : styles.photo_gallery_card,
      ].join(" ")}
    >
      <div
        ref={viewport_ref}
        className={styles.photo_gallery_viewport}
        data-testid={test_id}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className={styles.photo_gallery_track}
          style={{ transform: `translate3d(-${active_photo * 100}%, 0, 0)` }}
        >
          {resolved_photos.map((photo, index) => (
            <img
              key={`${photo}-${index}`}
              src={photo}
              alt={`${alt} — ${index + 1}`}
              className={styles.photo_gallery_slide}
              loading={index === 0 ? "eager" : "lazy"}
              referrerPolicy="no-referrer"
              draggable={false}
            />
          ))}
        </div>
      </div>

      {photo_count > 1 && (
        <>
          <button
            type="button"
            data-testid="photo-gallery-prev"
            className={[
              styles.photo_gallery_nav,
              styles.photo_gallery_nav_prev,
              !can_go_prev ? styles.photo_gallery_nav_disabled : "",
            ].join(" ")}
            aria-label={t("photo_prev")}
            disabled={!can_go_prev}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              shiftPhoto(-1);
            }}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>

          <button
            type="button"
            data-testid="photo-gallery-next"
            className={[
              styles.photo_gallery_nav,
              styles.photo_gallery_nav_next,
              !can_go_next ? styles.photo_gallery_nav_disabled : "",
            ].join(" ")}
            aria-label={t("photo_next")}
            disabled={!can_go_next}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              shiftPhoto(1);
            }}
          >
            <ChevronRight size={18} aria-hidden />
          </button>

          <div className={styles.photo_gallery_counter} aria-hidden>
            {active_photo + 1}/{photo_count}
          </div>

          {!show_thumbnails && (
            <div className={styles.photo_gallery_dots} role="tablist" aria-label={t("photos")}>
              {resolved_photos.map((_, index) => (
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
                  onClick={(event) => {
                    event.stopPropagation();
                    goToPhoto(index);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {show_thumbnails && photo_count > 1 && (
        <div className={styles.photo_gallery_thumbs}>
          {resolved_photos.map((photo, index) => (
            <button
              key={`thumb-${index}`}
              type="button"
              className={[
                styles.photo_gallery_thumb,
                index === active_photo ? styles.photo_gallery_thumb_active : "",
              ].join(" ")}
              aria-label={t("photo_index", { index: index + 1 })}
              aria-current={index === active_photo ? "true" : undefined}
              onClick={() => goToPhoto(index)}
            >
              <img src={photo} alt="" referrerPolicy="no-referrer" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
