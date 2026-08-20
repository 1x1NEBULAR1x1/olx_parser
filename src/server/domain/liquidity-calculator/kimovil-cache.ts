import { getKimovilScoresByModel, type KimovilScoresResult } from "@/server/domain/liquidity-calculator/kimovil-fetcher";
import { getModelCache, upsertModelCache } from "@/server/repositories/devices-repository";

export async function getKimovilScoresFromCacheOnly(
  brand: string,
  model_key: string,
): Promise<KimovilScoresResult | null> {
  const cached = await getModelCache(brand, model_key);
  if (
    cached?.kimovil_combined_score == null
    && cached?.kimovil_geek_score == null
    && cached?.kimovil_user_score == null
  ) {
    return null;
  }
  return {
    geek_score: cached.kimovil_geek_score ?? null,
    user_score: cached.kimovil_user_score ?? null,
    combined_score: cached.kimovil_combined_score ?? null,
    matched_model_name: cached.kimovil_matched_name ?? null,
  };
}

export async function getKimovilScoresCached(
  brand: string,
  model_key: string,
  model_name: string,
  cache_ttl_hours: number,
): Promise<KimovilScoresResult> {
  const cached = await getModelCache(brand, model_key);
  if (
    cached?.kimovil_combined_score !== null
    && cached?.kimovil_combined_score !== undefined
  ) {
    return {
      geek_score: cached.kimovil_geek_score ?? null,
      user_score: cached.kimovil_user_score ?? null,
      combined_score: cached.kimovil_combined_score ?? null,
      matched_model_name: cached.kimovil_matched_name ?? null,
    };
  }

  const fresh = await getKimovilScoresByModel(model_name);
  if (fresh.combined_score !== null) {
    void upsertModelCache(brand, model_key, {
      kimovil_geek_score: fresh.geek_score,
      kimovil_user_score: fresh.user_score,
      kimovil_combined_score: fresh.combined_score,
      kimovil_matched_name: fresh.matched_model_name,
    }, cache_ttl_hours);
  }

  return fresh;
}
