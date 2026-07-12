// model-normalizer.ts уже приводит заголовок к канонической форме через
// регэксп-паттерны, но на реальных объявлениях OLX всё равно остаются
// дубли одной и той же модели с РАЗНЫМИ model_key из-за:
//   - разного регистра/расстановки пробелов ("Galaxy S23", "galaxys23",
//     "GALAXY  S23" — до этого модуля НЕ считались одним ключом, если по
//     каким-то причинам расходились до regex-этапа);
//   - опечаток в буквенной части названия серии ("iphohe 11 pro", "galaxi s23").
//
// Это отдельный пост-процессинг ПОСЛЕ extractModelKey: кластеризует уже
// посчитанные model_key внутри одного скана и выбирает единый канонический
// вариант (самый частый) для каждого кластера — используется и для медианы
// цены, и для чекбокс-фильтра моделей, поэтому дедуп происходит ОДИН раз, в
// одном месте, а не отдельно в каждом потребителе model_key.

function stripDiacritics(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

// Буквенный "отпечаток" без пробелов/цифр/пунктуации — два ключа с разным
// регистром или расстановкой пробелов дают ИДЕНТИЧНЫЙ отпечаток (сливаются
// сразу, без всякой нечёткости), а с опечаткой в одну-две буквы — близкий
// по Левенштейну (сливаются по порогу ниже).
function toAlphaFingerprint(text: string): string {
  return stripDiacritics(text.toLowerCase()).replace(/[^a-z]/g, "");
}

// Цифры (номер модели: "23" в "s23", "11" в "iphone 11") — единственная
// часть ключа, где НЕЛЬЗЯ допускать нечёткое совпадение: "s23" и "s24" отличаются
// на одну цифру, но это два разных реальных устройства разных лет выпуска.
// Поэтому цифровая сигнатура должна совпадать ТОЧНО, иначе кластер невозможен,
// какой бы близкой ни была буквенная часть.
function toDigitSignature(text: string): string {
  return (text.match(/\d+/g) ?? []).join("-");
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous_row = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current_row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution_cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current_row.push(
        Math.min(
          previous_row[j] + 1, // удаление
          current_row[j - 1] + 1, // вставка
          previous_row[j - 1] + substitution_cost, // замена
        ),
      );
    }
    previous_row = current_row;
  }

  return previous_row[b.length];
}

// Короче — строже: на коротких буквенных отпечатках ("apple se") даже одна
// правка может случайно превратить одну модель в другую, поэтому допускаем
// не больше 1 правки. На более длинных ("samsunggalaxysultra") опечатка на
// 2 буквы всё ещё почти наверняка одно и то же слово, а не другая модель.
function maxEditDistanceFor(fingerprint_length: number): number {
  return fingerprint_length <= 10 ? 1 : 2;
}

export interface ModelKeyLabelPair {
  model_key: string;
  model_label: string;
}

interface ClusterRoot {
  canonical_key: string;
  alpha_fingerprint: string;
  digit_signature: string;
}

/**
 * Принимает пары (model_key, model_label) всех объявлений скана, возвращает
 * карту "исходный model_key" -> "канонический (model_key, model_label)".
 * Каноническим становится САМЫЙ ЧАСТЫЙ вариант в кластере — обычно это и есть
 * правильное написание, опечатки/варианты форматирования встречаются реже.
 */
export function clusterModelKeys(pairs: ModelKeyLabelPair[]): Map<string, ModelKeyLabelPair> {
  const frequency_by_key = new Map<string, number>();
  const label_by_key = new Map<string, string>();

  for (const { model_key, model_label } of pairs) {
    frequency_by_key.set(model_key, (frequency_by_key.get(model_key) ?? 0) + 1);
    if (!label_by_key.has(model_key)) {
      label_by_key.set(model_key, model_label);
    }
  }

  // Обрабатываем от самого частого к самому редкому — тогда первый ключ,
  // "открывающий" кластер, всегда самый частый вариант, и не нужно отдельно
  // выбирать канонический ключ постфактум.
  const unique_keys = [...frequency_by_key.keys()].sort(
    (a, b) => (frequency_by_key.get(b) ?? 0) - (frequency_by_key.get(a) ?? 0),
  );

  const clusters: ClusterRoot[] = [];
  const canonical_key_by_raw_key = new Map<string, string>();

  for (const key of unique_keys) {
    const alpha_fingerprint = toAlphaFingerprint(key);
    const digit_signature = toDigitSignature(key);

    const matched_cluster = clusters.find((cluster) => {
      if (cluster.digit_signature !== digit_signature) return false;
      if (cluster.alpha_fingerprint === alpha_fingerprint) return true;
      const max_length = Math.max(cluster.alpha_fingerprint.length, alpha_fingerprint.length);
      const distance = levenshteinDistance(cluster.alpha_fingerprint, alpha_fingerprint);
      return distance <= maxEditDistanceFor(max_length);
    });

    if (matched_cluster) {
      canonical_key_by_raw_key.set(key, matched_cluster.canonical_key);
    } else {
      clusters.push({ canonical_key: key, alpha_fingerprint, digit_signature });
      canonical_key_by_raw_key.set(key, key);
    }
  }

  const result = new Map<string, ModelKeyLabelPair>();
  for (const [raw_key, canonical_key] of canonical_key_by_raw_key) {
    result.set(raw_key, {
      model_key: canonical_key,
      model_label: label_by_key.get(canonical_key) ?? canonical_key,
    });
  }
  return result;
}
