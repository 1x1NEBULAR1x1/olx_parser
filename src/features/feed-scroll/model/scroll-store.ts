import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export const PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const;
export const DEFAULT_PAGE_SIZE = 24;

const noop_storage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function getFeedScrollStorage(): StateStorage {
  if (typeof window === "undefined") return noop_storage;
  return window.localStorage;
}

interface FeedScrollState {
  feed_scroll_y: number;
  saved_page: number;
  saved_loaded_count: number;
  page_size: number;
  set_feed_scroll: (scroll_y: number, page: number, loaded_count: number) => void;
  set_page_size: (page_size: number) => void;
  clear_feed_scroll: () => void;
}

export const useScrollStore = create<FeedScrollState>()(
  persist(
    (set) => ({
      feed_scroll_y: 0,
      saved_page: 1,
      saved_loaded_count: 0,
      page_size: DEFAULT_PAGE_SIZE,
      set_feed_scroll: (scroll_y, page, loaded_count) => set({
        feed_scroll_y: scroll_y,
        saved_page: page,
        saved_loaded_count: loaded_count,
      }),
      set_page_size: (page_size) => set({ page_size }),
      clear_feed_scroll: () => set({ feed_scroll_y: 0, saved_page: 1, saved_loaded_count: 0 }),
    }),
    {
      name: "smartflip-feed-scroll",
      storage: createJSONStorage(getFeedScrollStorage),
    },
  ),
);

export function hasFeedScrollStoreHydrated(): boolean {
  if (typeof window === "undefined") return false;
  return useScrollStore.persist?.hasHydrated() ?? false;
}

export function onFeedScrollStoreHydrated(callback: () => void): () => void {
  const persist_api = useScrollStore.persist;
  if (!persist_api) {
    callback();
    return () => {};
  }
  if (persist_api.hasHydrated()) {
    callback();
    return () => {};
  }
  return persist_api.onFinishHydration(callback);
}
