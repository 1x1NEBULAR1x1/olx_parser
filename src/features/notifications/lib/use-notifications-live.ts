"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { waitNotifications } from "@/shared/api/client";
import { isAbortError, runLongPollLoop } from "@/shared/lib/long-poll-client";
import { useNotificationsLiveStore } from "@/features/notifications/model/notifications-live-store";

let retain_count = 0;
let loop_abort: AbortController | null = null;
let known_count = -1;
let known_cursor = 0;

function startNotificationsLoop(): void {
  if (loop_abort) return;
  loop_abort = new AbortController();
  const signal = loop_abort.signal;
  known_count = -1;
  known_cursor = 0;

  void runLongPollLoop({
    signal,
    poll: async (poll_signal) => {
      const snapshot = await waitNotifications({
        cursor: known_cursor,
        count: known_count,
        signal: poll_signal,
      });
      if (poll_signal.aborted) return;
      useNotificationsLiveStore.getState().applySnapshot(
        snapshot.count,
        snapshot.cursor,
        snapshot.items,
      );
      known_count = snapshot.count;
      known_cursor = snapshot.cursor;
    },
  }).catch((error) => {
    if (!isAbortError(error)) {
      console.error("[notifications-live] loop failed", error);
    }
  });
}

function stopNotificationsLoop(): void {
  loop_abort?.abort();
  loop_abort = null;
}

function retainNotificationsLoop(): void {
  retain_count += 1;
  if (retain_count === 1) startNotificationsLoop();
}

function releaseNotificationsLoop(): void {
  retain_count = Math.max(0, retain_count - 1);
  if (retain_count === 0) stopNotificationsLoop();
}

/** Один long-poll на все колокольчики/тосты вкладки. */
export function useNotificationsLive(): void {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    retainNotificationsLoop();
    return () => {
      releaseNotificationsLoop();
    };
  }, [status]);
}
