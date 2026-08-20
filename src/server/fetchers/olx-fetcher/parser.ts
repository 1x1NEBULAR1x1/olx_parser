import { normalizeExternalImageUrls } from "@/shared/lib/external-image";
import type { ParsedOlxListing } from "./fetcher";
import type { RawListing } from "./types";
import { isPriceParamValue } from "./guards";
import { formatOlxMemberSince, sanitizeOlxDescription } from "./listing-text";

export function parseOlxListing(raw_listing: RawListing): ParsedOlxListing {
  const price_param = raw_listing.params?.find((param) => param.key === "price");
  const price_value = price_param?.value;

  const photos = normalizeExternalImageUrls(
    (raw_listing.photos ?? []).map((photo) => photo.link),
  );

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
    description: sanitizeOlxDescription(raw_listing.description),
    seller_name: raw_listing.user?.name?.trim() || null,
    seller_member_since: formatOlxMemberSince(raw_listing.user?.created),
  };
}
