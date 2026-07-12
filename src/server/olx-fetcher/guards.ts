import type { ListingParamValue, PriceParamValue } from "./types";

export function isPriceParamValue(value: ListingParamValue | null | undefined): value is PriceParamValue {
  return value !== null && value !== undefined && value.__typename === "PriceParam";
}