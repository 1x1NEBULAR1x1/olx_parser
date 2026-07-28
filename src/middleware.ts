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

/** Редирект с учётом X-Forwarded-* за nginx (req.url = localhost:8080). */
function redirectTo(req: NextRequest, pathname: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = pathname;

  const forwarded_host = req.headers.get("x-forwarded-host");
  const forwarded_proto = req.headers.get("x-forwarded-proto");
  if (forwarded_host) {
    url.host = forwarded_host.split(",")[0]?.trim() ?? url.host;
  }
  if (forwarded_proto) {
    url.protocol = forwarded_proto.endsWith(":") ? forwarded_proto : `${forwarded_proto}:`;
  }

  return NextResponse.redirect(url);
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
