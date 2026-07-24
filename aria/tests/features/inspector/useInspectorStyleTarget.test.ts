import { describe, expect, it } from "vitest";

import { normalizeInspectorResponsiveStyleMap } from "../../../admin/features/Inspector/composables/useInspectorStyleTarget";
import {
  getComputedValue,
  getResponsiveValue,
} from "../../../admin/features/Core/utils/responsive";
import type { BreakpointDefinition } from "../../../lib/types/nodes";

const BREAKPOINTS: BreakpointDefinition[] = [
  { name: "base", minWidth: "1280px", label: "Desktop" },
  { name: "laptop", minWidth: "1024px", label: "Laptop" },
  { name: "testing", minWidth: "900px", label: "Testing" },
  { name: "tablet", minWidth: "768px", label: "Tablet" },
  { name: "mobile", minWidth: "0px", label: "Mobile" },
];

describe("normalizeInspectorResponsiveStyleMap", () => {
  it("maps legacy desktop/default keys onto base", () => {
    expect(
      normalizeInspectorResponsiveStyleMap({
        desktop: "#993939",
        tablet: "#0c7521e8",
      }),
    ).toEqual({
      base: "#993939",
      tablet: "#0c7521e8",
    });
  });

  it("prefers an explicit base value over legacy desktop", () => {
    expect(
      normalizeInspectorResponsiveStyleMap({
        base: "#111111",
        desktop: "#993939",
      }),
    ).toEqual({
      base: "#111111",
    });
  });
});

describe("inspector breakpoint reads", () => {
  const backgroundColor = {
    base: "#993939",
    laptop: "var(--warning-700)",
    testing: "var(--secondary-800)",
    tablet: "#0c7521e8",
    mobile: "#666060",
  };

  it("returns authored values per breakpoint without cascade bleed", () => {
    expect(getResponsiveValue(backgroundColor, "base")).toBe("#993939");
    expect(getResponsiveValue(backgroundColor, "laptop")).toBe(
      "var(--warning-700)",
    );
    expect(getResponsiveValue(backgroundColor, "testing")).toBe(
      "var(--secondary-800)",
    );
    expect(getResponsiveValue(backgroundColor, "tablet")).toBe("#0c7521e8");
    expect(getResponsiveValue(backgroundColor, "mobile")).toBe("#666060");
  });

  it("does not inherit tablet into testing when testing is authored", () => {
    expect(getComputedValue(backgroundColor, "testing", BREAKPOINTS)).toBe(
      "var(--secondary-800)",
    );
    expect(getResponsiveValue(backgroundColor, "testing")).toBe(
      "var(--secondary-800)",
    );
  });

  it("only cascades computed values when a breakpoint has no authored value", () => {
    const partial = {
      base: "#993939",
      tablet: "#0c7521e8",
    };

    expect(getResponsiveValue(partial, "laptop")).toBeUndefined();
    expect(getComputedValue(partial, "laptop", BREAKPOINTS)).toBe("#993939");
    expect(getComputedValue(partial, "testing", BREAKPOINTS)).toBe("#993939");
  });
});
