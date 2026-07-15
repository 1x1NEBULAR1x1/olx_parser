import styles from "./Pagination.module.scss";
import { useTranslations } from "next-intl";

interface PaginationProps {
  current_page: number;
  total_pages: number;
  page_size: number;
  page_size_options: readonly number[];
  onChange: (page: number) => void;
  onPageSizeChange: (page_size: number) => void;
}

// Максимум "видимых" номеров страниц вокруг текущей — остальные скрываются
// за "…", иначе при 50+ страницах пагинация превращается в нечитаемую полосу.
const SIBLING_COUNT = 1;

function buildPageList(current_page: number, total_pages: number): Array<number | "ellipsis"> {
  const pages: Array<number | "ellipsis"> = [];
  const range_start = Math.max(2, current_page - SIBLING_COUNT);
  const range_end = Math.min(total_pages - 1, current_page + SIBLING_COUNT);

  pages.push(1);
  if (range_start > 2) pages.push("ellipsis");
  for (let page = range_start; page <= range_end; page += 1) pages.push(page);
  if (range_end < total_pages - 1) pages.push("ellipsis");
  if (total_pages > 1) pages.push(total_pages);

  return pages;
}

export function Pagination({
  current_page,
  total_pages,
  page_size,
  page_size_options,
  onChange,
  onPageSizeChange,
}: PaginationProps) {
  const t = useTranslations("pagination");

  const pages = total_pages > 1 ? buildPageList(current_page, total_pages) : [];

  return (
    <div className={styles.pagination_wrap}>
      <label className={styles.pagination_size}>
        <span className={styles.pagination_size_label}>{t("page_size_label")}</span>
        <select
          className={styles.pagination_size_select}
          value={page_size}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label={t("page_size_label")}
        >
          {page_size_options.map((option) => (
            <option key={option} value={option}>
              {t("page_size_option", { count: option })}
            </option>
          ))}
        </select>
      </label>

      {total_pages > 1 && (
        <nav className={styles.pagination} aria-label={t("label")}>
          <button
            type="button"
            className={styles.pagination_btn}
            disabled={current_page === 1}
            onClick={() => onChange(current_page - 1)}
            aria-label={t("prev")}
          >
            ‹
          </button>

          {pages.map((page, index) =>
            page === "ellipsis" ? (
              <span key={`ellipsis-${index}`} className={styles.pagination_ellipsis}>…</span>
            ) : (
              <button
                key={page}
                type="button"
                className={[
                  styles.pagination_btn,
                  page === current_page ? styles.pagination_btn_active : "",
                ].join(" ")}
                onClick={() => onChange(page)}
                aria-current={page === current_page ? "page" : undefined}
              >
                {page}
              </button>
            ),
          )}

          <button
            type="button"
            className={styles.pagination_btn}
            disabled={current_page === total_pages}
            onClick={() => onChange(current_page + 1)}
            aria-label={t("next")}
          >
            ›
          </button>
        </nav>
      )}
    </div>
  );
}
