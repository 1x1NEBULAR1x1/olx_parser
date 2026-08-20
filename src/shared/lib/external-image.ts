const PLACEHOLDER_MARKERS = [
  "placeholder",
  "blank.gif",
  "spacer.gif",
  "pixel.gif",
  "1x1",
];

/** OLX/Ceneo/магазины: lazy-src, {width}x{height}, protocol-relative, data-URI. */
export function normalizeExternalImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let url = raw.trim();
  if (!url) return null;
  if (url.startsWith("data:")) return null;

  url = url.split(",")[0]?.trim().split(/\s+/)[0] ?? url;
  if (url.startsWith("//")) url = `https:${url}`;
  if (!/^https?:\/\//i.test(url)) return null;

  url = url
    .replace(/%7Bwidth%7D/gi, "640")
    .replace(/%7Bheight%7D/gi, "480")
    .replace(/\{width\}/gi, "640")
    .replace(/\{height\}/gi, "480");

  const lowered = url.toLowerCase();
  if (PLACEHOLDER_MARKERS.some((marker) => lowered.includes(marker))) return null;

  return url;
}

export function normalizeExternalImageUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of urls) {
    const url = normalizeExternalImageUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}
