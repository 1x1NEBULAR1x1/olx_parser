export interface ProfitFloorSettings {
  exclude_unprofitable: boolean;
  min_profit_pln: number;
  min_profit_pct_of_price: number;
}

export function resolveDisplayProfit(
  risk_adjusted_profit: number | null,
  profit_estimate: number | null,
): number | null {
  return risk_adjusted_profit ?? profit_estimate;
}

/**
 * Персональный порог «не показывать убыточные»: объявление остаётся в ленте,
 * если ожидаемая прибыль не ниже суммы (zł) и не ниже % от цены покупки.
 * При обоих порогах 0 скрываются только сделки с прибылью < 0.
 */
export function passesProfitFloor(
  listing: {
    price_buy: number | null;
    risk_adjusted_profit: number | null;
    profit_estimate: number | null;
  },
  settings: ProfitFloorSettings,
): boolean {
  if (!settings.exclude_unprofitable) return true;

  const profit = resolveDisplayProfit(listing.risk_adjusted_profit, listing.profit_estimate);
  if (profit === null) return true;
  if (profit < settings.min_profit_pln) return false;

  if (listing.price_buy !== null && listing.price_buy > 0) {
    const profit_pct = (profit / listing.price_buy) * 100;
    if (profit_pct < settings.min_profit_pct_of_price) return false;
  }

  return true;
}
