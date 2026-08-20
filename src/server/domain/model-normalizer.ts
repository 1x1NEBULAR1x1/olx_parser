// Заголовок объявления OLX почти всегда содержит рекламный "мусор" продавца
// (гарантия, доставка, состояние, объём памяти) вокруг реального названия
// модели — например: "jak nowy samsung galaxy s23 ultra 12 256gb real foto
// + gwarancja odbiór osobisty wysyłka". Использовать такую строку целиком
// как ключ группировки (для медианы цены) или как значение чекбокса фильтра
// бессмысленно — нужен канонический "model_key".
//
// Это эвристика на регулярках по популярным сериям, а не полноценный
// NLP-парсер: покрывает подавляющее большинство объявлений на OLX.pl
// (Samsung/Apple/Xiaomi-экосистема/Google/OnePlus), но для редких/старых
// моделей может выдать общий fallback (первые несколько токенов после
// бренда) вместо точного имени серии — известное ограничение, см. TODO.md.

interface SeriesPattern {
  brand: string;
  // Регэксп должен захватывать (группа 1) достаточно текста, чтобы
  // extractModelKey мог собрать из него нормализованный ключ.
  regex: RegExp;
  // Когда задан — ВСЕГДА используется как канонический префикс перед
  // захваченной группой (даже пустая строка "" — это валидное значение,
  // отличное от "не задан"), независимо от того, встретилось ли само слово
  // префикса в тексте объявления. Нужно для серий, название которых продавцы
  // часто пишут сокращённо/без родового слова ("Samsung S23" без "Galaxy",
  // "Motorola G15" вместо "Moto G15") — без канонизации такие объявления
  // получали РАЗНЫЙ model_key для одной и той же модели и не группировались
  // вместе ни в медиане цены, ни в чекбокс-фильтре. Когда не задан — ключ
  // строится из match[0] целиком (старое поведение, для брендов, где
  // родовое слово ("iphone", "redmi", "xperia"...) и так обязательно в regex).
  canonical_prefix?: string;
}

