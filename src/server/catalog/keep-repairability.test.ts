import { describe, expect, it } from "vitest";
import { resolveRepairabilityOnEnrich } from "./keep-repairability";

const previous = {
  repairability_score: 7.2,
  repairability_scale: 10,
  ifixit_device_name: "iPhone 13",
  ifixit_url: "https://ifixit.com/iphone-13",
};

describe("resolveRepairabilityOnEnrich", () => {
  it("takes a fresh iFixit match", () => {
    const next = resolveRepairabilityOnEnrich({
      previous,
      ifixit: {
        repairability_score: 4,
        repairability_scale: 10,
        device_name: "iPhone 13 Pro",
        device_url: "https://ifixit.com/iphone-13-pro",
      },
      stub: { repairability_score: 5, repairability_scale: 10 },
      stub_url: "https://ifixit.com/Search?query=x",
    });
    expect(next.repairability_score).toBe(4);
    expect(next.ifixit_device_name).toBe("iPhone 13 Pro");
  });

  it("keeps previous scores when iFixit is empty", () => {
    const next = resolveRepairabilityOnEnrich({
      previous,
      ifixit: {
        repairability_score: null,
        repairability_scale: null,
        device_name: null,
        device_url: null,
      },
      stub: { repairability_score: 5, repairability_scale: 10 },
      stub_url: "https://ifixit.com/Search?query=x",
    });
    expect(next).toEqual(previous);
  });

  it("keeps previous scores when lookup throws (ifixit=null)", () => {
    const next = resolveRepairabilityOnEnrich({
      previous,
      ifixit: null,
      stub: { repairability_score: 5, repairability_scale: 10 },
      stub_url: "https://ifixit.com/Search?query=x",
    });
    expect(next.repairability_score).toBe(7.2);
    expect(next.ifixit_url).toBe(previous.ifixit_url);
  });

  it("uses a brand stub only when there was no previous score", () => {
    const next = resolveRepairabilityOnEnrich({
      previous: {
        repairability_score: null,
        repairability_scale: null,
        ifixit_device_name: null,
        ifixit_url: null,
      },
      ifixit: null,
      stub: { repairability_score: 5.5, repairability_scale: 10 },
      stub_url: "https://ifixit.com/Search?query=x",
    });
    expect(next.repairability_score).toBe(5.5);
    expect(next.ifixit_url).toBe("https://ifixit.com/Search?query=x");
  });
});
