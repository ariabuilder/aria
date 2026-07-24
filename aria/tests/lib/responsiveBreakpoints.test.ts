import { describe, expect, it } from "vitest";

import {
  buildDesktopFirstCascadeStyleValues,
  compareBreakpointsLargestFirst,
  computeBreakpointRangeLabel,
  createResponsiveMediaQuery,
  DEFAULT_DESKTOP_MIN_WIDTH,
  DESKTOP_BASE_BREAKPOINT,
  formatBreakpointWidth,
  getDownstreamBreakpointNames,
  getOrderedResponsiveMediaQueries,
  isUpstreamOfDesktopBase,
  resolveEffectiveBreakpointWidth,
} from "../../lib/styles/responsiveBreakpoints";
import type { BreakpointDefinition } from "../../lib/types/nodes";
import {
  createBreakpointDefinitionsFromUniversalBreakpoints,
  createDefaultUniversalBreakpointItems,
  normalizeUniversalBreakpointItems,
} from "../../lib/styles/universalDesignSystem";

const SEED_BREAKPOINTS = [
  {
    id: "base",
    label: "Desktop",
    icon: "Monitor",
    minWidth: 2400,
    canvasWidth: 1440,
    enabled: true,
    isDefault: true,
    order: 0,
  },
  {
    id: "testing",
    label: "Testing",
    icon: "Monitor",
    minWidth: 2400,
    canvasWidth: 2400,
    enabled: true,
    isDefault: false,
    order: 1,
  },
  {
    id: "laptop",
    label: "Laptop",
    icon: "Laptop",
    minWidth: 1024,
    canvasWidth: 1024,
    enabled: true,
    isDefault: true,
    order: 2,
  },
  {
    id: "tablet",
    label: "Tablet",
    icon: "Tablet",
    minWidth: 768,
    canvasWidth: 768,
    enabled: true,
    isDefault: true,
    order: 3,
  },
  {
    id: "mobile",
    label: "Mobile",
    icon: "Smartphone",
    minWidth: 0,
    canvasWidth: 375,
    enabled: true,
    isDefault: true,
    order: 4,
  },
];

function createSeedDefinitions(): BreakpointDefinition[] {
  return createBreakpointDefinitionsFromUniversalBreakpoints(SEED_BREAKPOINTS);
}

describe("responsiveBreakpoints seed config", () => {
  it("stops inflating base.minWidth to the testing tier width", () => {
    const normalized = normalizeUniversalBreakpointItems(SEED_BREAKPOINTS);
    const base = normalized.find((breakpoint) => breakpoint.id === "base");

    expect(base?.minWidth).toBe(1440);
    expect(base?.canvasWidth).toBe(1440);
  });

  it("uses effective canvas width for base when computing media queries", () => {
    const breakpoints = createSeedDefinitions();
    const base = breakpoints.find((breakpoint) => breakpoint.name === "base");

    expect(resolveEffectiveBreakpointWidth(base!)).toBe(1440);
    expect(createResponsiveMediaQuery(breakpoints, "laptop")).toBe(
      `(max-width: ${formatBreakpointWidth(1440 - 0.02)})`,
    );
    expect(createResponsiveMediaQuery(breakpoints, "tablet")).toBe(
      `(max-width: ${formatBreakpointWidth(1024 - 0.02)})`,
    );
  });

  it("uses min-width media for tiers wider than base", () => {
    const breakpoints = createSeedDefinitions();

    expect(createResponsiveMediaQuery(breakpoints, "testing")).toBe(
      "(min-width: 2400px)",
    );
  });

  it("does not let tablet match 1440px desktop viewports when laptop is enabled", () => {
    const breakpoints = createSeedDefinitions();
    const tabletQuery = createResponsiveMediaQuery(breakpoints, "tablet");

    expect(tabletQuery).toBe("(max-width: 1023.98px)");
    expect(tabletQuery).not.toContain("2399.98");
  });

  it("matches breakpoint spectrum ranges", () => {
    const breakpoints = createSeedDefinitions();

    expect(computeBreakpointRangeLabel(breakpoints, "testing")).toBe("2400px+");
    expect(computeBreakpointRangeLabel(breakpoints, "base")).toBe(
      "1440px \u2014 2399px",
    );
    expect(computeBreakpointRangeLabel(breakpoints, "laptop")).toBe(
      "1024px \u2014 1439px",
    );
    expect(computeBreakpointRangeLabel(breakpoints, "tablet")).toBe(
      "768px \u2014 1023px",
    );
    expect(computeBreakpointRangeLabel(breakpoints, "mobile")).toBe(
      "375px \u2014 767px",
    );
  });

  it("orders css media queries max-width wide-to-narrow then min-width", () => {
    const breakpoints = createSeedDefinitions();
    const queries = getOrderedResponsiveMediaQueries(breakpoints);

    expect(queries).toEqual([
      `(max-width: ${formatBreakpointWidth(1440 - 0.02)})`,
      "(max-width: 1023.98px)",
      "(max-width: 767.98px)",
      "(min-width: 2400px)",
    ]);
  });

  it("sorts enabled breakpoints largest to smallest for UI selectors", () => {
    const breakpoints = createSeedDefinitions();

    expect(breakpoints.map((breakpoint) => breakpoint.name)).toEqual([
      "testing",
      "base",
      "laptop",
      "tablet",
      "mobile",
    ]);
    expect(
      compareBreakpointsLargestFirst(
        { name: "testing", minWidth: 2400, canvasWidth: 2400 },
        { name: "base", minWidth: 1440, canvasWidth: 1440 },
      ),
    ).toBeLessThan(0);
  });

  it("keeps tablet scoped below base when laptop is disabled", () => {
    const disabledLaptop = SEED_BREAKPOINTS.map((breakpoint) => ({
      ...breakpoint,
      enabled: breakpoint.id === "laptop" ? false : breakpoint.enabled,
    }));
    const resolved =
      createBreakpointDefinitionsFromUniversalBreakpoints(disabledLaptop);

    expect(createResponsiveMediaQuery(resolved, "tablet")).toBe(
      `(max-width: ${formatBreakpointWidth(1440 - 0.02)})`,
    );
  });
});

