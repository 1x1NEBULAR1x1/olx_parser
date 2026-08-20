import { normalizeExternalImageUrl } from "@/shared/lib/external-image";
import { isPartEstimate, inferPartSource } from "@/shared/lib/part-utils";
import type { AllegroPart, PartSource } from "@/shared/types/domain";

const PLACEHOLDER_MARKERS = [
  "placeholder",
  "blank.gif",
  "spacer.gif",
];

const ATTR_CANDIDATES = [
  "data-src",
  "data-original",
  "data-lazy-src",
  "data-full-size-image-url",
  "data-srcset",
  "srcset",
  "src",
] as const;

type CheerioNode = {
  attr: (name: string) => string | undefined;
  find: (selector: string) => CheerioNode;
  first: () => CheerioNode;
};

export function extractLazyImageUrl($img: CheerioNode): string | null {
  for (const attr of ATTR_CANDIDATES) {
    const url = normalizeExternalImageUrl($img.attr(attr));
    if (!url) continue;
    if (PLACEHOLDER_MARKERS.some((marker) => url.toLowerCase().includes(marker))) continue;
    return url;
  }
  return null;
}

export function extractCardImageUrl($card: CheerioNode): string | null {
  const from_img = extractLazyImageUrl($card.find("img").first());
  if (from_img) return from_img;
  return extractLazyImageUrl($card.find("source").first());
}

export function tagFetchedParts(
  parts: AllegroPart[],
  damage_type: string,
  source: PartSource,
): AllegroPart[] {
  return parts.map((part) => ({
    ...part,
    damage_type,
    source: part.source ?? source,
    is_estimate: part.is_estimate ?? isPartEstimate(part),
    image: normalizeExternalImageUrl(part.image),
  }));
}

export function normalizeFetcherSource(source: string): PartSource {
  if (source === "parts_store") return "parts_store";
  if (source === "olx") return "olx";
  if (source === "ceneo") return "ceneo";
  if (source === "shop") return "shop";
  if (source === "estimate") return "estimate";
  return inferPartSource({ title: "", url: source, source });
}
