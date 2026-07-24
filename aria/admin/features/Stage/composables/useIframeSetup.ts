/**
 * Iframe HTML generation, framework injection, and initialization. Handles UnoCSS
 * runtime, theme variables, Google Fonts, and custom fonts.
 */

import { computed, type ComputedRef, type Ref } from "vue";
import {
  getSiteSettingsUtilityEngine,
  type SiteSettings,
} from "../../../../lib/storage/adapter";
import { CANVAS_DISABLED_ATTRIBUTE } from "../utils/canvasRenderAttributes";
import { IFRAME_Z_INDEX } from "@/lib/zIndex";
import { getStageDropFeedbackCss } from "../styles/stageDropFeedback";
import { getStageImageDefaultsCss } from "../styles/stageImageDefaults";
import interFontUrl from "../../../assets/fonts/inter.ttf";
import outfitFontUrl from "../../../assets/fonts/outfit-variable.woff2";

/**
 * Essential CSS variables for shadcn-vue components to work in the iframe.
 * Extracted from globals.css
 */
export const THEME_STYLES = `
  /* shadcn-vue utility classes */
  .bg-background { background-color: hsl(var(--background, 0 0% 100%)); }
  .text-primary-foreground { color: hsl(var(--primary-foreground, 0 0% 98%)); }
  .text-muted-foreground { color: hsl(var(--muted-foreground, 240 3.8% 46.1%)); }
  .border-input { border-color: hsl(var(--input, 240 5.9% 90%)); }
  .hover\\:text-accent-foreground:hover { color: hsl(var(--accent-foreground, 240 5.9% 10%)); }
`;

export const STAGE_CONTENT_ROOT_ATTR = "data-aria-stage-content-root";
export const STAGE_OVERLAY_ROOT_ATTR = "data-aria-stage-overlay-root";

const BUILT_IN_FONT_FACE_CSS = `@font-face {
  font-family: "Outfit";
  src: url("${outfitFontUrl}") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Inter";
  src: url("${interFontUrl}") format("truetype");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}`;

export const STAGE_SCREEN_READER_UTILITY_CSS = `
    :where([${STAGE_CONTENT_ROOT_ATTR}]) :where(.sr-only) {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }

    :where([${STAGE_CONTENT_ROOT_ATTR}]) :where(.not-sr-only) {
      position: static;
      width: auto;
      height: auto;
      padding: 0;
      margin: 0;
      overflow: visible;
      clip: auto;
      white-space: normal;
    }
`;

export interface UseIframeSetupOptions {
  siteSettings: Ref<SiteSettings | null>;
  /** Compiled render-style payload */
  renderStyles: Ref<IframeRenderStyles>;
  configJSON: ComputedRef<string>;
  cssVariables: ComputedRef<string>;
}

export interface IframeRenderStyles {
  baseCSS: string;
  customClassesCSS: string;
  customFontsCSS: string;
  globalCSS: string;
  globalCSSHash: string;
  lastCompiled: string;
  styleRevision: string;
  utilityCSS: string;
  utilityCSSHash: string;
  utilityEngine: "unocss" | "custom";
  baseCSSHash: string;
}

export interface UseIframeSetupReturn {
  /** Framework script/link tags based on site settings */
  frameworkScripts: ComputedRef<string>;
  /** Google Fonts link tags */
  googleFontsLinks: ComputedRef<string>;
  customFontsCSS: ComputedRef<string>;
  iframeHtml: ComputedRef<string>;
}

function resolveStageGlobalCssHref(styles: IframeRenderStyles): string | null {
  if (styles.globalCSS?.trim()) {
    return null;
  }

  const cacheKey =
    styles.globalCSSHash || styles.baseCSSHash || styles.styleRevision;

  if (!cacheKey) {
    return null;
  }

  return `/styles/global.css?preview=1&v=${encodeURIComponent(cacheKey)}`;
}

/**
 * Sets up iframe HTML generation with framework injection and styling.
 *
 * @param options - Configuration options
 * @returns Iframe setup utilities and HTML generation
 *
 * @example
 * ```ts
 * const { settings: siteSettings } = useSiteSettings();
 * const { configJSON, cssVariables } = useUnoConfig();
 *
 * const { iframeHtml } = useIframeSetup({
 *   siteSettings,
 *   configJSON,
 *   cssVariables,
 * });
 * ```
 */
