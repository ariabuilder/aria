import { describe, expect, it } from "vitest";
import {
  CustomPseudoStateSchema,
  InspectorPseudoStateSchema,
  PSEUDO_PRESET_DEFINITIONS,
  PseudoPresetIdSchema,
  PseudoStateSchema,
  formatPseudoStateLabel,
  getPseudoSelectorSuffix,
  parseCustomPseudoInput,
} from "../../lib/styles/pseudoSelectors";

describe("pseudoSelectors", () => {
  it("defines a suffix for every preset", () => {
    for (const definition of PSEUDO_PRESET_DEFINITIONS) {
      expect(getPseudoSelectorSuffix(definition.id)).toBe(definition.suffix);
      expect(formatPseudoStateLabel(definition.id)).toBe(definition.suffix);
    }
  });

  it("generates relational :has suffixes", () => {
    expect(getPseudoSelectorSuffix("has-any-child")).toBe(":has(> *)");
    expect(getPseudoSelectorSuffix("has-child")).toBe(":has(*)");
  });

  it("accepts valid custom encoded pseudo states", () => {
    const state = "custom:has(.icon)";
    expect(CustomPseudoStateSchema.parse(state)).toBe(state);
    expect(PseudoStateSchema.parse(state)).toBe(state);
    expect(getPseudoSelectorSuffix(state)).toBe(":has(.icon)");
    expect(formatPseudoStateLabel(state)).toBe(":has(.icon)");
  });

  it("rejects invalid custom pseudo states", () => {
    expect(PseudoStateSchema.safeParse("custom:hover").success).toBe(false);
    expect(PseudoStateSchema.safeParse("has(.icon)").success).toBe(false);
    expect(PseudoStateSchema.safeParse("custom:has(.icon;bad)").success).toBe(
      false,
    );
  });

  it("parses custom user input into encoded pseudo states", () => {
    const parsed = parseCustomPseudoInput(":has(.icon)");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toBe("custom:has(.icon)");
    }

    const notParsed = parseCustomPseudoInput("not(:disabled)");
    expect(notParsed.success).toBe(true);
    if (notParsed.success) {
      expect(notParsed.data).toBe("custom:not(:disabled)");
    }
  });

  it("rejects malformed custom user input", () => {
    expect(parseCustomPseudoInput("hover").success).toBe(false);
    expect(parseCustomPseudoInput("").success).toBe(false);
  });

  it("accepts inspector pseudo states including default", () => {
    expect(InspectorPseudoStateSchema.parse("default")).toBe("default");
    expect(InspectorPseudoStateSchema.parse("hover")).toBe("hover");
    expect(InspectorPseudoStateSchema.parse("custom:has(.icon)")).toBe(
      "custom:has(.icon)",
    );
  });

  it("keeps preset ids aligned with the enum", () => {
    for (const definition of PSEUDO_PRESET_DEFINITIONS) {
      expect(PseudoPresetIdSchema.parse(definition.id)).toBe(definition.id);
    }
  });
});
