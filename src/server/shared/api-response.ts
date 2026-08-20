import { NextResponse } from "next/server";
import type { ApiErrorCode } from "@/shared/lib/api-error";

export function jsonError(
  message: string,
  status: number,
  code?: ApiErrorCode,
  extra: Record<string, unknown> = {},
) {
  const resolved_code = code ?? (
    status === 401 ? "unauthorized"
      : status === 403 ? "forbidden"
        : status === 404 ? "not_found"
          : status === 400 ? "bad_request"
            : status === 409 ? "conflict"
              : status === 429 ? "rate_limited"
                : status >= 500 ? "server"
                  : "generic"
  );

  return NextResponse.json(
    { error: message, code: resolved_code, ...extra },
    { status },
  );
}
