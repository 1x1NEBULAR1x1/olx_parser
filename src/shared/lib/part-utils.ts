import type { AllegroPart, PartSource } from "@/shared/types/domain";

export function isPartEstimate(part: { title: string; is_estimate?: boolean }): boolean {
  return part.is_estimate === true || part.title.includes("★");
}

export function inferPartSource(part: AllegroPart): PartSource {
  if (part.source) return part.source;
  if (isPartEstimate(part)) return "estimate";

  const url = part.url.toLowerCase();
  if (url.includes("parts-store.pl")) return "parts_store";
  if (url.includes("allegro.pl")) return "allegro";
  if (url.includes("olx.pl")) return "olx";
  if (url.includes("ceneo.pl")) return "ceneo";

  return "allegro";
}

export function normalizePart(part: AllegroPart): AllegroPart {
  return {
    ...part,
    is_estimate: isPartEstimate(part),
    source: inferPartSource(part),
  };
}
