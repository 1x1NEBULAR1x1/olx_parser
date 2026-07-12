import { create } from "zustand";
import { persist } from "zustand/middleware";

export const PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const;
export const DEFAULT_PAGE_SIZE = 24;

interface FeedScrollState {
  feed_scroll_y: number;
  saved_page: number;
  page_size: number;
  set_feed_scroll: (scroll_y: number, page: number) => void;
  set_page_size: (page_size: number) => void;
  clear_feed_scroll: () => void;
}

export const useScrollStore = create<FeedScrollState>()(
  persist(
    (set) => ({
      feed_scroll_y: 0,
      saved_page: 1,
      page_size: DEFAULT_PAGE_SIZE,
      set_feed_scroll: (scroll_y, page) => set({ feed_scroll_y: scroll_y, saved_page: page }),
      set_page_size: (page_size) => set({ page_size }),
      clear_feed_scroll: () => set({ feed_scroll_y: 0, saved_page: 1 }),
    }),
    { name: "smartflip-feed-scroll" },
  ),
);
