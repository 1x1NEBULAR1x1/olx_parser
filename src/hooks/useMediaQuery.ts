"use client";

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, set_matches] = useState(false);

  useEffect(() => {
    const media_query = window.matchMedia(query);
    const sync = () => set_matches(media_query.matches);
    sync();
    media_query.addEventListener("change", sync);
    return () => media_query.removeEventListener("change", sync);
  }, [query]);

  return matches;
}
