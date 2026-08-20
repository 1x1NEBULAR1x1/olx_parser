import { describe, expect, it } from "vitest";
import { AntibotBlockedError, isAntibotError, isAntibotHtml, isAntibotHttpStatus } from "./antibot";

describe("antibot detection", () => {
  it("marks DataDome and Cloudflare challenge pages", () => {
    expect(isAntibotHtml("<script src=\"https://captcha-delivery.com/captcha\"></script>")).toBe(true);
    expect(isAntibotHtml("cf-challenge checking your browser")).toBe(true);
    expect(isAntibotHtml("<html><body>iPhone 15 screen 199 zl</body></html>")).toBe(false);
  });

  it("treats 403/429/503 as antibot HTTP", () => {
    expect(isAntibotHttpStatus(403)).toBe(true);
    expect(isAntibotHttpStatus(429)).toBe(true);
    expect(isAntibotHttpStatus(200)).toBe(false);
  });

  it("narrows AntibotBlockedError", () => {
    expect(isAntibotError(new AntibotBlockedError("allegro", 403))).toBe(true);
    expect(isAntibotError(new Error("timeout"))).toBe(false);
  });
});
