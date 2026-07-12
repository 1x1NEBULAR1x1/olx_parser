import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/health"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Только для локальных Playwright-тестов (E2E_SKIP_AUTH задаётся в playwright.config).
  if (process.env.E2E_SKIP_AUTH === "true") {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  const is_api = pathname.startsWith("/api/");

  if (!token) {
    return is_api
      ? jsonError(401, "Unauthorized")
      : NextResponse.redirect(new URL("/login", req.url));
  }

  if (!token.is_approved && !pathname.startsWith("/pending")) {
    return is_api
      ? jsonError(403, "Access not approved")
      : NextResponse.redirect(new URL("/pending", req.url));
  }

  if (pathname.startsWith("/admin") && token.role !== "admin") {
    return is_api
      ? jsonError(403, "Admin only")
      : NextResponse.redirect(new URL("/", req.url));
  }

  if (pathname.startsWith("/login") && token.is_approved) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
