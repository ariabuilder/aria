import { describe, expect, it } from "vitest";

describe("useUtilityParser", () => {
  it("recognizes theme palette utilities without requiring a shade", async () => {
    const { useUtilityParser } =
      await import("../../admin/features/Design/composables/useUtilityParser");

    const { isValidUtility, parseUtility } = useUtilityParser();

    expect(isValidUtility("text-primary")).toBe(true);
    expect(parseUtility("text-primary")).toEqual(
      expect.objectContaining({
        property: "color",
        className: "text-primary",
        isShortcut: false,
      }),
    );
  });

  it("recognizes dynamically added palette names from the design system", async () => {
    const { designTokensState } =
      await import("../../admin/features/Design/composables/useDesignTokens");
    const { useUtilityParser } =
      await import("../../admin/features/Design/composables/useUtilityParser");

    (designTokensState.colors as Record<string, unknown>).neutral = {
      50: "#fafafa",
      100: "#f5f5f5",
      200: "#e5e5e5",
      300: "#d4d4d4",
      400: "#a3a3a3",
      500: "#737373",
      600: "#525252",
      700: "#404040",
      800: "#262626",
      900: "#171717",
      950: "#0a0a0a",
      DEFAULT: "#737373",
    };

    const { isValidUtility } = useUtilityParser();

    expect(isValidUtility("text-neutral")).toBe(true);
    expect(isValidUtility("text-neutral-500")).toBe(true);
  });

  it("recognizes negative spacing utilities", async () => {
    const { useUtilityParser } =
      await import("../../admin/features/Design/composables/useUtilityParser");

    const { isValidUtility, isLikelyUtilityClass, parseUtility } =
      useUtilityParser();

    expect(isValidUtility("-mt-4")).toBe(true);
    expect(isLikelyUtilityClass("-mt-4")).toBe(true);
    expect(parseUtility("-mt-4")).toEqual(
      expect.objectContaining({
        property: "margin-top",
        className: "-mt-4",
      }),
    );

    expect(parseUtility("-mt-4")?.value).toMatch(/^-/);
  });

  it("recognizes common utility-like legacy tokens used in primitive defaults", async () => {
    const { useUtilityParser } =
      await import("../../admin/features/Design/composables/useUtilityParser");

    const { isLikelyUtilityClass } = useUtilityParser();

    expect(isLikelyUtilityClass("text-3xl")).toBe(true);
    expect(isLikelyUtilityClass("font-semibold")).toBe(true);
    expect(isLikelyUtilityClass("text-white")).toBe(true);
    expect(isLikelyUtilityClass("rounded-lg")).toBe(true);
    expect(isLikelyUtilityClass("hover:bg-cyan-500")).toBe(true);
    expect(isLikelyUtilityClass("group")).toBe(true);
    expect(isLikelyUtilityClass("peer")).toBe(true);
  });
});
