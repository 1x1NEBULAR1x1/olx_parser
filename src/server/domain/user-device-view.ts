import type { AllegroPart, AnalyzedDevice } from "@/shared/types/domain";
import type { UserDisplaySettingsData } from "@/server/repositories/user-display-settings-repository";
import { enrichDeviceProfitability } from "@/server/domain/profitability";

/**
 * Порог АКБ — персональная настройка: на этапе скана % только сохраняется,
 * а «неисправность батареи» определяется при отдаче ленты пользователю.
 */
export function applyBatteryDamageThreshold(
  damage_types: string[],
  battery_health_percent: number | null,
  threshold_percent: number,
): string[] {
  if (battery_health_percent === null || battery_health_percent >= threshold_percent) {
    return [...damage_types];
  }

  if (damage_types.includes("battery")) {
    return [...damage_types];
  }

  return [...damage_types, "battery"];
}

function filterPartsForDamageTypes(parts: AllegroPart[], damage_types: string[]): AllegroPart[] {
  const type_set = new Set(damage_types);
  return parts.filter((part) => !part.damage_type || type_set.has(part.damage_type));
}

export function applyUserDeviceView(
  device: AnalyzedDevice,
  display_settings: UserDisplaySettingsData,
): AnalyzedDevice {
  const effective_damage_types = applyBatteryDamageThreshold(
    device.damage_types,
    device.battery_health_percent,
    display_settings.battery_health_threshold_percent,
  );

  const filtered_parts = filterPartsForDamageTypes(device.allegro_parts, effective_damage_types);

  return enrichDeviceProfitability({
    ...device,
    damage_types: effective_damage_types,
    allegro_parts: filtered_parts,
  });
}
