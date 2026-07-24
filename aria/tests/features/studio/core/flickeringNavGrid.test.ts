import { describe, expect, it } from "vitest";
import {
  FLICKERING_BOTTOM_GRID_MASK_CLASS,
  FLICKERING_DASHBOARD_STAT_GRID_PROPS,
  FLICKERING_GRID_ACCENT,
  FLICKERING_GRID_COLOR,
  FLICKERING_NAV_GRID_PROPS,
  FLICKERING_NAV_GRID_MASK_CLASS,
} from "../../../../admin/features/Studio/core/lib/flickeringNavGrid";

describe("flickeringNavGrid", () => {
  it("matches Settings dialog flickering grid configuration", () => {
    expect(FLICKERING_NAV_GRID_PROPS.squareSize).toBe(1.6);
    expect(FLICKERING_NAV_GRID_PROPS.gridGap).toBe(3.8);
    expect(FLICKERING_NAV_GRID_PROPS.flickerChance).toBe(0.12);
    expect(FLICKERING_NAV_GRID_PROPS.maxOpacity).toBe(0.23);
    expect(FLICKERING_GRID_COLOR).toBe(
      "color-mix(in oklch, var(--flickering-grid-accent) 52%, var(--flickering-grid-color))",
    );
    expect(FLICKERING_GRID_ACCENT).toBe(
      "color-mix(in oklch, var(--flickering-grid-accent) 94%, white 6%)",
    );
    expect(FLICKERING_NAV_GRID_PROPS.color).toBe(FLICKERING_GRID_COLOR);
    expect(FLICKERING_NAV_GRID_PROPS.accentColor).toBe(FLICKERING_GRID_ACCENT);
    expect(FLICKERING_NAV_GRID_PROPS.accentChance).toBe(0.3);
    expect(FLICKERING_NAV_GRID_PROPS.accentMaxOpacity).toBe(0.5);
    expect(FLICKERING_NAV_GRID_PROPS.reveal).toBe(true);
    expect(FLICKERING_NAV_GRID_PROPS.revealDuration).toBe(0.4);
    expect(FLICKERING_NAV_GRID_PROPS.revealStagger).toBe(0.8);
    expect(FLICKERING_NAV_GRID_MASK_CLASS).toBe("flickering-nav-grid-mask");
    expect(FLICKERING_BOTTOM_GRID_MASK_CLASS).toBe("flickering-bottom-grid-mask");
  });

  it("uses stronger accent tuning for dashboard stat cards", () => {
    expect(FLICKERING_DASHBOARD_STAT_GRID_PROPS.maxOpacity).toBe(0.27);
    expect(FLICKERING_DASHBOARD_STAT_GRID_PROPS.accentChance).toBe(0.36);
    expect(FLICKERING_DASHBOARD_STAT_GRID_PROPS.accentMaxOpacity).toBe(0.56);
    expect(FLICKERING_DASHBOARD_STAT_GRID_PROPS.color).toBe(FLICKERING_GRID_COLOR);
    expect(FLICKERING_DASHBOARD_STAT_GRID_PROPS.accentColor).toBe(
      FLICKERING_GRID_ACCENT,
    );
  });
});
