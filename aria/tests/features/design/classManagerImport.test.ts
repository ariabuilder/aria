import { describe, expect, it } from "vitest";

import { parseClassCssImportInput } from "../../../admin/features/Design/lib/classManagerImport";
import {
  generateContextRulesCSS,
  generateCustomClasses,
  generateKeyframesCSS,
} from "../../../lib/styles/generateCustomCSS";

const USER_CSS_FIXTURE = `
/* Base Reveal Animation */
.reveal {
  opacity: 0;
  transform: translateY(2rem);
  transition: all 1s cubic-bezier(0.16, 1, 0.3, 1);
}
.reveal.active {
  opacity: 1;
  transform: translateY(0);
}

/* Masked Text Reveal */
.text-reveal-wrapper {
  overflow: hidden;
  display: inline-block;
  vertical-align: bottom;
}
.text-reveal-content {
  transform: translateY(110%);
  opacity: 0;
  transition: transform 1.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 1.2s ease;
  display: block;
}
.reveal-active .text-reveal-content {
  transform: translateY(0);
  opacity: 1;
}

/* Stagger Delays */
.delay-100 { transition-delay: 0.1s; }
.delay-200 { transition-delay: 0.2s; }
.delay-300 { transition-delay: 0.3s; }
.delay-500 { transition-delay: 0.5s; }

/* Marquee Animation */
.marquee-container {
  display: flex;
  overflow: hidden;
  user-select: none;
}
.marquee-content {
  flex-shrink: 0;
  display: flex;
  justify-content: space-around;
  min-width: 100%;
  animation: scroll 40s linear infinite;
}
@keyframes scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-100%); }
}

/* Interface Mockup Animations */
.interface-load {
  opacity: 0;
  transform: scale(0.98);
  transition: all 1.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.interface-load.active {
  opacity: 1;
  transform: scale(1);
}

/* Glow Effects */
.glow-point {
  position: absolute;
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(120,119,198,0.15) 0%, rgba(0,0,0,0) 70%);
  pointer-events: none;
  z-index: 0;
}
html:not(.dark) .glow-point {
  background: radial-gradient(circle, rgba(120,119,198,0.08) 0%, rgba(255,255,255,0) 70%);
}

/* Glass Panel */
.glass-panel {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
html:not(.dark) .glass-panel {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.toggle-switch {
  transition: left 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.code-font {
  font-family: 'JetBrains Mono', monospace;
}
`;

