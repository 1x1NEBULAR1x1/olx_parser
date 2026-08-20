import { describe, expect, it } from "vitest";
import { detectDamageTypesFromText, extractBatteryHealthPercent } from "@/server/fetchers/olx-fetcher/fix-parser";
import { applyBatteryDamageThreshold } from "@/server/domain/user-device-view";
import { evaluateJunkStatus } from "@/server/domain/junk-filter";

describe("listing text heuristics", () => {
  it("does not flag Bateria 99% as battery damage", () => {
    const title = "Bateria 99% iPhone 17 Pro 256gb";
    expect(extractBatteryHealthPercent(title)).toBe(99);
    expect(detectDamageTypesFromText(title)).not.toContain("battery");
    expect(applyBatteryDamageThreshold(["battery"], 99, 80)).not.toContain("battery");
  });

  it("keeps screen damage when the seller says the display is cracked", () => {
    const text = "jedna ma mocniej uszkodzony ekran ale dotyk działa w drugiej delikatnie uszkodzone szkło ale wyświetlacz cały";
    const types = detectDamageTypesFromText(text);
    expect(types).toContain("screen");
  });

  it("does not treat a protected mint iPhone screen as damage", () => {
    const text = `
Wyjątkowy Phone 17 PRO z eSIM-only i 512GB pamięci wbudowanej.
Telefon nie posiada slotu karty SIM (tylko eSIM) - dlatego ma większą baterię.

Bardzo zadbany (zdjęcia tego nie oddają) - stan perfekcyjny, idealny, praktycznie jak nowy!

Model: A3522 MG8C4J/A
Bardzo zadbany
- ekran zabezpieczony 3mk 9H szkło hartowane
- kamery tylne zabezpieczone 3mk (AR+AF) - Anti-fog

W skład zestawu wchodzi:
- Telefon iPhone 17PRO 512 GB eSIM only
- Dodatkowe szkło hartowane 3mk i zabezpieczenie na kamery tylne
`;
    const types = detectDamageTypesFromText(text);
    expect(types).not.toContain("screen");
    expect(types).not.toContain("camera");
  });

  it("still flags a cracked screen even if a protector is mentioned", () => {
    const types = detectDamageTypesFromText(
      "iPhone 14, ekran pęknięty mimo szkła hartowanego 3mk, kamery całe",
    );
    expect(types).toContain("screen");
    expect(types).not.toContain("camera");
  });

  it("marks two-phone Motorola lots as junk", () => {
    const result = evaluateJunkStatus({
      title: "Do sprzedania dwie sztuki Motoroli edge 50 fusion",
      post_summary: "jedna ma mocniej uszkodzony ekran",
      brand: "motorola",
      model_key: "motorola edge 50 fusion",
      price_buy: 900,
      release_year: 2024,
    }, {
      exclude_junk_listings: true,
      junk_min_release_year: 2018,
    });
    expect(result.is_junk).toBe(true);
    expect(result.reason).toBe("lot_listing");
  });
});
