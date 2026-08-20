import { describe, expect, it } from "vitest";
import {
  catalogDeviceHref,
  catalogListHref,
  parseCatalogListQuery,
} from "./catalog-list-query";

describe("catalog list query", () => {
  it("parses page, limit and filters from the URL", () => {
    const query = parseCatalogListQuery(new URLSearchParams(
      "page=3&limit=50&search=iphone&brand=apple&model_line=iphone&status=ready",
    ));
    expect(query).toEqual({
      page: 3,
      page_size: 50,
      search: "iphone",
      brand: "apple",
      model_line: "iphone",
      status: "ready",
    });
  });

  it("omits default page and page size from the list href", () => {
    expect(catalogListHref({
      page: 1,
      page_size: 30,
      search: "",
      brand: "",
      model_line: "",
      status: "",
    })).toBe("/admin/catalog");
    expect(catalogListHref({
      page: 2,
      page_size: 50,
      search: "pixel",
      brand: "google",
      model_line: "",
      status: "",
    })).toBe("/admin/catalog?page=2&limit=50&search=pixel&brand=google");
  });

  it("keeps the same query when opening a model", () => {
    expect(catalogDeviceHref(42, {
      page: 2,
      page_size: 30,
      search: "",
      brand: "apple",
      model_line: "",
      status: "pending",
    })).toBe("/admin/catalog/42?page=2&brand=apple&status=pending");
  });
});