// Порядок важен: более специфичные паттерны (Ultra/Pro Max/FE) должны
// проверяться раньше общих, иначе общий вариант "съест" совпадение первым.
const SERIES_PATTERNS: SeriesPattern[] = [
  { brand: "apple", regex: /iphone\s*(\d{1,2}[cs]?(?:\s*(?:pro\s*max|pro|plus|mini|se))?)/i },
  // "galaxy" перед S/A/Note/Z/M опционален — часть продавцов пишет просто
  // "Samsung S23 Ultra" без слова "Galaxy". canonical_prefix гарантирует
  // ОДИНАКОВЫЙ model_key для обоих вариантов написания. Захваченная группа
  // включает саму букву серии ("s23 ultra", а не только "23 ultra") — иначе
  // при склейке с prefix="galaxy" получился бы лишний пробел между буквой и
  // цифрой ("galaxy s 23"), не совпадающий с ключами release-year-hints.ts.
  { brand: "samsung", regex: /(?:galaxy\s*)?\b(s\d{1,2}\s*(?:ultra|plus|fe|\+)?)\b/i, canonical_prefix: "galaxy" },
  { brand: "samsung", regex: /(?:galaxy\s*)?\b(a\d{1,2}\s*(?:5g)?)\b/i, canonical_prefix: "galaxy" },
  { brand: "samsung", regex: /(?:galaxy\s*)?\b(note\s*\d{1,2}\s*(?:ultra)?)\b/i, canonical_prefix: "galaxy" },
  { brand: "samsung", regex: /(?:galaxy\s*)?\b(z\s*(?:fold|flip)\s*\d{0,2})\b/i, canonical_prefix: "galaxy" },
  { brand: "samsung", regex: /(?:galaxy\s*)?\b(m\d{1,2})\b/i, canonical_prefix: "galaxy" },
  { brand: "xiaomi", regex: /xiaomi\s*(\d{1,2}\s*(?:pro|ultra|t)?)/i },
  // \b перед mi — иначе «redmi 13» захватывается как «mi 13».
  { brand: "xiaomi", regex: /(?:xiaomi\s+)?\bmi\s*(\d{1,2}[a-z]?(?:\s*(?:pro|ultra|t))?)/i, canonical_prefix: "mi" },
  { brand: "redmi", regex: /redmi\s*(note\s*\d{1,2}\s*(?:pro\s*plus|pro\+|pro)?(?:\s*5g)?|\d{1,2}[a-z]?)/i },
  { brand: "poco", regex: /poco\s*([xmf]\d{1,2}\s*(?:pro|gt)?)/i },
  { brand: "google", regex: /pixel\s*(\d{1,2}[a]?\s*(?:pro|xl)?)/i },
  { brand: "oneplus", regex: /(?:oneplus|one\s*plus)\s*(\d{1,2}[a-z]?\s*(?:pro|t)?)/i },
  { brand: "huawei", regex: /(?:huawei\s*)?(p\d{1,2}\s*(?:pro|lite)?)/i },
  { brand: "honor", regex: /honor\s*(\d{1,2}[a-z]?\s*(?:pro|lite)?)/i },
  { brand: "oppo", regex: /(?:oppo\s*)?(reno\s*\d{1,2}\s*(?:pro)?|find\s*x\d{0,2})/i },
  // A-серия Oppo — самая массовая на вторичном рынке PL, отдельно от Reno/Find X.
  { brand: "oppo", regex: /oppo\s*(a\d{1,3}[a-z]?\s*(?:pro)?)/i },
  { brand: "realme", regex: /realme\s*(\d{1,2}[a-z]?\s*(?:pro)?)/i },
  // "moto"/"motorola" перед серией — как и с Samsung/Galaxy, продавцы пишут
  // и полным, и коротким именем бренда вперемешку; canonical_prefix="" (не
  // "не задан"!) убирает брендовое слово из группы, оставляя только саму
  // серию — иначе "Motorola G15" (не матчился старым regex вообще) и
  // "Moto G15" давали бы РАЗНЫЙ model_key.
  { brand: "motorola", regex: /(?:motorola|moto)\s*([geGE]\s*\d{1,3}\s*(?:power|plus|play)?)/i, canonical_prefix: "" },
  { brand: "motorola", regex: /(?:motorola|moto)\s*(edge\s*\d{0,2}\s*(?:pro|neo)?)/i, canonical_prefix: "" },
  { brand: "sony", regex: /xperia\s*(\d\s*(?:iii|iv|v)?)/i },
  { brand: "nokia", regex: /nokia\s*(\d{1,4}[a-z]?\s*(?:plus)?)/i },
  { brand: "vivo", regex: /vivo\s*([xyv]\d{1,3}[a-z]?\s*(?:pro|lite|neo)?)/i },
  { brand: "infinix", regex: /infinix\s*((?:hot|note|zero)\s*\d{1,2}[a-z]?)/i },
  { brand: "tecno", regex: /tecno\s*((?:camon|spark|phantom)\s*[a-z0-9]{1,3})/i },
  { brand: "asus", regex: /(?:asus\s*)?(zenfone\s*\d{1,2}[a-z]?\s*(?:pro|ultra)?)/i },
  { brand: "lg", regex: /lg\s*([a-z]?\d{1,3}[a-z]?\s*(?:pro)?)/i },
  { brand: "htc", regex: /htc\s*((?:one|desire|u)\s*[a-z0-9]{0,4})/i },
];

