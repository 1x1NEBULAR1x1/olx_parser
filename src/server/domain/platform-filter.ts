export interface PlatformFilterSettings {
  exclude_iphone: boolean;
  exclude_android: boolean;
}

export function isIphoneListing(brand: string, title: string, model_key: string): boolean {
  if (brand === "apple") return true;
  const text = `${title} ${model_key}`.toLowerCase();
  return text.includes("iphone");
}

export function isAndroidListing(brand: string, title: string, model_key: string): boolean {
  if (brand === "apple" || brand === "unknown") return false;
  const text = `${title} ${model_key}`.toLowerCase();
  if (text.includes("iphone") || text.includes("ipad")) return false;
  return true;
}

export function isPlatformExcluded(
  brand: string,
  title: string,
  model_key: string,
  settings: PlatformFilterSettings,
): boolean {
  if (settings.exclude_iphone && isIphoneListing(brand, title, model_key)) return true;
  if (settings.exclude_android && isAndroidListing(brand, title, model_key)) return true;
  return false;
}
