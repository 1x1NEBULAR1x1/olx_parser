import { prisma } from "@/shared/db/client";
import type { AnalyzedDevice } from "@/shared/types/domain";

interface MedianBucket {
  brand: string;
  model_key: string;
  storage_gb: number | null;
  prices: number[];
}

function bucketKey(brand: string, model_key: string, storage_gb: number | null): string {
  return `${brand}::${model_key}::${storage_gb ?? "any"}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function savePriceHistoryFromScan(
  scan_id: string,
  devices: AnalyzedDevice[],
): Promise<number> {
  const buckets = new Map<string, MedianBucket>();

  for (const device of devices) {
    if (device.damage_types.length > 0) continue;
    if (!device.price_buy || device.price_buy <= 0) continue;

    const key = bucketKey(device.brand, device.model_key, device.storage_gb);
    const bucket = buckets.get(key) ?? {
      brand: device.brand,
      model_key: device.model_key,
      storage_gb: device.storage_gb,
      prices: [],
    };
    bucket.prices.push(device.price_buy);
    buckets.set(key, bucket);
  }

  const rows = Array.from(buckets.values())
    .filter((bucket) => bucket.prices.length >= 2)
    .map((bucket) => ({
      scan_id,
      brand: bucket.brand,
      model_key: bucket.model_key,
      storage_gb: bucket.storage_gb,
      median_working_price: Math.round(median(bucket.prices)),
      sample_count: bucket.prices.length,
    }));

  if (rows.length === 0) return 0;

  await prisma.priceHistorySnapshot.createMany({ data: rows });
  return rows.length;
}

export async function getPriceHistoryTrend(
  brand: string,
  model_key: string,
  storage_gb: number | null,
  limit = 12,
): Promise<Array<{ recorded_at: string; median_working_price: number; sample_count: number }>> {
  const rows = await prisma.priceHistorySnapshot.findMany({
    where: {
      brand,
      model_key,
      storage_gb: storage_gb ?? null,
    },
    orderBy: { recorded_at: "desc" },
    take: limit,
  });

  return rows.reverse().map((row) => ({
    recorded_at: row.recorded_at.toISOString(),
    median_working_price: row.median_working_price,
    sample_count: row.sample_count,
  }));
}
