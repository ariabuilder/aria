import { describe, expect, it } from "vitest";
import {
  parseMediaGroupFilter,
  parseMediaTypeFilter,
  toMediaListPath,
  toMediaGroupNavFilter,
  getGroupIdFromNavFilter,
} from "../../../admin/features/Studio/media/lib/mediaRouteFilter";

describe("mediaRouteFilter", () => {
  it("parses group and type filters from route values", () => {
    expect(parseMediaGroupFilter("grp-abc")).toBe("grp-abc");
    expect(parseMediaGroupFilter(undefined)).toBeNull();
    expect(parseMediaTypeFilter("image")).toBe("image");
    expect(parseMediaTypeFilter("invalid")).toBe("all");
  });

  it("builds media list paths with orthogonal filter and group params", () => {
    expect(toMediaListPath({})).toBe("/media");
    expect(toMediaListPath({ filter: "image" })).toBe("/media?filter=image");
    expect(toMediaListPath({ group: "grp-abc" })).toBe("/media?group=grp-abc");
    expect(toMediaListPath({ filter: "image", group: "grp-abc" })).toBe(
      "/media?filter=image&group=grp-abc",
    );
  });

  it("maps nav filter keys for organizer rail state", () => {
    expect(toMediaGroupNavFilter(null)).toBe("all");
    expect(toMediaGroupNavFilter("grp-abc")).toBe("group:grp-abc");
    expect(getGroupIdFromNavFilter("group:grp-abc")).toBe("grp-abc");
    expect(getGroupIdFromNavFilter("all")).toBeNull();
  });
});
