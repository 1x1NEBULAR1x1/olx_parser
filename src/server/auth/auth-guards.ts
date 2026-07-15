import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/server/auth/auth-options";
import type { AuthUser } from "@/shared/types/next-auth";

type AuthSuccess = { user: AuthUser };
type AuthFailure = { response: NextResponse };

function mapSessionUser(session_user: Session["user"]): AuthUser {
  return {
    id: session_user.id,
    email: session_user.email,
    name: session_user.name,
    image: session_user.image,
    role: session_user.role ?? "user",
    is_approved: Boolean(session_user.is_approved),
  };
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return mapSessionUser(session.user);
}

export async function requireAuthUser(): Promise<AuthSuccess | AuthFailure> {
  const user = await getSessionUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user };
}

export async function requireApprovedUser(): Promise<AuthSuccess | AuthFailure> {
  const auth_result = await requireAuthUser();
  if ("response" in auth_result) return auth_result;
  if (!auth_result.user.is_approved) {
    return { response: NextResponse.json({ error: "Access not approved" }, { status: 403 }) };
  }
  return auth_result;
}

export async function requireAdminUser(): Promise<AuthSuccess | AuthFailure> {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result;
  if (auth_result.user.role !== "admin") {
    return { response: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }
  return auth_result;
}