export function useIframeSetup(
  options: UseIframeSetupOptions,
): UseIframeSetupReturn {
  const { siteSettings, renderStyles, configJSON, cssVariables } = options;
  const utilityEngine = computed(
    () =>
      renderStyles.value.utilityEngine ||
      getSiteSettingsUtilityEngine(siteSettings.value),
  );
  const globalCssHref = computed(() =>
    resolveStageGlobalCssHref(renderStyles.value),
  );
  const baseCSS = computed(
    () => renderStyles.value.globalCSS || renderStyles.value.baseCSS,
  );
  const utilityCSS = computed(() => renderStyles.value.utilityCSS);

  /**
   * Framework script/link tags based on site settings.
   * Injects UnoCSS CDN runtime or custom CSS into iframe.
   */
  const frameworkScripts = computed(() => {
    const framework = utilityEngine.value;

    if (framework === "unocss") {
      // UnoCSS runtime - uno.global.js includes preset-wind (Tailwind compatible)
      // This bundle includes all the utility rules needed
      return `
      <script src="https://cdn.jsdelivr.net/npm/@unocss/runtime/uno.global.js"><\/script>
    `;
    } else if (
      framework === "custom" &&
      siteSettings.value?.customFrameworkURL
    ) {
      return `<link rel="stylesheet" href="${siteSettings.value.customFrameworkURL}">`;
    }

    return "";
  });

  /**
   * Google Fonts link tags from styles.
   * Loads fonts selected in site settings.
   */
  const googleFontsLinks = computed(() => {
    // Google Fonts link tags are injected via baseCSS from renderStyles.
    return "";
  });

  /**
   * Custom fonts CSS (@font-face rules) from uploaded fonts.
   * Injects font files into iframe for preview.
   */
  const customFontsCSS = computed(() => {
    return renderStyles.value.customFontsCSS;
  });

  /**
   * Generates initial iframe HTML with UnoCSS and drop zone styles.
   * Uses UnoCSS config to get the current design system.
   */
  const iframeHtml = computed(() => {
    const framework = utilityEngine.value;
    const documentBaseHref =
      typeof window !== "undefined" ? `${window.location.origin}/` : "/";
    const themeVariablesStyle = cssVariables.value.trim().length
      ? `<style data-aria-theme-vars>
    /* Shared theme variables for stage rendering */
    ${cssVariables.value}
  <\/style>`
      : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="${documentBaseHref}">
  <title>Aria Stage</title>
  ${googleFontsLinks.value}
  <style data-aria-built-in-fonts>
    ${BUILT_IN_FONT_FACE_CSS}
  <\/style>
  ${themeVariablesStyle}
  ${
    globalCssHref.value
      ? `<link rel="stylesheet" data-aria-global-css href="${globalCssHref.value}">`
      : `<style data-aria-base-css>
    ${baseCSS.value}
  <\/style>
  <style data-aria-utility-css>
    ${utilityCSS.value}
  <\/style>`
  }
  ${
    framework === "unocss"
      ? `<script>
    // UnoCSS config MUST be set BEFORE the runtime script loads
    window.__unocss = ${configJSON.value};
  <\/script>`
      : ""
  }
  ${frameworkScripts.value}
  <style>
    html,
    body {
      width: 100%;
      min-height: 100%;
    }

    body {
      position: relative;
      margin: 0;
      padding: 0;
      min-height: 100vh;
      opacity: 0;
      transition: opacity 120ms ease-out;
    }

    [${STAGE_CONTENT_ROOT_ATTR}] button[data-aria-type="Button"],
    [${STAGE_CONTENT_ROOT_ATTR}] button[data-aria-type="button"] {
      -webkit-appearance: none !important;
      appearance: none !important;
      background-image: none !important;
      box-shadow: none;
      border: 0 solid transparent;
      font: inherit;
      color: inherit;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-align: inherit;
    }

    [${STAGE_CONTENT_ROOT_ATTR}] {
      position: relative;
      min-height: 100%;
    }

    [${STAGE_CONTENT_ROOT_ATTR}] [${CANVAS_DISABLED_ATTRIBUTE}="true"] {
      cursor: not-allowed;
      opacity: 0.5;
    }

    [${STAGE_CONTENT_ROOT_ATTR}] [${CANVAS_DISABLED_ATTRIBUTE}="true"] * {
      cursor: inherit;
    }

    [${STAGE_OVERLAY_ROOT_ATTR}] {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: ${IFRAME_Z_INDEX.overlay};
      overflow: visible;
    }
    
    ${getStageDropFeedbackCss()}

    ${getStageImageDefaultsCss()}

    ${STAGE_SCREEN_READER_UTILITY_CSS}
  <\/style>
</head>
<body>
  <div ${STAGE_CONTENT_ROOT_ATTR}></div>
  <div ${STAGE_OVERLAY_ROOT_ATTR} aria-hidden="true"></div>
</body>
</html>`;
  });

  return {
    frameworkScripts,
    googleFontsLinks,
    customFontsCSS,
    iframeHtml,
  };
}
