export type ThemeChoice = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "smartflip-theme";

export function resolveEffectiveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return choice;
}

export function applyTheme(choice: ThemeChoice): void {
  const effective = resolveEffectiveTheme(choice);
  document.documentElement.classList.toggle("dark", effective === "dark");
}

/**
 * Инлайн-скрипт (строка, не импортируется — вставляется в <head> ДО
 * гидратации React в layout.tsx) — читает localStorage/системную тему и
 * ставит класс `dark` на <html> синхронно, чтобы избежать мигания светлой
 * темой при загрузке (FOUC). Логика продублирована как строка (не может
 * импортировать resolveEffectiveTheme/THEME_STORAGE_KEY — inline-скрипт
 * исполняется до загрузки любых бандлов), но значения ключа/дефолта берутся
 * из тех же констант, чтобы не разойтись при будущих правках.
 */
export function buildAntiFoucScript(): string {
  return `
    (function () {
      try {
        var choice = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) || "system";
        var isDark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        if (isDark) document.documentElement.classList.add("dark");
      } catch (e) {}
    })();
  `;
}
