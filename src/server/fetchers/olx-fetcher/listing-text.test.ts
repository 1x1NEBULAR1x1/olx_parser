import { describe, expect, it } from "vitest";
import {
  formatOlxMemberSince,
  sanitizeOlxDescription,
} from "./listing-text";

describe("sanitizeOlxDescription", () => {
  it("converts br tags and strips other HTML", () => {
    const raw = "Sprzedam iPhone.<br />\nW zestawie pudełko &amp; kabel.<br />Cena do negocjacji.";
    expect(sanitizeOlxDescription(raw)).toBe(
      "Sprzedam iPhone.\nW zestawie pudełko & kabel.\nCena do negocjacji.",
    );
  });

  it("returns empty string for missing input", () => {
    expect(sanitizeOlxDescription(null)).toBe("");
    expect(sanitizeOlxDescription(undefined)).toBe("");
  });
});

describe("formatOlxMemberSince", () => {
  it("keeps the calendar date from an ISO timestamp", () => {
    expect(formatOlxMemberSince("2022-08-09T13:52:27+02:00")).toBe("2022-08-09");
  });

  it("keeps a bare year", () => {
    expect(formatOlxMemberSince("2022")).toBe("2022");
  });
});
