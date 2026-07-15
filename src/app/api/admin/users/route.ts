import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/auth/auth-guards";
import { listUsersForAdmin } from "@/server/repositories/user-listings-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth_result = await requireAdminUser();
  if ("response" in auth_result) return auth_result.response;

  const users = await listUsersForAdmin();
  return NextResponse.json({ users });
}
