import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/server/auth/auth-guards";
import { updateUserAccess } from "@/server/repositories/user-listings-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth_result = await requireAdminUser();
  if ("response" in auth_result) return auth_result.response;

  const { id } = await params;
  const body = await request.json() as { is_approved?: boolean; role?: string };

  if (body.is_approved === undefined && body.role === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (body.role !== undefined && !["user", "admin"].includes(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (id === auth_result.user.id && body.is_approved === false) {
    return NextResponse.json({ error: "Cannot revoke own access" }, { status: 400 });
  }

  try {
    const user = await updateUserAccess(id, {
      is_approved: body.is_approved,
      role: body.role,
    });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
}
