import { isPartEstimate, inferPartSource } from "@/shared/lib/part-utils";
import type { AllegroPart, PartSource } from "@/shared/types/domain";

/** Чем меньше — тем раньше источник попадает в выдачу. */
export const PART_SOURCE_RANK: Record<PartSource, number> = {
  allegro: 0,
  ceneo: 1,
  parts_store: 2,
  shop: 2,
  olx: 3,
  estimate: 4,
};

export const MAX_PARTS_PER_DAMAGE_TYPE = 4;

export function getPartSourceRank(source: PartSource | string | undefined): number {
  if (source && source in PART_SOURCE_RANK) {
    return PART_SOURCE_RANK[source as PartSource];
  }
  return PART_SOURCE_RANK.estimate;
}

function partIdentity(part: AllegroPart): string {
  if (part.url) return part.url;
  return `${part.title}|${part.price ?? "none"}|${part.damage_type ?? ""}`;
}

function compareRankedParts(a: AllegroPart, b: AllegroPart): number {
  const rank_delta = getPartSourceRank(inferPartSource(a)) - getPartSourceRank(inferPartSource(b));
  if (rank_delta !== 0) return rank_delta;
  return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
}

/** До 4 позиций на тип повреждения: Allegro → Ceneo → магазины → OLX. */
export function selectRankedParts(
  parts: AllegroPart[],
  limit = MAX_PARTS_PER_DAMAGE_TYPE,
): AllegroPart[] {
  const groups = new Map<string, AllegroPart[]>();

  for (const part of parts) {
    const key = part.damage_type || "_";
    const group = groups.get(key) ?? [];
    group.push(part);
    groups.set(key, group);
  }

  const result: AllegroPart[] = [];
  for (const group of groups.values()) {
    const seen = new Set<string>();
    const unique: AllegroPart[] = [];
    for (const part of group) {
      const id = partIdentity(part);
      if (seen.has(id)) continue;
      seen.add(id);
      unique.push(part);
    }

    const real_parts = unique.filter((part) => !isPartEstimate(part));
    const pool = real_parts.length > 0 ? real_parts : unique.slice(0, 1);
    result.push(...[...pool].sort(compareRankedParts).slice(0, limit));
  }

  return result;
}

export function countRealParts(parts: AllegroPart[]): number {
  return parts.filter((part) => !isPartEstimate(part)).length;
}
