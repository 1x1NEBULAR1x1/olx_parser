import { describe, expect, it } from "vitest";
import {
  buildCatalogCursor,
  calculateCatalogPercent,
  displayProcessedModels,
  parseCatalogProgressSnapshot,
} from "./catalog-progress";

describe("calculateCatalogPercent", () => {
  it("учитывает текущий набор, чтобы 0/434 не залипал на 0%", () => {
    expect(calculateCatalogPercent({
      is_running: true,
      processed_models: 0,
      total_models: 434,
      current_set_index: 4,
      current_set_total: 10,
    })).toBe(1);
  });

  it("после завершения всех моделей даёт 100%", () => {
    expect(calculateCatalogPercent({
      is_running: false,
      processed_models: 434,
      total_models: 434,
      current_set_index: null,
      current_set_total: null,
    })).toBe(100);
  });
});

describe("displayProcessedModels", () => {
  it("показывает текущую модель, а не 0 пока первая ещё идёт", () => {
    expect(displayProcessedModels({
      is_running: true,
      processed_models: 0,
      total_models: 434,
      has_current: true,
    })).toBe(1);
  });
});

describe("catalog cursor / snapshot", () => {
  it("меняет cursor при смене набора", () => {
    const first = buildCatalogCursor({
      is_running: true,
      run_id: "abc",
      processed_models: 0,
      current_entry_id: 12,
      current_stage: "parts",
      current_source: "allegro",
      current_set_index: 1,
      wait_until_ms: null,
      manual_jobs: [],
    });
    const second = buildCatalogCursor({
      is_running: true,
      run_id: "abc",
      processed_models: 0,
      current_entry_id: 12,
      current_stage: "parts",
      current_source: "allegro",
      current_set_index: 2,
      wait_until_ms: null,
      manual_jobs: [],
    });
    expect(first).not.toBe(second);
  });

  it("читает snapshot из JSON", () => {
    const snapshot = parseCatalogProgressSnapshot(JSON.stringify({
      is_running: true,
      run_id: "r1",
      processed_models: 3,
      total_models: 10,
      current_entry_id: 5,
      current_brand: "apple",
      current_model_label: "iPhone 13",
      current_stage: "parts",
      current_set_index: 2,
      current_set_total: 10,
      manual_jobs: [],
    }));
    expect(snapshot?.processed_models).toBe(3);
    expect(snapshot?.current_model_label).toBe("iPhone 13");
  });
});
