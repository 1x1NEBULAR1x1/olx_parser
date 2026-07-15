import { createLogger } from "./logger";

const allegro_log = createLogger("allegro");

const ALLEGRO_API_BASE = "https://api.allegro.pl";
const ALLEGRO_AUTH_URL = "https://allegro.pl/auth/oauth/token";

let cached_token: { value: string; expires_at: number } | null = null;

function getAllegroCredentials(): { client_id: string; client_secret: string } | null {
  const client_id = process.env.ALLEGRO_CLIENT_ID?.trim();
  const client_secret = process.env.ALLEGRO_CLIENT_SECRET?.trim();
  if (!client_id || !client_secret) return null;
  return { client_id, client_secret };
}

export function isAllegroApiConfigured(): boolean {
  return getAllegroCredentials() !== null;
}

export async function getAllegroAccessToken(): Promise<string | null> {
  const credentials = getAllegroCredentials();
  if (!credentials) return null;

  if (cached_token && cached_token.expires_at > Date.now() + 60_000) {
    return cached_token.value;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
  });

  const response = await fetch(ALLEGRO_AUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.client_id}:${credentials.client_secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    allegro_log.warn("OAuth token failed", { status: response.status });
    return null;
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;

  cached_token = {
    value: data.access_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

export interface AllegroApiOffer {
  id: string;
  name: string;
  selling_mode?: { price?: { amount?: string; currency?: string } };
  images?: Array<{ url?: string }>;
}

export interface AllegroListingSearchResult {
  offers: AllegroApiOffer[];
  search_url: string;
}

export async function searchAllegroOffersListing(
  phrase: string,
  options: { category_id?: number; limit?: number } = {},
): Promise<AllegroListingSearchResult | null> {
  const token = await getAllegroAccessToken();
  if (!token) return null;

  const params = new URLSearchParams({
    phrase,
    limit: String(options.limit ?? 20),
    "fallback": "false",
  });
  if (options.category_id) {
    params.set("category.id", String(options.category_id));
  }

  const search_url = `https://allegro.pl/listing?string=${encodeURIComponent(phrase)}${options.category_id ? `&category=${options.category_id}` : ""}`;

  const response = await fetch(`${ALLEGRO_API_BASE}/offers/listing?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.allegro.public.v1+json",
    },
  });

  if (!response.ok) {
    allegro_log.debug("offers/listing unavailable", { status: response.status, phrase });
    return null;
  }

  const data = (await response.json()) as { items?: { promoted?: AllegroApiOffer[]; regular?: AllegroApiOffer[] } };
  const offers = [
    ...(data.items?.regular ?? []),
    ...(data.items?.promoted ?? []),
  ];

  return { offers, search_url };
}
