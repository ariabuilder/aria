import { describe, expect, it } from "vitest";

import {
  buildRuntimeShortcutSafelist,
  collectVariantUtilitiesFromShortcuts,
  RUNTIME_SAFE_CONTAINER_SHORTCUT,
} from "../../lib/styles/unoRuntimeDefaults";

describe("unoRuntimeDefaults", () => {
  it("collects variant utilities from shortcut values", () => {
    expect(
      collectVariantUtilitiesFromShortcuts({
        container: "w-full mx-auto px-4 sm:px-6 lg:px-8",
        "heading-1": "heading text-4xl lg:text-5xl",
        card: "rounded-lg border",
      }),
    ).toEqual(expect.arrayContaining(["sm:px-6", "lg:px-8", "lg:text-5xl"]));
  });

  it("deduplicates variant utilities", () => {
    const result = collectVariantUtilitiesFromShortcuts({
      a: "sm:px-6 lg:px-8",
      b: "sm:px-6",
    });
    expect(result.filter((u) => u === "sm:px-6")).toHaveLength(1);
  });

  it("buildRuntimeShortcutSafelist includes preset-wind container deps", () => {
    const safelist = buildRuntimeShortcutSafelist({});
    expect(safelist).toEqual(
      expect.arrayContaining(["sm:px-6", "lg:px-8"]),
    );
  });

  it("RUNTIME_SAFE_CONTAINER_SHORTCUT has no responsive padding variants", () => {
    expect(RUNTIME_SAFE_CONTAINER_SHORTCUT).not.toMatch(/\b(sm|lg):/);
  });
});
