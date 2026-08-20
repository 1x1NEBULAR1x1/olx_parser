import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/server/auth/auth-options";
import { jsonError } from "@/server/shared/api-response";
import { prisma } from "@/shared/db/client";
import type { AuthUser } from "@/shared/types/next-auth";

type AuthSuccess = { user: AuthUser };
type AuthFailure = { response: NextResponse };

const E2E_USER_EMAIL = "e2e@localhost";

let cached_e2e_user: AuthUser | null = null;

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

function mapDbUser(user: {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  role: string;
  is_approved: boolean;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role,
    is_approved: user.is_approved,
  };
}

async function resolveE2eUser(): Promise<AuthUser> {
  if (cached_e2e_user) return cached_e2e_user;

  const existing = await prisma.user.findUnique({ where: { email: E2E_USER_EMAIL } });
  const user = existing ?? await prisma.user.create({
    data: {
      email: E2E_USER_EMAIL,
      name: "E2E",
      role: "admin",
      is_approved: true,
    },
  });

  cached_e2e_user = mapDbUser(user);
  return cached_e2e_user;
}

export async function getSessionUser(): Promise<AuthUser | null> {
  // Только локальный Playwright (`E2E_SKIP_AUTH` в playwright.config).
  if (process.env.E2E_SKIP_AUTH === "true") {
    return resolveE2eUser();
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return mapSessionUser(session.user);
}

export async function requireAuthUser(): Promise<AuthSuccess | AuthFailure> {
  const user = await getSessionUser();
  if (!user) {
    return { response: jsonError("Unauthorized", 401, "unauthorized") };
  }
  return { user };
}

export async function requireApprovedUser(): Promise<AuthSuccess | AuthFailure> {
  const auth_result = await requireAuthUser();
  if ("response" in auth_result) return auth_result;
  if (!auth_result.user.is_approved) {
    return { response: jsonError("Access not approved", 403, "forbidden") };
  }
  return auth_result;
}

export async function requireAdminUser(): Promise<AuthSuccess | AuthFailure> {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result;
  if (auth_result.user.role !== "admin") {
    return { response: jsonError("Admin only", 403, "forbidden") };
  }
  return auth_result;
}