// Некоторые модели пишут с польскими диакритическими буквами в рекламных
// словах вокруг названия (редко — в самом названии серии), а опечатки в
// раскладке иногда роняют/меняют диакритику. Нормализуем в NFKD и убираем
// комбинируемые диакритические знаки ДО прогонки regex'ов — иначе одна и та
// же модель, написанная с/без диакритики, могла попадать в разные ветки
// generic fallback.
function stripDiacritics(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

// Слова/паттерны, которые встречаются в заголовках объявлений, но не
// относятся к самому названию модели — вырезаем их до generic-fallback
// разбора (объём памяти, RAM, состояние, реклама продавца).
const NOISE_TOKEN_PATTERNS: RegExp[] = [
  /\b\d{2,4}\s*gb\b/gi,
  /\b\d{1,2}\s*\/\s*\d{2,4}\s*gb\b/gi,
  /\b\d{1,2}\s*gb\s*ram\b/gi,
  /\bjak\s*now[a-zęy]*\b/gi,
  /\bgwarancj[a-zęą]*\b/gi,
  /\bodbi[oó]r\s*osobisty\b/gi,
  /\bwysy[lł]k[a-zęą]*\b/gi,
  /\breal\s*foto\b/gi,
  /\bfaktur[a-zęą]*\b/gi,
  // \s*(?:bardzo\s*)? — раньше "stan bardzo dobry" не вырезался целиком,
  // потому что между "stan" и "dobry" мог стоять "bardzo" (не покрытый
  // прежним \s*), и слово "bardzo" утекало в fallback-токены model_key.
  /\bstan\s*(?:bardzo\s*)?(idealny|bdb|dobry|doskonały|doskonaly)\b/gi,
  /\bu[żz]ywan[a-zęy]*\b/gi,
  // Тип повреждения/состояния — защитная сетка на случай, когда сама модель
  // не попала ни в один SERIES_PATTERNS-регэксп (редкий бренд) и код уходит
  // в generic fallback: без этой очистки такие слова utekali в model_key
  // ("motorola g15 uszkodzony mikrofon" вместо "motorola g15").
  /\buszkodzon[a-zęy]*\b/gi,
  /\bsprawn[a-zęy]*\b/gi,
  /\bnowa\s*bateria\b/gi,
  /\bsprzedam\b/gi,
  /\bzamieni[eę]\b/gi,
  /\bcena\s*do\s*negocjacji\b/gi,
  /\bpilnie\b/gi,
  /\bokazja\b/gi,
  /\btanio\b/gi,
];

function stripNoiseTokens(text: string): string {
  let cleaned = text;
  for (const pattern of NOISE_TOKEN_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Некоторые regex'ы в SERIES_PATTERNS сами включают опциональный/обязательный
// префикс бренда (например xiaomi/redmi/poco/oneplus/honor/realme), поэтому
// match[0] иногда УЖЕ содержит имя бренда в начале — без этой очистки
// model_key задваивал бренд ("xiaomi xiaomi mi 11", "redmi redmi note 12").
function stripLeadingBrand(text: string, brand: string): string {
  const regex = new RegExp(`^${escapeRegExp(brand)}\\s*`, "i");
  return text.replace(regex, "").trim();
}

function toTitleCase(text: string): string {
  return text
    .split(" ")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export interface ModelKeyResult {
  model_key: string;
  model_label: string;
}

/**
 * Возвращает канонический ключ модели (нижний регистр, без цифр памяти) и
 * человекочитаемую подпись для UI/фильтров. Используется и для группировки
 * объявлений при расчёте медианной б/у цены модели, и для чекбокс-фильтра —
 * важно, чтобы оба места использовали ОДНУ функцию, иначе группы разойдутся.
 */
export function extractModelKey(brand: string, title: string): ModelKeyResult {
  const cleaned_title = stripNoiseTokens(stripDiacritics(title.toLowerCase()));

  for (const pattern of SERIES_PATTERNS) {
    if (pattern.brand !== brand) continue;
    const match = cleaned_title.match(pattern.regex);
    if (!match) continue;

    if (pattern.canonical_prefix !== undefined) {
      // Захваченная группа (match[1]) здесь НЕ включает родовое слово серии
      // ("s"/"a"/"moto" и т.п.) — оно подставляется из canonical_prefix
      // всегда одинаково, независимо от того, что написал продавец.
      const captured = (match[1] ?? "").replace(/\s+/g, " ").trim();
      const family_text = pattern.canonical_prefix
        ? `${pattern.canonical_prefix} ${captured}`.trim()
        : captured;
      const model_key = `${brand} ${family_text}`.trim();
      return { model_key, model_label: toTitleCase(model_key) };
    }

    // match[0] (весь матч, например "iphone 11 pro"), а НЕ только match[1]
    // (захваченная группа, например "11 pro") — иначе model_key терял имя
    // серии ("apple 11 pro" вместо "apple iphone 11 pro"), из-за чего
    // release-year-hints.ts (ключи вида "iphone 11 pro") не находил совпадение.
    const normalized_match = match[0].replace(/\s+/g, " ").trim();
    const family_text = stripLeadingBrand(normalized_match, brand);
    const model_key = `${brand} ${family_text}`.trim();
    return { model_key, model_label: toTitleCase(model_key) };
  }

  // Generic fallback: берём несколько первых значимых токенов после
  // упоминания бренда (или от начала строки, если бренд не найден в тексте
  // — например, извлечён по другому алиасу) — не идеально точно для редких
  // моделей, но лучше, чем группировать по полному заголовку объявления.
  const brand_index = cleaned_title.indexOf(brand);
  const after_brand = brand_index >= 0 ? cleaned_title.slice(brand_index + brand.length) : cleaned_title;
  const tokens = after_brand
    .split(" ")
    // Токены без единой буквы/цифры (голая пунктуация вроде "|", "-", "/",
    // которая иногда встречается в заголовках объявлений как разделитель) не
    // несут информации о модели и портят и model_key, и отображаемый label.
    .filter((token) => /[\p{L}\p{N}]/u.test(token) && !/^\d{1,2}$/.test(token));
  const fallback_tokens = tokens.slice(0, 4);
  const fallback_key = `${brand} ${fallback_tokens.join(" ")}`.trim() || brand;

  return { model_key: fallback_key, model_label: toTitleCase(fallback_key) };
}
