import type { ViewportType } from "./pagePreviewTypes";

export const DESKTOP_PREVIEW_MIN_WIDTH = 1280;
export const DESKTOP_PREVIEW_FALLBACK_WIDTH = 1024;

export const UNOCSS_CDN = "https://cdn.jsdelivr.net/npm/@unocss/runtime";

export const THEME_STYLES = `
  body {
    margin: 0;
    padding: 0;
    background: hsl(var(--background, 0 0% 100%));
    color: hsl(var(--foreground, 240 10% 3.9%));
    font-family: system-ui, -apple-system, sans-serif;
  }

  body.preview-mode {
    pointer-events: none;
    user-select: none;
  }

  img {
    max-width: 100%;
    height: auto;
  }
`;

export const VIEWPORT_WIDTHS = {
  desktop: 1280,
  laptop: 1024,
  tablet: 768,
  mobile: 375,
} as const satisfies Record<ViewportType, number>;

export const VIEWPORT_HEIGHTS: Record<ViewportType, number> = {
  desktop: 900,
  laptop: 900,
  tablet: 1024,
  mobile: 812,
};
