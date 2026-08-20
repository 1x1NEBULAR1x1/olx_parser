import { describe, expect, it } from "vitest";
import { parseOlxListing } from "./parser";
import type { RawListing } from "./types";

describe("parseOlxListing", () => {
  it("sanitizes GraphQL description and seller fields", () => {
    const raw = {
      id: 908374142,
      title: "iPhone 11 Pro 256GB",
      url: "https://www.olx.pl/d/oferta/iphone-11-pro-256gb-CID99-IDZtrBQ.html",
      created_time: "2026-01-01T00:00:00+01:00",
      description: "Sprzedam.<br />Pudełko &amp; kabel.",
      user: { name: "Antek", created: "2022-08-09T13:52:27+02:00" },
      photos: [],
      params: [],
    } satisfies RawListing;

    const parsed = parseOlxListing(raw);
    expect(parsed.description).toBe("Sprzedam.\nPudełko & kabel.");
    expect(parsed.seller_name).toBe("Antek");
    expect(parsed.seller_member_since).toBe("2022-08-09");
  });

  it("normalizes OLX photo size placeholders", () => {
    const raw = {
      id: 1,
      title: "iPhone 13",
      url: "https://www.olx.pl/d/oferta/iphone-13-CID99-ID1.html",
      created_time: "2026-01-01T00:00:00+01:00",
      photos: [
        { link: "https://ireland.apollo.olxcdn.com/v1/files/abc/image;s={width}x{height}" },
        { link: "https://ireland.apollo.olxcdn.com/v1/files/abc/image;s=%7Bwidth%7Dx%7Bheight%7D" },
      ],
      params: [],
    } satisfies RawListing;

    expect(parseOlxListing(raw).photos).toEqual([
      "https://ireland.apollo.olxcdn.com/v1/files/abc/image;s=640x480",
    ]);
  });
});
