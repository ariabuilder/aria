/** Applied on the nav-item grid wrapper in FlickeringGridBackdrop.vue (scoped CSS). */
export const FLICKERING_NAV_GRID_MASK_CLASS = "flickering-nav-grid-mask";

/** Bottom-origin mask for dashboard cards and similar surfaces. */
export const FLICKERING_BOTTOM_GRID_MASK_CLASS = "flickering-bottom-grid-mask";

/** Elliptical bottom-origin mask for wide ambient canvas treatments. */
export const FLICKERING_BOTTOM_CENTER_GRID_MASK_CLASS =
  "flickering-bottom-center-grid-mask";

export type FlickeringGridBackdropOrigin = "left" | "bottom" | "bottom-center";

export interface FlickeringNavGridProps {
  squareSize: number;
  gridGap: number;
  flickerChance: number;
  maxOpacity: number;
  color: string;
  accentColor: string;
  accentChance: number;
  accentMaxOpacity: number;
  reveal: boolean;
  revealDuration: number;
  revealStagger: number;
}

/** Theme-aware dot colors — overridden per palette in styles/themes/*.css */
export const FLICKERING_GRID_COLOR =
  "color-mix(in oklch, var(--flickering-grid-accent) 52%, var(--flickering-grid-color))";
export const FLICKERING_GRID_ACCENT =
  "color-mix(in oklch, var(--flickering-grid-accent) 94%, white 6%)";

export const FLICKERING_NAV_GRID_PROPS = {
  squareSize: 1.6,
  gridGap: 3.8,
  flickerChance: 0.12,
  maxOpacity: 0.23,
  color: FLICKERING_GRID_COLOR,
  accentColor: FLICKERING_GRID_ACCENT,
  accentChance: 0.3,
  accentMaxOpacity: 0.5,
  reveal: true,
  revealDuration: 0.4,
  revealStagger: 0.8,
} as const satisfies FlickeringNavGridProps;

/** Dashboard stat cards — slightly richer than nav, bottom reveal. */
export const FLICKERING_DASHBOARD_STAT_GRID_PROPS = {
  ...FLICKERING_NAV_GRID_PROPS,
  flickerChance: 0.1,
  maxOpacity: 0.27,
  accentChance: 0.36,
  accentMaxOpacity: 0.56,
} as const satisfies FlickeringNavGridProps;

export const FLICKERING_NAV_ITEM_ROW_CLASS =
  "relative w-full !justify-start px-6 py-3 min-h-10 h-auto font-regular! border-b border-dashed border-border/50 -my-px settings-nav-item sidebar-nav-target";
