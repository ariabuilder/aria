import { describe, expect, it } from "vitest";

describe("useAutocomplete", () => {
  it("suggests theme color utilities from the current design tokens", async () => {
    const { useAutocomplete } =
      await import("../../admin/features/Inspector/composables/useAutocomplete");

    const autocomplete = useAutocomplete();
    await autocomplete.search("text-primary");

    expect(
      autocomplete.suggestions.value.some(
        (suggestion) => suggestion.value === "text-primary",
      ),
    ).toBe(true);
  });

  it("suggests dynamically added custom palette names", async () => {
    const { designTokensState } =
      await import("../../admin/features/Design/composables/useDesignTokens");
    const { useAutocomplete } =
      await import("../../admin/features/Inspector/composables/useAutocomplete");

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

    const autocomplete = useAutocomplete();
    await autocomplete.search("text-neutral");

    expect(
      autocomplete.suggestions.value.some(
        (suggestion) => suggestion.value === "text-neutral",
      ),
    ).toBe(true);
  });
});
