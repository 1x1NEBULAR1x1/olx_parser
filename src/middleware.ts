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

function getPublicOrigin(req: NextRequest): string {
  const from_env = process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  if (from_env && !from_env.includes("localhost") && !from_env.includes("127.0.0.1")) {
    return from_env;
  }

  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";

  if (host && !host.includes("localhost") && !host.startsWith("127.")) {
    return `${proto}://${host}`;
  }

  return from_env ?? "http://127.0.0.1:8080";
}

/** Редирект за nginx — Host из заголовков, не nextUrl (localhost:8080). */
function redirectTo(req: NextRequest, pathname: string): NextResponse {
  return NextResponse.redirect(new URL(pathname, `${getPublicOrigin(req)}/`));
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
      : redirectTo(req, "/login");
  }

  if (!token.is_approved && !pathname.startsWith("/pending")) {
    return is_api
      ? jsonError(403, "Access not approved")
      : redirectTo(req, "/pending");
  }

  if (pathname.startsWith("/admin") && token.role !== "admin") {
    return is_api
      ? jsonError(403, "Admin only")
      : redirectTo(req, "/");
  }

  if (pathname.startsWith("/login") && token.is_approved) {
    return redirectTo(req, "/");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
