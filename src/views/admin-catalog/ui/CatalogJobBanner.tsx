"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { ShieldAlert, Wrench } from "lucide-react";
import type { CatalogEnrichmentStatusResponse, CatalogManualJobProgress } from "@/shared/types/catalog";
import styles from "./CatalogJobBanner.module.scss";

export function remainingWaitSeconds(wait_until_ms: number | null | undefined, now_ms = Date.now()): number {
  if (!wait_until_ms) return 0;
  return Math.max(0, Math.ceil((wait_until_ms - now_ms) / 1000));
}

function useNowTick(active: boolean): number {
  const [now, set_now] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => set_now(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function stageLabel(
  t: (key: string, values?: Record<string, string | number>) => string,
  stage: string,
  source: string | null,
  wait_seconds: number,
  message?: string | null,
): string {
  if (message === "prepare") return t("stage_prepare");
  if (stage === "waiting_antibot") {
    return t("stage_waiting_antibot", { seconds: wait_seconds, source: source || "—" });
  }
  if (stage === "repairability") return t("stage_repairability");
  if (stage === "parts") return source ? t("stage_parts_source", { source }) : t("stage_parts");
  if (stage === "saving") return t("stage_saving");
  if (stage === "error") return t("stage_error");
  if (stage === "done") return t("stage_done");
  return t("stage_parts");
}

export function CatalogJobBanner({
  status,
}: {
  status: CatalogEnrichmentStatusResponse | null;
}) {
  const t = useTranslations("admin.catalog");
  const now = useNowTick(Boolean(status?.is_running));
  const waiting = remainingWaitSeconds(status?.wait_until_ms, now);

  if (!status?.is_running) return null;

  const model = [status.current_brand, status.current_model_label].filter(Boolean).join(" ");
  const set_label = status.current_set_index && status.current_set_total
    ? t("job_set", { index: status.current_set_index, total: status.current_set_total })
    : null;

  return (
    <Paper variant="outlined" className={styles.banner}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "flex-start" }}>
        {status.current_stage === "waiting_antibot"
          ? <ShieldAlert size={18} className={styles.banner_icon_wait} />
          : <span className={styles.banner_spinner} aria-hidden />}
        <div>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {t("enrich_progress", {
              percent: status.percent,
              processed: status.processed_models,
              total: status.total_models,
            })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {model
              ? t("job_current", {
                  model,
                  stage: stageLabel(t, status.current_stage, status.current_source, waiting, status.message),
                })
              : stageLabel(t, status.current_stage, status.current_source, waiting, status.message)}
            {set_label ? ` · ${set_label}` : ""}
          </Typography>
        </div>
      </Stack>
    </Paper>
  );
}

export function CatalogManualJobBanner({
  job,
}: {
  job: CatalogManualJobProgress | null;
}) {
  const t = useTranslations("admin.catalog");
  const now = useNowTick(Boolean(job?.is_running || job?.wait_until_ms));
  const waiting = remainingWaitSeconds(job?.wait_until_ms, now);

  if (!job) return null;

  const Icon = job.stage === "waiting_antibot" ? ShieldAlert : Wrench;

  return (
    <Paper variant="outlined" className={`${styles.banner} ${job.stage === "error" ? styles.banner_error : ""}`}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
        {job.is_running
          ? job.stage === "waiting_antibot"
            ? <Icon size={18} className={styles.banner_icon_wait} />
            : <CircularProgress size={16} />
          : <Icon size={18} />}
        <Typography variant="body2">
          {job.stage === "waiting_antibot"
            ? t("fetch_parts_waiting", { source: job.current_source || "—", seconds: waiting })
            : job.stage === "error" && job.error
              ? t("fetch_parts_failed")
              : job.is_running
                ? t("fetch_parts_progress", {
                    source: job.current_source || "—",
                    index: job.set_index,
                    total: job.set_total,
                  })
                : job.stage === "done"
                  ? t("fetch_parts_done", { count: job.parts_found, sets: job.set_total })
                  : t("fetch_parts_busy")}
        </Typography>
      </Stack>
    </Paper>
  );
}
