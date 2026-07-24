import { describe, expect, it } from "vitest";

import {
  buildOpacityVariableReferenceOptions,
  isOpacityCompatibleVariableKey,
  resolveVariableDefinitionCategory,
} from "../../admin/lib/variableReferences";
import type { GlobalStyleVariables } from "../../lib/styles/universalDesignSystem";

function createTestVariables(): GlobalStyleVariables {
  return {
    custom: {
      "opacity-muted": {
        label: "Opacity Muted",
        value: "0.5",
        category: "effects",
      },
      "brand-primary": {
        label: "Brand Primary",
        value: "#10b981",
        category: "color",
      },
      "spacing-md": {
        label: "Spacing Md",
        value: "1rem",
        category: "spacing",
      },
    },
    aliases: {
      "opacity-alias": {
        label: "Opacity Alias",
        sourceType: "custom",
        sourceKey: "opacity-muted",
      },
      "color-alias": {
        label: "Color Alias",
        sourceType: "custom",
        sourceKey: "brand-primary",
      },
      "token-alias": {
        label: "Token Alias",
        sourceType: "token",
        sourceKey: "colors.primary",
      },
    },
  };
}

describe("opacity variable references", () => {
  const variables = createTestVariables();

  it("resolves custom variable categories", () => {
    expect(resolveVariableDefinitionCategory("opacity-muted", variables)).toBe(
      "effects",
    );
    expect(resolveVariableDefinitionCategory("brand-primary", variables)).toBe(
      "color",
    );
  });

  it("resolves alias chains to the underlying custom category", () => {
    expect(resolveVariableDefinitionCategory("opacity-alias", variables)).toBe(
      "effects",
    );
    expect(resolveVariableDefinitionCategory("color-alias", variables)).toBe(
      "color",
    );
    expect(resolveVariableDefinitionCategory("token-alias", variables)).toBe(
      null,
    );
  });

  it("treats only effects variables as opacity-compatible", () => {
    expect(isOpacityCompatibleVariableKey("opacity-muted", variables)).toBe(
      true,
    );
    expect(isOpacityCompatibleVariableKey("opacity-alias", variables)).toBe(
      true,
    );
    expect(isOpacityCompatibleVariableKey("brand-primary", variables)).toBe(
      false,
    );
    expect(isOpacityCompatibleVariableKey("color-alias", variables)).toBe(
      false,
    );
    expect(isOpacityCompatibleVariableKey("spacing-md", variables)).toBe(false);
    expect(isOpacityCompatibleVariableKey("token-alias", variables)).toBe(false);
    expect(isOpacityCompatibleVariableKey("missing", variables)).toBe(false);
  });

  it("builds picker options for effects variables and compatible aliases only", () => {
    const options = buildOpacityVariableReferenceOptions(variables);

    expect(options.map((option) => option.value).sort()).toEqual([
      "opacity-alias",
      "opacity-muted",
    ]);
  });
});
