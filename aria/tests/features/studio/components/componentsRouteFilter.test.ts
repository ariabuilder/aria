import { describe, expect, it } from "vitest";
import {
  getGroupIdFromFilter,
  parseComponentsRouteFilter,
  toComponentsListPath,
  toGroupRouteFilter,
} from "../../../../admin/features/Studio/components/lib/componentsRouteFilter";

describe("componentsRouteFilter", () => {
  it("parses builtin and group filters", () => {
    expect(parseComponentsRouteFilter(undefined)).toBe("all");
    expect(parseComponentsRouteFilter("pro")).toBe("all");
    expect(parseComponentsRouteFilter("free")).toBe("all");
    expect(parseComponentsRouteFilter("group:grp-abc")).toBe("group:grp-abc");
    expect(parseComponentsRouteFilter("invalid")).toBe("all");
  });

  it("builds list paths", () => {
    expect(toComponentsListPath("all")).toBe("/components");
    expect(toComponentsListPath("locked")).toBe("/components?filter=locked");
    expect(toComponentsListPath(toGroupRouteFilter("grp-1"))).toBe(
      "/components?filter=group%3Agrp-1",
    );
  });

  it("extracts group id from filter", () => {
    expect(getGroupIdFromFilter("all")).toBeNull();
    expect(getGroupIdFromFilter("group:grp-1")).toBe("grp-1");
  });
});
