import { describe, expect, it } from "vitest";
import { normalizeExternalImageUrl, normalizeExternalImageUrls } from "./external-image";

describe("normalizeExternalImageUrl", () => {
  it("fills OLX size placeholders", () => {
    expect(
      normalizeExternalImageUrl("https://ireland.apollo.olxcdn.com/v1/files/abc/image;s={width}x{height}"),
    ).toBe("https://ireland.apollo.olxcdn.com/v1/files/abc/image;s=640x480");
  });

  it("fills encoded OLX size placeholders", () => {
    expect(
      normalizeExternalImageUrl("https://ireland.apollo.olxcdn.com/v1/files/abc/image;s=%7Bwidth%7Dx%7Bheight%7D"),
    ).toBe("https://ireland.apollo.olxcdn.com/v1/files/abc/image;s=640x480");
  });

  it("upgrades protocol-relative urls and drops data-uri placeholders", () => {
    expect(normalizeExternalImageUrl("//img.example.pl/a.jpg")).toBe("https://img.example.pl/a.jpg");
    expect(normalizeExternalImageUrl("data:image/svg+xml,%3Csvg%3E")).toBeNull();
    expect(normalizeExternalImageUrl("/relative.jpg")).toBeNull();
  });

  it("takes the first srcset candidate", () => {
    expect(
      normalizeExternalImageUrl("https://img.example.pl/a.jpg 250w, https://img.example.pl/b.jpg 500w"),
    ).toBe("https://img.example.pl/a.jpg");
  });
});

describe("normalizeExternalImageUrls", () => {
  it("drops empty and duplicate urls", () => {
    expect(normalizeExternalImageUrls([
      "https://cdn.olx.pl/a;s={width}x{height}",
      "https://cdn.olx.pl/a;s=640x480",
      null,
      "data:image/gif;base64,xx",
    ])).toEqual(["https://cdn.olx.pl/a;s=640x480"]);
  });
});
