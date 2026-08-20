export class AntibotBlockedError extends Error {
  readonly source: string;
  readonly http_status: number | null;

  constructor(source: string, http_status?: number) {
    super(`${source} antibot`);
    this.name = "AntibotBlockedError";
    this.source = source;
    this.http_status = http_status ?? null;
  }
}

export function isAntibotHttpStatus(status: number): boolean {
  return status === 403 || status === 429 || status === 503;
}

export function isAntibotHtml(html: string): boolean {
  const hay = html.toLowerCase();
  return (
    hay.includes("captcha-delivery.com")
    || hay.includes("datadome")
    || hay.includes("cf-challenge")
    || hay.includes("challenges.cloudflare.com")
    || hay.includes("pardon our interruption")
    || hay.includes("checking your browser")
    || hay.includes("are you a human")
    || hay.includes("robot or human")
    || (hay.includes("access denied") && hay.includes("incapsula"))
  );
}

export function isAntibotError(error: unknown): error is AntibotBlockedError {
  return error instanceof AntibotBlockedError;
}
