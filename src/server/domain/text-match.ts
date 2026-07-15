// Общая утилита для поиска ключевых слов/фраз в тексте по границам слова.
//
// Встроенный \b в JS-регулярках понимает только ASCII word-символы ([A-Za-z0-9_]),
// поэтому на польских диакритических буквах (ą, ę, ł, ń, ó, ś, ź, ż) он ведёт себя
// непредсказуемо. Ниже используется lookaround по \p{L}/\p{N}, что корректно
// работает с любым unicode-текстом и не даёт словам-подстрокам вроде "mic"
// (внутри "chemicznie") или "power" (внутри "powerbank") ложно матчиться.
//
// Польский — флективный язык: словарные ключи типа "dotyk"/"ekran"/"aparat"
// в реальных объявлениях почти всегда встречаются в падежных формах ("dotyku",
// "ekranie", "aparatem" и т.п.). Жёсткая граница слова без учёта этого не давала
// ни одного совпадения на живых объявлениях OLX. Ниже разрешаем keyword'у
// заканчиваться одним из типичных польских падежных окончаний — это не задевает
// защиту от ложных срабатываний, потому что "power" + "bank" не входит в этот
// список окончаний (в отличие от "power" + пустая строка).
const POLISH_CASE_SUFFIXES = [
  "ami", "owi", "emu", "ego", "ymi", "ych", "iej",
  "ie", "em", "om", "ów", "ej",
  "a", "y", "i", "e", "o", "u", "ą", "ę",
];

const keyword_regex_cache = new Map<string, RegExp>();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildKeywordRegex(keyword: string): RegExp {
  const normalized_keyword = keyword.trim().toLowerCase();
  const cached = keyword_regex_cache.get(normalized_keyword);
  if (cached) {
    return cached;
  }

  const pattern_body = escapeRegExp(normalized_keyword).replace(/\s+/g, "\\s+");
  const suffix_alternation = POLISH_CASE_SUFFIXES.join("|");
  const regex = new RegExp(
    `(?<![\\p{L}\\p{N}])${pattern_body}(?:${suffix_alternation})?(?![\\p{L}\\p{N}])`,
    "u",
  );
  keyword_regex_cache.set(normalized_keyword, regex);
  return regex;
}

/**
 * Проверяет вхождение keyword в haystack как отдельного слова/фразы,
 * а не произвольной подстроки внутри другого слова.
 */
export function containsKeyword(haystack: string, keyword: string): boolean {
  if (!keyword.trim()) {
    return false;
  }
  return buildKeywordRegex(keyword).test(haystack.toLowerCase());
}

const global_keyword_regex_cache = new Map<string, RegExp>();

function buildGlobalKeywordRegex(keyword: string): RegExp {
  const normalized_keyword = keyword.trim().toLowerCase();
  const cached = global_keyword_regex_cache.get(normalized_keyword);
  if (cached) {
    // У regex с флагом "g" состояние (lastIndex) хранится на самом объекте —
    // сбрасываем перед каждым новым проходом, иначе повторный вызов может
    // начать матчинг не с начала строки.
    cached.lastIndex = 0;
    return cached;
  }

  const pattern_body = escapeRegExp(normalized_keyword).replace(/\s+/g, "\\s+");
  const suffix_alternation = POLISH_CASE_SUFFIXES.join("|");
  const regex = new RegExp(
    `(?<![\\p{L}\\p{N}])${pattern_body}(?:${suffix_alternation})?(?![\\p{L}\\p{N}])`,
    "gu",
  );
  global_keyword_regex_cache.set(normalized_keyword, regex);
  return regex;
}

/**
 * Возвращает окно текста (window_size символов до и после) вокруг каждого
 * найденного вхождения keyword в haystack. Используется там, где важно не
 * только само совпадение, но и его контекст (например, отличить "bateria
 * 100%" — здоровая батарея как достоинство объявления — от "bateria do
 * wymiany" — батарея, которую нужно менять).
 */
export function getKeywordContexts(haystack: string, keyword: string, window_size = 25): string[] {
  if (!keyword.trim()) {
    return [];
  }
  const lower_haystack = haystack.toLowerCase();
  const regex = buildGlobalKeywordRegex(keyword);
  const contexts: string[] = [];

  for (const match of lower_haystack.matchAll(regex)) {
    const start = Math.max(0, (match.index ?? 0) - window_size);
    const end = Math.min(lower_haystack.length, (match.index ?? 0) + match[0].length + window_size);
    contexts.push(lower_haystack.slice(start, end));
  }

  return contexts;
}
