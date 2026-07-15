// Каноническая «линейка» модели для группировки и сортировки — грубее,
// чем model_key (например, все «Galaxy S23/S24 Ultra» → «Galaxy S», все
// «iPhone 14 Pro/Pro Max» → отдельные линейки). Эвристика по model_key
// после extractModelKey, без отдельного NLP.

export interface ModelLineResult {
  model_line: string;
  model_line_label: string;
}

function toTitleCase(text: string): string {
  return text
    .split(" ")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function extractModelLine(brand: string, model_key: string): ModelLineResult {
  const key = model_key.toLowerCase().trim();

  if (brand === "samsung") {
    if (/\bgalaxy\s+z\b|\bz\s*fold|\bz\s*flip/.test(key)) {
      return { model_line: "galaxy z", model_line_label: "Galaxy Z" };
    }
    if (/\bgalaxy\s+note\b|\bnote\s*\d/.test(key)) {
      return { model_line: "galaxy note", model_line_label: "Galaxy Note" };
    }
    if (/\bgalaxy\s+s\d|\bgalaxy\s+s\s*\d/.test(key)) {
      return { model_line: "galaxy s", model_line_label: "Galaxy S" };
    }
    if (/\bgalaxy\s+a\d|\bgalaxy\s+a\s*\d/.test(key)) {
      return { model_line: "galaxy a", model_line_label: "Galaxy A" };
    }
    if (/\bgalaxy\s+m\d|\bgalaxy\s+m\s*\d/.test(key)) {
      return { model_line: "galaxy m", model_line_label: "Galaxy M" };
    }
  }

  if (brand === "apple" && /\biphone\b/.test(key)) {
    if (/pro\s*max/.test(key)) return { model_line: "iphone pro max", model_line_label: "iPhone Pro Max" };
    if (/\bpro\b/.test(key)) return { model_line: "iphone pro", model_line_label: "iPhone Pro" };
    if (/\bplus\b/.test(key)) return { model_line: "iphone plus", model_line_label: "iPhone Plus" };
    if (/\bmini\b/.test(key)) return { model_line: "iphone mini", model_line_label: "iPhone Mini" };
    if (/\bse\b/.test(key)) return { model_line: "iphone se", model_line_label: "iPhone SE" };
    return { model_line: "iphone", model_line_label: "iPhone" };
  }

  if (brand === "xiaomi") {
    if (/\bmi\s*\d/.test(key)) return { model_line: "mi", model_line_label: "Mi" };
    if (/\bredmi\s+note\b/.test(key)) return { model_line: "redmi note", model_line_label: "Redmi Note" };
    if (/\bredmi\b/.test(key)) return { model_line: "redmi", model_line_label: "Redmi" };
    if (/\bpoco\b/.test(key)) return { model_line: "poco", model_line_label: "POCO" };
  }

  if (brand === "redmi" && /\bnote\b/.test(key)) {
    return { model_line: "redmi note", model_line_label: "Redmi Note" };
  }
  if (brand === "poco") {
    if (/\bpoco\s*x\b/.test(key)) return { model_line: "poco x", model_line_label: "POCO X" };
    if (/\bpoco\s*f\b/.test(key)) return { model_line: "poco f", model_line_label: "POCO F" };
    if (/\bpoco\s*m\b/.test(key)) return { model_line: "poco m", model_line_label: "POCO M" };
  }

  if (brand === "google" && /\bpixel\b/.test(key)) {
    if (/pro/.test(key)) return { model_line: "pixel pro", model_line_label: "Pixel Pro" };
    return { model_line: "pixel", model_line_label: "Pixel" };
  }

  if (brand === "oneplus") return { model_line: "oneplus", model_line_label: "OnePlus" };
  if (brand === "huawei" && /\bp\d/.test(key)) return { model_line: "huawei p", model_line_label: "Huawei P" };
  if (brand === "honor") return { model_line: "honor", model_line_label: "Honor" };
  if (brand === "oppo" && /\breno\b/.test(key)) return { model_line: "oppo reno", model_line_label: "Oppo Reno" };
  if (brand === "oppo" && /\ba\d/.test(key)) return { model_line: "oppo a", model_line_label: "Oppo A" };
  if (brand === "motorola" && /\bedge\b/.test(key)) return { model_line: "motorola edge", model_line_label: "Motorola Edge" };
  if (brand === "motorola") return { model_line: "motorola g", model_line_label: "Motorola G" };
  if (brand === "sony" && /\bxperia\b/.test(key)) return { model_line: "xperia", model_line_label: "Xperia" };
  if (brand === "nokia") return { model_line: "nokia", model_line_label: "Nokia" };

  // Fallback — первая значимая часть model_key после бренда
  const without_brand = key.startsWith(`${brand} `) ? key.slice(brand.length + 1) : key;
  const first_token = without_brand.split(" ").filter(Boolean)[0] ?? "other";
  const model_line = first_token === brand ? "other" : first_token;
  return {
    model_line: model_line === "other" ? "other" : `${brand} ${model_line}`,
    model_line_label: model_line === "other" ? toTitleCase(brand) : toTitleCase(`${brand} ${first_token}`),
  };
}

/** Порядок сортировки линеек внутри бренда (меньше = выше в списке). */
export { getModelLineSortKey } from "@/shared/lib/model-line-sort-key";
