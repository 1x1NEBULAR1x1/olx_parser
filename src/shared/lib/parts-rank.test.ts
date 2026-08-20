import { describe, expect, it } from "vitest";
import { countRealParts, selectRankedParts } from "./parts-rank";
import type { AllegroPart } from "@/shared/types/domain";

function part(overrides: Partial<AllegroPart> & Pick<AllegroPart, "title" | "url">): AllegroPart {
  return {
    price: 100,
    currency: "PLN",
    image: null,
    damage_type: "screen",
    ...overrides,
  };
}

describe("selectRankedParts", () => {
  it("keeps at most 4 real parts per damage type and prefers Allegro over OLX", () => {
    const ranked = selectRankedParts([
      part({ title: "OLX cheap", url: "https://www.olx.pl/1", source: "olx", price: 40 }),
      part({ title: "Shop", url: "https://mobilepart.pl/1", source: "shop", price: 90 }),
      part({ title: "Ceneo", url: "https://www.ceneo.pl/1", source: "ceneo", price: 80 }),
      part({ title: "Allegro", url: "https://allegro.pl/1", source: "allegro", price: 110 }),
      part({ title: "OLX 2", url: "https://www.olx.pl/2", source: "olx", price: 50 }),
      part({ title: "Store", url: "https://parts-store.pl/1", source: "parts_store", price: 95 }),
    ]);

    expect(ranked.map((item) => item.source)).toEqual([
      "allegro",
      "ceneo",
      "shop",
      "parts_store",
    ]);
    expect(countRealParts(ranked)).toBe(4);
  });

  it("fills remaining slots with OLX only after shops", () => {
    const ranked = selectRankedParts([
      part({ title: "Allegro", url: "https://allegro.pl/1", source: "allegro", price: 120 }),
      part({ title: "OLX 1", url: "https://www.olx.pl/1", source: "olx", price: 40 }),
      part({ title: "OLX 2", url: "https://www.olx.pl/2", source: "olx", price: 45 }),
      part({ title: "OLX 3", url: "https://www.olx.pl/3", source: "olx", price: 50 }),
    ]);

    expect(ranked).toHaveLength(4);
    expect(ranked[0]?.source).toBe("allegro");
    expect(ranked.slice(1).every((item) => item.source === "olx")).toBe(true);
  });

  it("drops estimates when real parts exist and limits per damage type", () => {
    const ranked = selectRankedParts([
      part({ title: "★ Screen", url: "https://allegro.pl/search-screen", source: "estimate", is_estimate: true, price: 500 }),
      part({ title: "Real screen", url: "https://allegro.pl/offer-1", source: "allegro", damage_type: "screen", price: 200 }),
      part({ title: "Battery shop", url: "https://m9parts.pl/1", source: "shop", damage_type: "battery", price: 80 }),
      part({ title: "Battery olx", url: "https://www.olx.pl/b1", source: "olx", damage_type: "battery", price: 30 }),
      part({ title: "Battery olx 2", url: "https://www.olx.pl/b2", source: "olx", damage_type: "battery", price: 35 }),
      part({ title: "Battery olx 3", url: "https://www.olx.pl/b3", source: "olx", damage_type: "battery", price: 38 }),
      part({ title: "Battery olx 4", url: "https://www.olx.pl/b4", source: "olx", damage_type: "battery", price: 42 }),
    ]);

    const screens = ranked.filter((item) => item.damage_type === "screen");
    const batteries = ranked.filter((item) => item.damage_type === "battery");
    expect(screens).toHaveLength(1);
    expect(screens[0]?.title).toBe("Real screen");
    expect(batteries).toHaveLength(4);
    expect(batteries[0]?.source).toBe("shop");
  });

  it("dedupes by url", () => {
    const ranked = selectRankedParts([
      part({ title: "A", url: "https://allegro.pl/1", source: "allegro", price: 100 }),
      part({ title: "A copy", url: "https://allegro.pl/1", source: "allegro", price: 90 }),
    ]);
    expect(ranked).toHaveLength(1);
  });
});
