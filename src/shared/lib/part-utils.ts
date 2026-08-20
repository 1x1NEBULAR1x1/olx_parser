import type { AllegroPart, PartSource } from "@/shared/types/domain";

export function isPartEstimate(part: { title: string; is_estimate?: boolean }): boolean {
  return part.is_estimate === true || part.title.includes("★");
}

const KNOWN_PART_SOURCES = new Set<PartSource>([
  "allegro",
  "olx",
  "parts_store",
  "shop",
  "ceneo",
  "estimate",
]);

const SHOP_HOST_MARKERS = [
  "mobilepart.pl",
  "m9parts.pl",
  "phone-parts.pl",
  "fonparts.pl",
  "gsmnet.pl",
];

export const PART_SOURCE_I18N_KEY: Record<PartSource,
  | "parts_source_allegro"
  | "parts_source_olx"
  | "parts_source_parts_store"
  | "parts_source_shop"
  | "parts_source_ceneo"
  | "parts_source_estimate"
> = {
  allegro: "parts_source_allegro",
  olx: "parts_source_olx",
  parts_store: "parts_source_parts_store",
  shop: "parts_source_shop",
  ceneo: "parts_source_ceneo",
  estimate: "parts_source_estimate",
};

export const PART_SOURCE_HOST: Record<Exclude<PartSource, "shop" | "estimate">, string> = {
  allegro: "allegro.pl",
  olx: "olx.pl",
  parts_store: "parts-store.pl",
  ceneo: "ceneo.pl",
};

export function getPartSourceHost(part: { url?: string; source?: string }): string | null {
  const source = inferPartSource({
    title: "",
    url: part.url ?? "",
    source: part.source,
  });
  if (source === "estimate") return null;
  if (source === "shop") {
    try {
      return new URL(part.url ?? "").hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }
  return PART_SOURCE_HOST[source];
}

export function inferPartSource(part: {
  title: string;
  url: string;
  source?: string;
  is_estimate?: boolean;
}): PartSource {
  if (isPartEstimate(part)) return "estimate";

  const url = part.url.toLowerCase();
  if (url.includes("parts-store.pl")) return "parts_store";
  if (url.includes("allegro.pl")) return "allegro";
  if (url.includes("olx.pl")) return "olx";
  if (url.includes("ceneo.pl")) return "ceneo";
  if (SHOP_HOST_MARKERS.some((host) => url.includes(host))) return "shop";

  if (part.source && KNOWN_PART_SOURCES.has(part.source as PartSource)) {
    return part.source as PartSource;
  }

  return "allegro";
}

export function normalizePart(part: AllegroPart): AllegroPart {
  return {
    ...part,
    is_estimate: isPartEstimate(part),
    source: inferPartSource(part),
  };
}
