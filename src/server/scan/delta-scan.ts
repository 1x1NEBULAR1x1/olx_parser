export interface ListingFingerprint {
  id: number;
  title: string;
  price_buy: number | null;
}

export interface DeltaScanPartition {
  unchanged_ids: number[];
  changed_ids: number[];
  new_ids: number[];
  dropped_ids: number[];
}

const PRICE_EPSILON_PLN = 0.5;

export function pricesMatch(left: number | null, right: number | null): boolean {
  if (left === null && right === null) return true;
  if (left === null || right === null) return false;
  return Math.abs(left - right) < PRICE_EPSILON_PLN;
}

export function listingsMatch(incoming: ListingFingerprint, previous: ListingFingerprint): boolean {
  return incoming.id === previous.id
    && incoming.title.trim() === previous.title.trim()
    && pricesMatch(incoming.price_buy, previous.price_buy);
}

export function partitionDeltaScan(
  incoming: ListingFingerprint[],
  previous_by_id: Map<number, ListingFingerprint>,
): DeltaScanPartition {
  const unchanged_ids: number[] = [];
  const changed_ids: number[] = [];
  const new_ids: number[] = [];
  const incoming_ids = new Set<number>();

  for (const listing of incoming) {
    incoming_ids.add(listing.id);
    const previous = previous_by_id.get(listing.id);
    if (!previous) {
      new_ids.push(listing.id);
      continue;
    }
    if (listingsMatch(listing, previous)) {
      unchanged_ids.push(listing.id);
    } else {
      changed_ids.push(listing.id);
    }
  }

  const dropped_ids: number[] = [];
  for (const previous_id of previous_by_id.keys()) {
    if (!incoming_ids.has(previous_id)) dropped_ids.push(previous_id);
  }

  return { unchanged_ids, changed_ids, new_ids, dropped_ids };
}

export function idsNeedingAnalysis(partition: DeltaScanPartition): number[] {
  return [...partition.new_ids, ...partition.changed_ids];
}
