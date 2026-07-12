const KIMOVIL_AUTOCOMPLETE_URL =
  "https://www.kimovil.com/_json/autocomplete_devicemodels_joined.json";
const KIMOVIL_OPINIONS_BASE_URL = "https://www.kimovil.com/ru/opinions";

interface KimovilAutocompleteResult {
  full_name?: string;
  result_type?: string;
  is_rumor?: boolean;
  ki?: number;
  url?: string;
}

interface KimovilAutocompleteResponse {
  results?: KimovilAutocompleteResult[];
}

export interface KimovilScoresResult {
  geek_score: number | null;
  user_score: number | null;
  combined_score: number | null;
  matched_model_name: string | null;
}

function tokenizeModelName(model_name: string): string[] {
  return model_name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function getTokenIntersectionCount(left_tokens: string[], right_tokens: string[]): number {
  const right_token_set = new Set(right_tokens);
  let intersection_count = 0;

  for (const token of left_tokens) {
    if (right_token_set.has(token)) {
      intersection_count += 1;
    }
  }

  return intersection_count;
}

function getBestKimovilMatch(
  model_name: string,
  results: KimovilAutocompleteResult[],
): KimovilAutocompleteResult | null {
  const model_tokens = tokenizeModelName(model_name);
  if (!model_tokens.length) {
    return null;
  }

  let best_match: KimovilAutocompleteResult | null = null;
  let best_match_score = -1;

  for (const row of results) {
    if (row.result_type !== "smartphones" || row.is_rumor) {
      continue;
    }

    const candidate_tokens = tokenizeModelName(row.full_name ?? "");
    const overlap_count = getTokenIntersectionCount(model_tokens, candidate_tokens);
    const coverage_score = overlap_count / model_tokens.length;

    if (coverage_score > best_match_score) {
      best_match_score = coverage_score;
      best_match = row;
    }
  }

  return best_match_score >= 0.5 ? best_match : null;
}

function clampScore(raw_score: number): number {
  return Math.max(0, Math.min(100, raw_score));
}

function getCombinedScore(geek_score: number | null, user_score: number | null): number | null {
  if (typeof geek_score === "number" && typeof user_score === "number") {
    return clampScore((geek_score + user_score) / 2);
  }
  if (typeof geek_score === "number") {
    return clampScore(geek_score);
  }
  if (typeof user_score === "number") {
    return clampScore(user_score);
  }
  return null;
}

function parseKimovilUserScore(html: string): number | null {
  const score_match = html.match(
    /item-users-score[\s\S]*?<div class="score">\s*([0-9]+(?:[.,][0-9]+)?)\s*</i,
  );
  if (!score_match?.[1]) {
    return null;
  }

  const normalized_score = score_match[1].replace(",", ".");
  const parsed_score = Number.parseFloat(normalized_score);
  if (!Number.isFinite(parsed_score)) {
    return null;
  }

  return clampScore(parsed_score * 10);
}

async function getKimovilUserScoreBySlug(device_slug?: string): Promise<number | null> {
  if (!device_slug) {
    return null;
  }

  const request_url = `${KIMOVIL_OPINIONS_BASE_URL}/${encodeURIComponent(device_slug)}`;
  const response = await fetch(request_url, {
    method: "GET",
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  return parseKimovilUserScore(html);
}

export async function getKimovilScoresByModel(model_name: string): Promise<KimovilScoresResult> {
  const request_url = `${KIMOVIL_AUTOCOMPLETE_URL}?device_type=0&name=${encodeURIComponent(model_name)}`;
  const response = await fetch(request_url, {
    method: "GET",
  });

  if (!response.ok) {
    return {
      geek_score: null,
      user_score: null,
      combined_score: null,
      matched_model_name: null,
    };
  }

  const body = (await response.json()) as KimovilAutocompleteResponse;
  const best_match = getBestKimovilMatch(model_name, body.results ?? []);

  const geek_score =
    best_match && typeof best_match.ki === "number" && Number.isFinite(best_match.ki)
      ? clampScore(best_match.ki)
      : null;
  const user_score = await getKimovilUserScoreBySlug(best_match?.url);
  const combined_score = getCombinedScore(geek_score, user_score);

  return {
    geek_score,
    user_score,
    combined_score,
    matched_model_name: best_match?.full_name ?? null,
  };
}
