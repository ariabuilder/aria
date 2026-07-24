import { describe, expect, it } from "vitest";
import { isUserComponent } from "../../../../admin/features/Studio/components/lib/isUserComponent";

describe("isUserComponent", () => {
  it("returns false for aria source", () => {
    expect(
      isUserComponent({
        id: "x",
        name: "Aria",
        source: "aria",
        tier: "free",
        isLocked: false,
        updatedAt: null,
      }),
    ).toBe(false);
  });

  it("returns true for custom source", () => {
    expect(
      isUserComponent({
        id: "x",
        name: "Custom",
        source: "custom",
        tier: "free",
        isLocked: false,
        updatedAt: null,
      }),
    ).toBe(true);
  });
});
