/** Порядок моделей в фильтре: iPhone 17 → 16 → 15, Galaxy S24 → S23 и т.д. */

export function getModelVersionSortKey(model_key: string, model_label = ""): number {
  const text = `${model_key} ${model_label}`.toLowerCase();

  let base = 0;

  const iphone_match = text.match(/iphone\s*(?:se\s*)?(\d{1,2})\b/);
  if (iphone_match?.[1]) base = Number.parseInt(iphone_match[1], 10) * 1000;

  const galaxy_s_match = text.match(/(?:galaxy\s*)?s(\d{1,2})\b/);
  if (!base && galaxy_s_match?.[1]) base = Number.parseInt(galaxy_s_match[1], 10) * 1000;

  const galaxy_a_match = text.match(/(?:galaxy\s*)?a(\d{1,3})\b/);
  if (!base && galaxy_a_match?.[1]) base = Number.parseInt(galaxy_a_match[1], 10) * 10;

  const galaxy_z_match = text.match(/(?:galaxy\s*)?z\s*(?:fold|flip)\s*(\d{1,2})?/);
  if (!base && galaxy_z_match) {
    base = (Number.parseInt(galaxy_z_match[1] ?? "5", 10) || 5) * 1000 + 500;
  }

  const galaxy_note_match = text.match(/(?:galaxy\s*)?note\s*(\d{1,2})\b/);
  if (!base && galaxy_note_match?.[1]) base = Number.parseInt(galaxy_note_match[1], 10) * 1000 + 200;

  const pixel_match = text.match(/pixel\s*(\d{1,2})\b/);
  if (!base && pixel_match?.[1]) base = Number.parseInt(pixel_match[1], 10) * 1000;

  const redmi_note_match = text.match(/redmi\s*note\s*(\d{1,2})\b/);
  if (!base && redmi_note_match?.[1]) base = Number.parseInt(redmi_note_match[1], 10) * 1000;

  const poco_match = text.match(/poco\s*[xmf]\s*(\d{1,2})\b/);
  if (!base && poco_match?.[1]) base = Number.parseInt(poco_match[1], 10) * 1000;

  const mi_match = text.match(/\bmi\s*(\d{1,2})\b/);
  if (!base && mi_match?.[1]) base = Number.parseInt(mi_match[1], 10) * 1000;

  const oneplus_match = text.match(/oneplus\s*(\d{1,2})\b/);
  if (!base && oneplus_match?.[1]) base = Number.parseInt(oneplus_match[1], 10) * 1000;

  if (!base) {
    const numbers = [...text.matchAll(/\b(\d{1,4})\b/g)]
      .map((match) => Number.parseInt(match[1], 10))
      .filter((value) => value >= 3 && value <= 99);
    if (numbers.length > 0) base = Math.max(...numbers) * 10;
  }

  let variant_bonus = 0;
  if (text.includes("ultra")) variant_bonus = 50;
  else if (text.includes("pro max")) variant_bonus = 45;
  else if (text.includes("pro")) variant_bonus = 35;
  else if (text.includes("plus")) variant_bonus = 25;
  else if (text.includes("mini")) variant_bonus = 15;
  else if (text.includes("fe")) variant_bonus = 10;

  return base + variant_bonus;
}
