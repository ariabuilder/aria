import { describe, expect, it } from "vitest";
import { generateCustomClasses } from "../../lib/styles/generateCustomCSS";

describe("generateCustomClasses", () => {
  it("omits the generated timestamp banner from output", () => {
    const css = generateCustomClasses({
      button: {
        id: "button",
        name: "button",
        variants: [
          {
            breakpoint: "base",
            rules: [{ property: "padding", value: "1rem", important: false }],
          },
        ],
        pseudoVariants: [],
        usageCount: 0,
        createdAt: "2026-04-11T00:00:00.000Z",
        updatedAt: "2026-04-11T00:00:00.000Z",
      },
    });

    expect(css).toContain(".button {");
    expect(css).toContain("padding: 1rem;");
    expect(css).not.toContain("Aria Custom Classes - Generated");
  });

  it("normalizes camelCase properties into valid CSS declarations", () => {
    const css = generateCustomClasses({
      "background-blue": {
        id: "background-blue",
        name: "background-blue",
        variants: [
          {
            breakpoint: "base",
            rules: [
              {
                property: "backgroundColor",
                value: "#1e63d3",
                important: false,
              },
            ],
          },
        ],
        pseudoVariants: [],
        usageCount: 0,
        createdAt: "2026-04-11T00:00:00.000Z",
        updatedAt: "2026-04-11T00:00:00.000Z",
      },
    });

    expect(css).toContain(".background-blue {");
    expect(css).toContain("background-color: #1e63d3;");
    expect(css).not.toContain("backgroundColor:");
  });

  it("uses double-colon selectors for before and after pseudo variants", () => {
    const css = generateCustomClasses({
      badge: {
        id: "badge",
        name: "badge",
        variants: [],
        pseudoVariants: [
          {
            state: "before",
            breakpoint: "base",
            rules: [{ property: "content", value: '""', important: false }],
          },
          {
            state: "after",
            breakpoint: "base",
            rules: [{ property: "display", value: "block", important: false }],
          },
        ],
        usageCount: 0,
        createdAt: "2026-04-11T00:00:00.000Z",
        updatedAt: "2026-04-11T00:00:00.000Z",
      },
    });

    expect(css).toContain(".badge::before {");
    expect(css).toContain('content: "";');
    expect(css).toContain(".badge::after {");
    expect(css).toContain("display: block;");
  });

  it("generates :has pseudo selectors for relational presets", () => {
    const css = generateCustomClasses({
      card: {
        id: "card",
        name: "card",
        variants: [],
        pseudoVariants: [
          {
            state: "has-any-child",
            breakpoint: "base",
            rules: [{ property: "padding", value: "1rem", important: false }],
          },
          {
            state: "custom:has(.icon)",
            breakpoint: "base",
            rules: [{ property: "gap", value: "0.5rem", important: false }],
          },
        ],
        usageCount: 0,
        createdAt: "2026-04-11T00:00:00.000Z",
        updatedAt: "2026-04-11T00:00:00.000Z",
      },
    });

    expect(css).toContain(".card:has(> *) {");
    expect(css).toContain("padding: 1rem;");
    expect(css).toContain(".card:has(.icon) {");
    expect(css).toContain("gap: 0.5rem;");
  });

  it("wraps breakpoint-scoped pseudo rules in media queries", () => {
    const css = generateCustomClasses(
      {
        nav: {
          id: "nav",
          name: "nav",
          variants: [],
          pseudoVariants: [
            {
              state: "hover",
              breakpoint: "sm",
              rules: [
                { property: "background-color", value: "#000", important: false },
              ],
            },
          ],
          usageCount: 0,
          createdAt: "2026-04-11T00:00:00.000Z",
          updatedAt: "2026-04-11T00:00:00.000Z",
        },
      },
      {
        base: 1280,
        sm: 640,
      },
    );

    expect(css).toContain("@media");
    expect(css).toContain(".nav:hover {");
    expect(css).toContain("background-color: #000;");
  });
});
