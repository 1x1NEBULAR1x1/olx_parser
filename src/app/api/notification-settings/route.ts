import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import {
  getNotificationSettings, updateNotificationSettings, type NotificationSettingsData,
} from "@/server/repositories/devices-repository";
import { config } from "@/server/shared/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const settings = await getNotificationSettings();
  return NextResponse.json({
    ...settings,
    telegram_configured: Boolean(config.telegram.bot_token && config.telegram.chat_id),
  });
}

interface NotificationSettingsPatchBody {
  enabled?: unknown;
  brands?: unknown;
  model_keys?: unknown;
  min_profitability_pct?: unknown;
  max_profitability_pct?: unknown;
  min_price?: unknown;
  max_price?: unknown;
  regions?: unknown;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

export async function PATCH(request: Request) {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const body = (await request.json().catch(() => null)) as NotificationSettingsPatchBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Partial<NotificationSettingsData> = {};

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }
    patch.enabled = body.enabled;
  }

  if (body.brands !== undefined) {
    if (!isStringArray(body.brands)) {
      return NextResponse.json({ error: "brands must be a string array" }, { status: 400 });
    }
    patch.brands = body.brands;
  }

  if (body.model_keys !== undefined) {
    if (!isStringArray(body.model_keys)) {
      return NextResponse.json({ error: "model_keys must be a string array" }, { status: 400 });
    }
    patch.model_keys = body.model_keys;
  }

  if (body.regions !== undefined) {
    if (!isStringArray(body.regions)) {
      return NextResponse.json({ error: "regions must be a string array" }, { status: 400 });
    }
    patch.regions = body.regions;
  }

  for (const key of ["min_profitability_pct", "max_profitability_pct", "min_price", "max_price"] as const) {
    if (body[key] !== undefined) {
      if (!isNullableNumber(body[key])) {
        return NextResponse.json({ error: `${key} must be a number or null` }, { status: 400 });
      }
      patch[key] = body[key];
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No known settings fields provided" }, { status: 400 });
  }

  const settings = await updateNotificationSettings(patch);
  return NextResponse.json(settings);
}
