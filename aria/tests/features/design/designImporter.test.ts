import { describe, expect, it } from "vitest";

import {
  parseDesignImportInput,
  type DesignImportCollisionContext,
} from "../../../admin/features/Design/lib/designImporter";
import { createDefaultGlobalStylesConfig } from "../../../lib/styles/universalDesignSystem";

const USER_CSS_FIXTURE = `
.reveal { opacity: 0; }
.reveal.active { opacity: 1; }
.delay-100 { transition-delay: 0.1s; }
@keyframes scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-100%); }
}
html:not(.dark) .glass-panel { background: white; }
`;

const testColors = {
  activeTemplateId: "custom",
  palettes: {
    primary: {
      25: "#f8fbff",
      50: "#eff6ff",
      100: "#dbeafe",
      200: "#bfdbfe",
      300: "#93c5fd",
      400: "#60a5fa",
      500: "#3b82f6",
      600: "#2563eb",
      700: "#1d4ed8",
      800: "#1e40af",
      900: "#1e3a8a",
      950: "#172554",
      DEFAULT: "#3b82f6",
    },
  },
  semantic: {
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
    info: "#3b82f6",
  },
};

const testTypography = {
  families: {
    body: "Inter",
    heading: "Fraunces",
    mono: "ui-monospace, monospace",
  },
  scale: [
    {
      id: "base",
      label: "Base",
      size: 16,
      lineHeight: 24,
      letterSpacing: 0,
    },
  ],
  headingOverrides: {},
  bodyOverrides: {},
};

describe("designImporter", () => {
  it("detects all sections from a full design-system export", () => {
    const globalStyles = createDefaultGlobalStylesConfig();
    globalStyles.variables.custom["brand-primary"] = {
      label: "Brand Primary",
      value: "#2d49b7",
      category: "color",
      description: "",
    };

    const result = parseDesignImportInput(
      JSON.stringify({
        exportedAt: "2026-01-01T00:00:00.000Z",
        name: "Full Export",
        colors: testColors,
        globalStyles,
        typography: testTypography,
        semanticClasses: {
          "btn-primary": {
            id: "btn-primary",
            name: "btn-primary",
            variants: [],
            pseudoVariants: [],
          },
        },
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.format).toBe("full-design-system");
    expect(result.sections.map((section) => section.id)).toEqual([
      "colors",
      "variables",
      "globalStyles",
      "typography",
      "classes",
    ]);
  });

  it("parses pasted CSS variables as variable imports", () => {
    const result = parseDesignImportInput(`
      :root {
        --brand-primary: #2d49b7;
        --brand-accent: var(--brand-primary, #1b2c6d);
      }
    `);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.format).toBe("css-variables");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.id).toBe("variables");
    expect(result.sections[0]?.count).toBe(2);
  });

  it("accepts class exports without server-managed metadata", () => {
    const result = parseDesignImportInput(
      JSON.stringify({
        "card-default": {
          id: "card-default",
          name: "card-default",
          variants: [],
          pseudoVariants: [],
        },
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.format).toBe("classes");
    expect(result.sections[0]?.id).toBe("classes");
    expect(result.sections[0]?.count).toBe(1);
  });

  it("rejects invalid class names before import", () => {
    const result = parseDesignImportInput(
      JSON.stringify({
        "bad class": {
          id: "bad class",
          name: "bad class",
          variants: [],
          pseudoVariants: [],
        },
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.errors[0]?.section).toBe("classes");
  });

  it("parses raw css classes into import sections", () => {
    const result = parseDesignImportInput(USER_CSS_FIXTURE);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.format).toBe("css-classes");
    expect(result.sections.map((section) => section.id)).toEqual([
      "classes",
      "contextRules",
      "animations",
    ]);
  });

  it("parses mixed css classes and variables", () => {
    const result = parseDesignImportInput(`
      .card { padding: 1rem; }
      :root { --brand-primary: #2d49b7; }
    `);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.format).toBe("css-mixed");
    expect(result.sections.map((section) => section.id)).toContain("classes");
    expect(result.sections.map((section) => section.id)).toContain("variables");
  });

  it("flags collisions against existing classes", () => {
    const collisionContext: DesignImportCollisionContext = {
      classNames: ["reveal"],
    };
    const result = parseDesignImportInput(".reveal { opacity: 0; }", {
      collisionContext,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.collisions).toEqual([
      expect.objectContaining({
        section: "classes",
        key: "reveal",
        action: "overwrite",
      }),
    ]);
  });
});
