import { describe, expect, it } from "vitest";

import { getIconMediaUrl } from "../../lib/icons/mediaIcon";

describe("getIconMediaUrl", () => {
  it("accepts absolute and site-relative media URLs", () => {
    expect(getIconMediaUrl("https://cdn.example.com/icon.svg")).toBe(
      "https://cdn.example.com/icon.svg",
    );
    expect(getIconMediaUrl("/uploads/icon.svg")).toBe("/uploads/icon.svg");
  });

  it("rejects icon class values and empty strings", () => {
    expect(getIconMediaUrl("i-lucide:star")).toBeNull();
    expect(getIconMediaUrl("")).toBeNull();
  });
});
