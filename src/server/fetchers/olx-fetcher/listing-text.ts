export function decodeHtmlEntities(input_text: string): string {
  return input_text
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

/** Полный текст объявления из GraphQL: HTML-переносы → обычный текст. */
export function sanitizeOlxDescription(raw: string | null | undefined): string {
  if (!raw) return "";
  return decodeHtmlEntities(raw)
    .replace(/<\s*br\s*\/?\s*>\s*/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<\s*p[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Дата регистрации продавца: ISO → YYYY-MM-DD, год оставляем как есть. */
export function formatOlxMemberSince(created: string | null | undefined): string | null {
  if (!created) return null;
  const trimmed = created.trim();
  if (!trimmed) return null;
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  const date_match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (date_match) return date_match[1];
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed;
  return new Date(parsed).toISOString().slice(0, 10);
}
