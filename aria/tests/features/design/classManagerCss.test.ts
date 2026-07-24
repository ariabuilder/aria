import { describe, expect, it } from "vitest";

import {
  buildClassSelectorPreview,
  formatClassCssText,
  formatClassManagerCssText,
  parseClassManagerCssText,
} from "../../../admin/features/Design/lib/classManagerCss";
import {
  cssPropertiesEquivalent,
  normalizeCssRuleList,
  normalizeStoredCssProperty,
} from "../../../lib/types/classes";
import {
  generateContextRulesCSS,
  generateCustomClasses,
  generateKeyframesCSS,
} from "../../../lib/styles/generateCustomCSS";
import { validateAdvancedCss, validateContextSelector } from "../../../lib/styles/cssValidation";

describe("classManagerCss", () => {
  const sampleClass = {
    id: "hero-heading",
    name: "hero-heading",
    description: "",
    variants: [
      {
        breakpoint: "base" as const,
        rules: [
          { property: "font-size", value: "3rem", important: false },
          { property: "font-weight", value: "700", important: false },
        ],
      },
      {
        breakpoint: "md" as const,
        rules: [{ property: "font-size", value: "2rem", important: false }],
      },
    ],
    pseudoVariants: [
      {
        state: "hover" as const,
        breakpoint: "base" as const,
        rules: [{ property: "color", value: "red", important: true }],
      },
    ],
    compoundVariants: [],
    usageCount: 0,
    createdAt: "2026-04-10T10:00:00.000Z",
    updatedAt: "2026-04-12T12:00:00.000Z",
  };

  it("parses raw css declarations into canonical camelCase property keys", () => {
    expect(
      parseClassManagerCssText("font-size: 3rem; color: var(--brand);"),
    ).toEqual([
      { property: "fontSize", value: "3rem", important: false },
      { property: "color", value: "var(--brand)", important: false },
    ]);
  });

  it("preserves css custom properties without camelCasing", () => {
    expect(
      parseClassManagerCssText("--brand-color: red;"),
    ).toEqual([{ property: "--brand-color", value: "red", important: false }]);
  });

  it("round-trips editor css text through parse and format", () => {
    const cssText = "font-size: 33px;\nfont-weight: 700;";
    const parsed = parseClassManagerCssText(cssText);

    expect(
      formatClassManagerCssText(
        {
          ...sampleClass,
          variants: [{ breakpoint: "base", rules: parsed }],
        },
        "base",
      ),
    ).toBe(cssText);
  });

  it("resolves legacy kebab-case rules for inspector camelCase keys", () => {
    const legacyRule = { property: "font-size", value: "33px", important: false };
    expect(cssPropertiesEquivalent(legacyRule.property, "fontSize")).toBe(true);
    expect(normalizeStoredCssProperty(legacyRule.property)).toBe("fontSize");
  });

  it("parses !important declarations", () => {
    expect(parseClassManagerCssText("color: red !important;")).toEqual([
      { property: "color", value: "red", important: true },
    ]);
  });

  it("rejects selector braces and at-rules", () => {
    expect(() => parseClassManagerCssText("@media (min-width: 1px) { color: red; }")).toThrow();
    expect(() => parseClassManagerCssText(".foo { color: red; }")).toThrow();
  });

  it("formats class rules for the requested breakpoint", () => {
    expect(formatClassManagerCssText(sampleClass, "base")).toBe(
      "font-size: 3rem;\nfont-weight: 700;",
    );
  });

  it("formats pseudo variant rules for the requested context", () => {
    expect(
      formatClassCssText(sampleClass, {
        breakpoint: "base",
        pseudoState: "hover",
      }),
    ).toBe("color: red !important;");
  });

  it("returns empty css when the breakpoint has no rules", () => {
    expect(formatClassManagerCssText(sampleClass, "sm")).toBe("");
  });

  it("builds selector previews", () => {
    expect(buildClassSelectorPreview("btn", "default")).toBe(".btn");
    expect(buildClassSelectorPreview("btn", "hover")).toBe(".btn:hover");
  });

  it("dedupes mixed property name formats when normalizing rule lists", () => {
    expect(
      normalizeCssRuleList([
        { property: "font-size", value: "1rem", important: false },
        { property: "fontSize", value: "33px", important: false },
      ]),
    ).toEqual([
      { property: "fontSize", value: "33px", important: false },
    ]);
  });
});

describe("generateCustomCSS extensions", () => {
  it("generates compound selector variants", () => {
    const css = generateCustomClasses({
      reveal: {
        id: "reveal",
        name: "reveal",
        variants: [],
        pseudoVariants: [],
        compoundVariants: [
          {
            withClasses: ["active"],
            breakpoint: "base",
            rules: [{ property: "opacity", value: "1", important: false }],
          },
        ],
        usageCount: 0,
        createdAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-12T12:00:00.000Z",
      },
    });

    expect(css).toContain(".reveal.active {\n  opacity: 1;\n}");
  });

  it("appends validated advanced css", () => {
    const css = generateCustomClasses({
      panel: {
        id: "panel",
        name: "panel",
        variants: [
          {
            breakpoint: "base",
            rules: [{ property: "padding", value: "1rem", important: false }],
          },
        ],
        pseudoVariants: [],
        compoundVariants: [],
        advancedCss: "@supports (display: grid) { .panel { display: grid; } }",
        usageCount: 0,
        createdAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-12T12:00:00.000Z",
      },
    });

    expect(css).toContain("padding: 1rem;");
    expect(css).toContain("@supports (display: grid)");
  });

  it("generates keyframes css", () => {
    const css = generateKeyframesCSS({
      keyframes: {
        "aria-kf-fade-in": {
          steps: {
            "0%": { opacity: "0" },
            "100%": { opacity: "1" },
          },
        },
      },
    });

    expect(css).toContain("@keyframes aria-kf-fade-in");
    expect(css).toContain("opacity: 0;");
    expect(css).toContain("opacity: 1;");
  });

  it("generates context rules css", () => {
    const css = generateContextRulesCSS([
      {
        id: "dark-glass",
        selector: "html:not(.dark) .glass-panel",
        rules: [{ property: "background", value: "white", important: false }],
      },
    ]);

    expect(css).toContain("html:not(.dark) .glass-panel");
    expect(css).toContain("background: white;");
  });
});

describe("cssValidation", () => {
  it("rejects forbidden advanced css", () => {
    expect(validateAdvancedCss("@import url('x.css');").valid).toBe(false);
  });

  it("requires semantic class references in context selectors", () => {
    expect(
      validateContextSelector("html .unknown", ["glass-panel"]).valid,
    ).toBe(false);
    expect(
      validateContextSelector("html:not(.dark) .glass-panel", ["glass-panel"])
        .valid,
    ).toBe(true);
  });
});
