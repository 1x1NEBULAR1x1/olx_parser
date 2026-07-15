import { prisma } from "@/shared/db/client";

export interface UserDisplaySettingsData {
  exclude_junk_listings: boolean;
  junk_min_release_year: number;
  exclude_iphone: boolean;
  exclude_android: boolean;
  battery_health_threshold_percent: number;
}

function toUserDisplaySettingsData(settings: {
  exclude_junk_listings: boolean;
  junk_min_release_year: number;
  exclude_iphone: boolean;
  exclude_android: boolean;
  battery_health_threshold_percent: number;
}): UserDisplaySettingsData {
  return {
    exclude_junk_listings: settings.exclude_junk_listings,
    junk_min_release_year: settings.junk_min_release_year,
    exclude_iphone: settings.exclude_iphone,
    exclude_android: settings.exclude_android,
    battery_health_threshold_percent: settings.battery_health_threshold_percent,
  };
}

export async function getUserDisplaySettings(user_id: string): Promise<UserDisplaySettingsData> {
  const settings = await prisma.userDisplaySettings.upsert({
    where: { user_id },
    update: {},
    create: { user_id },
  });
  return toUserDisplaySettingsData(settings);
}

export async function updateUserDisplaySettings(
  user_id: string,
  patch: Partial<UserDisplaySettingsData>,
): Promise<UserDisplaySettingsData> {
  const settings = await prisma.userDisplaySettings.upsert({
    where: { user_id },
    update: patch,
    create: { user_id, ...patch },
  });
  return toUserDisplaySettingsData(settings);
}
