import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import {
  addFavorite,
  getUserListingIds,
  hideDevice,
  removeFavorite,
  unhideDevice,
} from "@/server/repositories/user-listings-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const listing_ids = await getUserListingIds(auth_result.user.id);
  return NextResponse.json(listing_ids);
}

export async function POST(request: NextRequest) {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const body = await request.json() as { device_id?: number; action?: string };
  const device_id = Number(body.device_id);
  const action = body.action;

  if (!Number.isFinite(device_id) || device_id <= 0) {
    return NextResponse.json({ error: "Invalid device_id" }, { status: 400 });
  }

  const user_id = auth_result.user.id;

  switch (action) {
    case "favorite":
      await addFavorite(user_id, device_id);
      break;
    case "unfavorite":
      await removeFavorite(user_id, device_id);
      break;
    case "hide":
      await hideDevice(user_id, device_id);
      break;
    case "unhide":
      await unhideDevice(user_id, device_id);
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const listing_ids = await getUserListingIds(user_id);
  return NextResponse.json(listing_ids);
}