describe("normalizeUniversalBreakpointItems defaults", () => {
  it("restores every missing system default from an incomplete persisted list", () => {
    const normalized = normalizeUniversalBreakpointItems([
      {
        id: "base",
        label: "Desktop",
        icon: "Monitor",
        minWidth: 1280,
        canvasWidth: 1440,
        enabled: true,
        isDefault: true,
        order: 0,
      },
      {
        id: "laptop",
        label: "Laptop",
        icon: "Laptop",
        minWidth: 1024,
        canvasWidth: 1024,
        enabled: true,
        isDefault: true,
        order: 1,
      },
      {
        id: "tablet",
        label: "Tablet",
        icon: "Tablet",
        minWidth: 768,
        canvasWidth: 768,
        enabled: true,
        isDefault: true,
        order: 2,
      },
    ]);

    expect(normalized.map((breakpoint) => breakpoint.id)).toEqual([
      "base",
      "laptop",
      "tablet",
      "mobile",
    ]);
    expect(
      normalized.find((breakpoint) => breakpoint.id === "mobile"),
    ).toMatchObject({
      label: "Mobile",
      minWidth: 0,
      canvasWidth: 375,
      enabled: true,
      isDefault: true,
    });
  });

  it("retains disabled system defaults", () => {
    const normalized = normalizeUniversalBreakpointItems(
      createDefaultUniversalBreakpointItems().map((breakpoint) => ({
        ...breakpoint,
        enabled: breakpoint.id === "mobile" ? false : breakpoint.enabled,
      })),
    );

    expect(
      normalized.find((breakpoint) => breakpoint.id === "mobile"),
    ).toMatchObject({
      isDefault: true,
      enabled: false,
    });
  });

  it("repairs a mobile-sized desktop canvas width", () => {
    const normalized = normalizeUniversalBreakpointItems(
      createDefaultUniversalBreakpointItems().map((breakpoint) =>
        breakpoint.id === "base"
          ? { ...breakpoint, canvasWidth: 375 }
          : breakpoint,
      ),
    );

    expect(
      normalized.find((breakpoint) => breakpoint.id === "base"),
    ).toMatchObject({
      minWidth: 1280,
      canvasWidth: 1440,
    });
  });

  it("never stores base minWidth above canvas width", () => {
    const normalized = normalizeUniversalBreakpointItems([
      {
        id: "base",
        label: "Desktop",
        icon: "Monitor",
        minWidth: 2400,
        canvasWidth: 1440,
        enabled: true,
        isDefault: true,
        order: 0,
      },
      {
        id: "testing",
        label: "Testing",
        icon: "Monitor",
        minWidth: 2400,
        canvasWidth: 2400,
        enabled: true,
        isDefault: false,
        order: 1,
      },
    ]);

    const base = normalized.find((breakpoint) => breakpoint.id === "base");
    expect(base?.minWidth).toBeLessThanOrEqual(base?.canvasWidth ?? 0);
    expect(base?.minWidth).toBeGreaterThanOrEqual(DEFAULT_DESKTOP_MIN_WIDTH);
  });
});

describe("DESKTOP_BASE_BREAKPOINT", () => {
  it("remains the desktop style key", () => {
    expect(DESKTOP_BASE_BREAKPOINT).toBe("base");
  });
});

describe("desktop-first cascade helpers", () => {
  const breakpoints = createSeedDefinitions();

  it("treats testing as upstream of desktop base", () => {
    expect(isUpstreamOfDesktopBase(breakpoints, "testing")).toBe(true);
    expect(isUpstreamOfDesktopBase(breakpoints, "base")).toBe(false);
    expect(isUpstreamOfDesktopBase(breakpoints, "tablet")).toBe(false);
  });

  it("lists downstream breakpoints from largest to smallest widths", () => {
    expect(getDownstreamBreakpointNames(breakpoints, "testing")).toEqual([
      "base",
      "laptop",
      "tablet",
      "mobile",
    ]);
    expect(getDownstreamBreakpointNames(breakpoints, "base")).toEqual([
      "laptop",
      "tablet",
      "mobile",
    ]);
  });

  it("propagates upstream testing saves to base and clears smaller overrides", () => {
    expect(
      buildDesktopFirstCascadeStyleValues(
        breakpoints,
        "testing",
        "none",
        ["base", "tablet"],
      ),
    ).toEqual({
      testing: "none",
      base: "none",
      tablet: undefined,
    });
  });

  it("keeps tablet saves scoped to tablet and below", () => {
    expect(
      buildDesktopFirstCascadeStyleValues(
        breakpoints,
        "tablet",
        "none",
        ["mobile"],
      ),
    ).toEqual({
      tablet: "none",
      mobile: undefined,
    });
  });
});