describe("classManagerImport", () => {
  it("parses a simple class rule", () => {
    const result = parseClassCssImportInput(".foo { opacity: 0; }");

    expect(result.success).toBe(true);
    expect(result.summary.classCount).toBe(1);
    expect(result.classes.foo?.variants[0]?.rules).toEqual([
      { property: "opacity", value: "0", important: false },
    ]);
  });

  it("maps compound selectors to compoundVariants, not :active pseudo", () => {
    const result = parseClassCssImportInput(`
      .reveal { opacity: 0; }
      .reveal.active { opacity: 1; }
    `);

    expect(result.success).toBe(true);
    expect(result.classes.reveal?.compoundVariants).toEqual([
      expect.objectContaining({
        withClasses: ["active"],
        breakpoint: "base",
        rules: [{ property: "opacity", value: "1", important: false }],
      }),
    ]);
    expect(result.classes.reveal?.pseudoVariants ?? []).toHaveLength(0);
  });

  it("parses pseudo variants", () => {
    const result = parseClassCssImportInput(".btn:hover { color: red; }");

    expect(result.success).toBe(true);
    expect(result.classes.btn?.pseudoVariants[0]).toEqual(
      expect.objectContaining({
        state: "hover",
        rules: [{ property: "color", value: "red", important: false }],
      }),
    );
  });

  it("splits comma-separated selectors", () => {
    const result = parseClassCssImportInput(".foo, .bar { color: red; }");

    expect(result.success).toBe(true);
    expect(result.summary.classCount).toBe(2);
    expect(result.classes.foo?.variants[0]?.rules[0]?.value).toBe("red");
    expect(result.classes.bar?.variants[0]?.rules[0]?.value).toBe("red");
  });

  it("preserves keyframe names", () => {
    const result = parseClassCssImportInput(`
      @keyframes scroll {
        from { transform: translateX(0); }
        to { transform: translateX(-100%); }
      }
    `);

    expect(result.success).toBe(true);
    expect(result.keyframes.scroll?.steps.from).toEqual({
      transform: "translateX(0)",
    });
    expect(result.keyframes.scroll?.steps.to).toEqual({
      transform: "translateX(-100%)",
    });
  });

  it("creates context rules for complex selectors", () => {
    const result = parseClassCssImportInput(`
      .glass-panel { background: black; }
      html:not(.dark) .glass-panel { background: white; }
    `);

    expect(result.success).toBe(true);
    expect(result.contextRules).toHaveLength(1);
    expect(result.contextRules[0]?.selector).toBe("html:not(.dark) .glass-panel");
    expect(result.contextRules[0]?.rules[0]?.value).toBe("white");
  });

  it("creates context rules for descendant selectors", () => {
    const result = parseClassCssImportInput(`
      .text-reveal-content { opacity: 0; }
      .reveal-active .text-reveal-content { opacity: 1; }
    `);

    expect(result.success).toBe(true);
    expect(result.contextRules).toHaveLength(1);
    expect(result.contextRules[0]?.selector).toBe(
      ".reveal-active .text-reveal-content",
    );
  });

  it("parses !important declarations", () => {
    const result = parseClassCssImportInput(".foo { color: red !important; }");

    expect(result.success).toBe(true);
    expect(result.classes.foo?.variants[0]?.rules[0]).toEqual({
      property: "color",
      value: "red",
      important: true,
    });
  });

  it("preserves quoted font-family values", () => {
    const result = parseClassCssImportInput(
      ".code-font { font-family: 'JetBrains Mono', monospace; }",
    );

    expect(result.success).toBe(true);
    expect(result.classes["code-font"]?.variants[0]?.rules[0]?.value).toBe(
      "'JetBrains Mono', monospace",
    );
  });

  it("rejects forbidden sheet constructs", () => {
    const result = parseClassCssImportInput(`@import url("x.css"); .foo { color: red; }`);

    expect(result.success).toBe(false);
    expect(result.error).toContain("forbidden");
  });

  it("rejects oversized input", () => {
    const result = parseClassCssImportInput("a".repeat(512 * 1024 + 1));

    expect(result.success).toBe(false);
    expect(result.error).toContain("512KB");
  });

  it("continues after malformed blocks", () => {
    const result = parseClassCssImportInput(`
      .good { color: green; }
      .bad { color }
      .also-good { color: blue; }
    `);

    expect(result.success).toBe(true);
    expect(result.classes.good).toBeDefined();
    expect(result.classes["also-good"]).toBeDefined();
    expect(result.skipped.length).toBeGreaterThan(0);
  });

  it("parses the full user fixture", () => {
    const result = parseClassCssImportInput(USER_CSS_FIXTURE);

    expect(result.success).toBe(true);
    expect(result.summary.classCount).toBeGreaterThanOrEqual(12);
    expect(result.summary.contextRuleCount).toBeGreaterThanOrEqual(3);
    expect(result.summary.keyframeCount).toBe(1);
    expect(result.skipped).toHaveLength(0);
    expect(result.classes.reveal?.compoundVariants?.[0]?.withClasses).toEqual([
      "active",
    ]);
  });

  it("round-trips imported css with semantic equivalence", () => {
    const imported = parseClassCssImportInput(USER_CSS_FIXTURE);
    expect(imported.success).toBe(true);
    if (!imported.success) {
      return;
    }

    const generated = [
      generateCustomClasses(imported.classes),
      generateContextRulesCSS(imported.contextRules),
      generateKeyframesCSS({ keyframes: imported.keyframes }),
    ]
      .join("\n")
      .replace(/\s+/g, " ");

    expect(generated).toContain(".reveal.active");
    expect(generated).toContain(".reveal-active .text-reveal-content");
    expect(generated).toContain("html:not(.dark) .glass-panel");
    expect(generated).toContain("@keyframes scroll");
    expect(generated).toContain("animation: scroll 40s");
  });
});
