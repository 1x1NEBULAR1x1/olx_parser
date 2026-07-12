import type { ParsedOlxListing } from "./fetcher";
import type { RawListing } from "./types";
import { isPriceParamValue } from "./guards";

export function parseOlxListing(raw_listing: RawListing): ParsedOlxListing {
  const price_param = raw_listing.params?.find((param) => param.key === "price");
  const price_value = price_param?.value;

  const photos = (raw_listing.photos ?? [])
    .map((p) => p.link)
    .filter((link): link is string => typeof link === "string" && link.length > 0)
    .map((link) => link.replace("{width}x{height}", "640x480"));

  return {
    id: raw_listing.id,
    title: raw_listing.title,
    url: raw_listing.url,
    created_at: raw_listing.created_time,
    city: raw_listing.location?.city?.name ?? null,
    region: raw_listing.location?.region?.name ?? null,
    price_value: isPriceParamValue(price_value) ? price_value.value ?? null : null,
    price_currency: isPriceParamValue(price_value) ? price_value.currency ?? null : null,
    is_negotiable: isPriceParamValue(price_value) ? price_value.negotiable ?? null : null,
    photos,
  };
}
