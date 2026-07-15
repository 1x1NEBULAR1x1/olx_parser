#!/usr/bin/env node
/**
 * Одноразовая миграция на FSD: перенос файлов + переписывание импортов.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");

const MOVES = [
  ["components/CheckboxGroup", "shared/ui/checkbox-group"],
  ["components/RangeSlider", "shared/ui/range-slider"],
  ["components/Pagination", "shared/ui/pagination"],
  ["components/StatBar", "shared/ui/stat-bar"],
  ["components/DamageTag", "entities/device/ui/damage-tag"],
  ["components/PhotoGallery", "entities/device/ui/photo-gallery"],
  ["components/DeviceCard", "entities/device/ui/device-card"],
  ["components/ScanBanner", "features/scan-control/ui/scan-banner"],
  ["components/HeaderActions", "widgets/header/ui/header-actions"],
  ["components/AdminShell", "widgets/admin-shell/ui/admin-shell"],
  ["components/NotificationBell", "features/notifications/ui/notification-bell"],
  ["components/PreferencesMenu", "features/preferences/ui/preferences-menu"],
  ["components/ThemeSwitcher", "features/preferences/ui/theme-switcher"],
  ["components/LanguageSwitcher", "features/preferences/ui/language-switcher"],
  ["components/UserMenu", "features/auth/ui/user-menu"],
  ["components/AuthProvider", "shared/providers/auth-provider"],
  ["components/MuiProvider", "shared/providers/mui-provider"],
  ["components/ThemeInit", "shared/providers/theme-init"],
  ["hooks/useDevicesFeed.ts", "features/scan-control/lib/useDevicesFeed.ts"],
  ["hooks/useUnreadNotificationsCount.ts", "features/notifications/lib/useUnreadNotificationsCount.ts"],
  ["store/filters-store.ts", "features/device-filter/model/filters-store.ts"],
  ["store/scroll-store.ts", "features/feed-scroll/model/scroll-store.ts"],
  ["lib/api.ts", "shared/api/client.ts"],
  ["lib/theme.ts", "shared/lib/theme.ts"],
  ["lib/listing-flags.ts", "shared/lib/listing-flags.ts"],
  ["lib/part-utils.ts", "shared/lib/part-utils.ts"],
  ["lib/recommendedRepairScore.ts", "entities/device/lib/recommended-repair-score.ts"],
  ["lib/auth-options.ts", "server/auth/auth-options.ts"],
  ["lib/intl/locales", "shared/config/i18n/locales"],
  ["i18n/config.ts", "shared/config/i18n/config.ts"],
  ["i18n/request.ts", "shared/config/i18n/request.ts"],
  ["db/client.ts", "shared/db/client.ts"],
  ["types/next-auth.d.ts", "shared/types/next-auth.d.ts"],
  ["server/auth-guards.ts", "server/auth/auth-guards.ts"],
  ["components/FilterBar/FilterBar.tsx", "features/device-filter/ui/filter-bar/FilterBar.tsx"],
  ["components/FilterBar/FilterBar.module.scss", "features/device-filter/ui/filter-bar/FilterBar.module.scss"],
  ["components/FilterBar/BrandTreeFilter.tsx", "features/device-filter/ui/brand-tree-filter/BrandTreeFilter.tsx"],
  ["app/devices/[id]/page.module.scss", "pages/device-detail/ui/DeviceDetailPage.module.scss"],
  ["app/notifications/page.module.scss", "pages/notifications/ui/NotificationsPage.module.scss"],
];

const IMPORT_REPLACEMENTS = [
  ["@/components/FilterBar/BrandTreeFilter", "@/features/device-filter/ui/brand-tree-filter/BrandTreeFilter"],
  ["@/components/FilterBar/FilterBar", "@/features/device-filter/ui/filter-bar/FilterBar"],
  ["@/components/DeviceCard/DeviceCard", "@/entities/device/ui/device-card/DeviceCard"],
  ["@/components/DamageTag/DamageTag", "@/entities/device/ui/damage-tag/DamageTag"],
  ["@/components/PhotoGallery/PhotoGallery", "@/entities/device/ui/photo-gallery/PhotoGallery"],
  ["@/components/CheckboxGroup/CheckboxGroup", "@/shared/ui/checkbox-group/CheckboxGroup"],
  ["@/components/RangeSlider/RangeSlider", "@/shared/ui/range-slider/RangeSlider"],
  ["@/components/Pagination/Pagination", "@/shared/ui/pagination/Pagination"],
  ["@/components/StatBar/StatBar", "@/shared/ui/stat-bar/StatBar"],
  ["@/components/ScanBanner/ScanBanner", "@/features/scan-control/ui/scan-banner/ScanBanner"],
  ["@/components/HeaderActions/HeaderActions", "@/widgets/header/ui/header-actions/HeaderActions"],
  ["@/components/AdminShell/AdminShell", "@/widgets/admin-shell/ui/admin-shell/AdminShell"],
  ["@/components/NotificationBell/NotificationBell", "@/features/notifications/ui/notification-bell/NotificationBell"],
  ["@/components/PreferencesMenu/PreferencesMenu", "@/features/preferences/ui/preferences-menu/PreferencesMenu"],
  ["@/components/ThemeSwitcher/ThemeSwitcher", "@/features/preferences/ui/theme-switcher/ThemeSwitcher"],
  ["@/components/LanguageSwitcher/LanguageSwitcher", "@/features/preferences/ui/language-switcher/LanguageSwitcher"],
  ["@/components/UserMenu/UserMenu", "@/features/auth/ui/user-menu/UserMenu"],
  ["@/components/AuthProvider/AuthProvider", "@/shared/providers/auth-provider/AuthProvider"],
  ["@/components/MuiProvider/MuiProvider", "@/shared/providers/mui-provider/MuiProvider"],
  ["@/components/ThemeInit/ThemeInit", "@/shared/providers/theme-init/ThemeInit"],
  ["@/hooks/useDevicesFeed", "@/features/scan-control/lib/useDevicesFeed"],
  ["@/hooks/useUnreadNotificationsCount", "@/features/notifications/lib/useUnreadNotificationsCount"],
  ["@/store/filters-store", "@/features/device-filter/model/filters-store"],
  ["@/store/scroll-store", "@/features/feed-scroll/model/scroll-store"],
  ["@/lib/recommendedRepairScore", "@/entities/device/lib/recommended-repair-score"],
  ["@/lib/part-utils", "@/shared/lib/part-utils"],
  ["@/lib/listing-flags", "@/shared/lib/listing-flags"],
  ["@/lib/theme", "@/shared/lib/theme"],
  ["@/lib/auth-options", "@/server/auth/auth-options"],
  ["@/lib/api", "@/shared/api/client"],
  ["@/i18n/config", "@/shared/config/i18n/config"],
  ["@/i18n/request", "@/shared/config/i18n/request"],
  ["@/db/client", "@/shared/db/client"],
  ["@/server/auth-guards", "@/server/auth/auth-guards"],
  ["@/server/model-line-extractor", "@/shared/lib/model-line-sort-key"],
  ["../lib/intl/locales/", "@/shared/config/i18n/locales/"],
];

function ensureDir(file_path) {
  fs.mkdirSync(path.dirname(file_path), { recursive: true });
}

function moveEntry(rel_from, rel_to) {
  const from = path.join(SRC, rel_from);
  const to = path.join(SRC, rel_to);
  if (!fs.existsSync(from)) {
    console.warn(`skip (missing): ${rel_from}`);
    return;
  }
  ensureDir(to);
  fs.renameSync(from, to);
  console.log(`moved: ${rel_from} -> ${rel_to}`);
}

function walk(dir, callback) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, callback);
    } else if (/\.(ts|tsx|scss|mjs)$/.test(entry.name)) {
      callback(full);
    }
  }
}

function rewriteImports() {
  let changed = 0;
  walk(SRC, (file_path) => {
    let content = fs.readFileSync(file_path, "utf8");
    let updated = content;
    for (const [from, to] of IMPORT_REPLACEMENTS) {
      updated = updated.split(from).join(to);
    }
    if (updated !== content) {
      fs.writeFileSync(file_path, updated);
      changed += 1;
    }
  });
  console.log(`rewrote imports in ${changed} files`);
}

function removeEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirs(path.join(dir, entry.name));
  }
  if (dir === SRC) return;
  if (fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
    console.log(`removed empty: ${path.relative(ROOT, dir)}`);
  }
}

for (const [from, to] of MOVES) {
  moveEntry(from, to);
}

rewriteImports();

// legacy stubs for next-intl default path
ensureDir(path.join(SRC, "i18n"));
fs.writeFileSync(
  path.join(SRC, "i18n/request.ts"),
  'export { default } from "@/shared/config/i18n/request";\n',
);
fs.writeFileSync(
  path.join(SRC, "i18n/config.ts"),
  'export * from "@/shared/config/i18n/config";\n',
);

removeEmptyDirs(path.join(SRC, "components"));
removeEmptyDirs(path.join(SRC, "hooks"));
removeEmptyDirs(path.join(SRC, "store"));
removeEmptyDirs(path.join(SRC, "lib"));
removeEmptyDirs(path.join(SRC, "db"));
removeEmptyDirs(path.join(SRC, "types"));

console.log("FSD migration done.");
