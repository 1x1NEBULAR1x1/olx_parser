export type ApiErrorCode =
  | "offline"
  | "network"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "bad_request"
  | "conflict"
  | "rate_limited"
  | "server"
  | "feed_unavailable"
  | "catalog_unavailable"
  | "scan_busy"
  | "scan_cooldown"
  | "generic";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code: ApiErrorCode = "generic",
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const STATUS_CODE_MAP: Record<number, ApiErrorCode> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  429: "rate_limited",
  503: "server",
};

const KNOWN_CODES = new Set<ApiErrorCode>([
  "offline",
  "network",
  "unauthorized",
  "forbidden",
  "not_found",
  "bad_request",
  "conflict",
  "rate_limited",
  "server",
  "feed_unavailable",
  "catalog_unavailable",
  "scan_busy",
  "scan_cooldown",
  "generic",
]);

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && KNOWN_CODES.has(value as ApiErrorCode);
}

function codeFromStatus(status: number): ApiErrorCode {
  if (STATUS_CODE_MAP[status]) return STATUS_CODE_MAP[status];
  if (status >= 500) return "server";
  return "generic";
}

export function resolveErrorCode(error: unknown): ApiErrorCode {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  if (error instanceof ApiRequestError) return error.code;
  if (error instanceof TypeError) return "network";
  return "generic";
}

export function getErrorCopy(
  error: unknown,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const code = resolveErrorCode(error);
  if (code === "scan_cooldown" && error instanceof ApiRequestError) {
    const sec = Number(error.details.cooldown_sec ?? 0);
    return t("scan_cooldown", { sec });
  }
  return t(code);
}

export async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (response.status === 499) {
    throw new ApiRequestError("Aborted", 499, "generic");
  }

  const body = await response.json().catch(() => null) as
    | (Record<string, unknown> & { error?: string; code?: string; message?: string })
    | null;

  if (response.ok) {
    return body as T;
  }

  const raw_code = body?.code;
  const code = isApiErrorCode(raw_code) ? raw_code : codeFromStatus(response.status);
  const message = (typeof body?.error === "string" && body.error)
    || (typeof body?.message === "string" && body.message)
    || `HTTP ${response.status}`;
  const details: Record<string, unknown> = {};
  if (body && typeof body.cooldown_sec === "number") {
    details.cooldown_sec = body.cooldown_sec;
  }
  if (body && body.is_scanning === true) {
    details.is_scanning = true;
  }

  throw new ApiRequestError(message, response.status, code, details);
}
