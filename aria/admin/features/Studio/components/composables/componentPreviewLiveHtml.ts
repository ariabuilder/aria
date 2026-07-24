import { getSiteSettingsUtilityEngine } from "@/lib/storage/adapter";
import { nodesToHtmlFragment } from "../../../../../lib/blocks/nodesToHtml";
import { stripComponentPreviewAutoplayMedia } from "@/lib/rendering/componentSnapshots";
import { getUnoCSSTags } from "@/lib/styles/user-uno";
import { DEFAULT_BREAKPOINTS } from "../../../../../lib/types/nodes";
import { COMPONENT_PREVIEW_ROOT_ATTR } from "@/lib/schemas/componentPreview";
import {
  cssVariablesToString,
  escapeHtml,
  type GenerateLiveHtmlInput,
} from "@/features/Studio/pages/composables/pagePreviewLiveHtml";
import { THEME_STYLES } from "@/features/Studio/pages/composables/pagePreviewConstants";
import {
  COMPONENT_ISOLATE_STYLES,
  buildComponentIsolateBodyStyle,
} from "./componentPreviewConstants";
import { DEFAULT_DESKTOP_CANVAS_WIDTH } from "@/lib/styles/responsiveBreakpoints";
import type { IconRenderResources } from "../../../../../lib/icons/iconRenderResources";

export type GenerateComponentIsolateHtmlInput = GenerateLiveHtmlInput & {
  frameWidth?: number;
  iconResources?: IconRenderResources;
};

export function generateComponentIsolateHtml(
  input: GenerateComponentIsolateHtmlInput,
): string {
  const frameWidth = Math.max(
    1,
    Math.round(input.frameWidth ?? DEFAULT_DESKTOP_CANVAS_WIDTH),
  );
  const bodyContent = nodesToHtmlFragment(
    input.nodes,
    0,
    DEFAULT_BREAKPOINTS,
    "stylesheet",
    input.iconResources,
  );
  const framework = getSiteSettingsUtilityEngine(input.settings);

  const frameworkAssets =
    framework === "unocss"
      ? getUnoCSSTags(input.settings ?? undefined)
      : framework === "custom" && input.settings?.customFrameworkURL
        ? `<link rel="stylesheet" href="${escapeHtml(input.settings.customFrameworkURL)}">`
        : "";

  const pageVariables = cssVariablesToString(input.pageCssVariables);
  const compiledStyles = input.renderStyles.globalCSS?.trim()
    ? input.renderStyles.globalCSS
    : [input.renderStyles.baseCSS, input.renderStyles.utilityCSS]
        .filter(Boolean)
        .join("\n\n");

  return stripComponentPreviewAutoplayMedia(`<!DOCTYPE html>
<html lang="en" class="component-isolate-preview">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Component Preview</title>
  <style>${THEME_STYLES}</style>
  <style>${COMPONENT_ISOLATE_STYLES}</style>
  <style>${compiledStyles}</style>
  <style>${pageVariables}</style>
  ${frameworkAssets}
  <script>
    (() => {
      const pausePreviewVideos = () => {
        document.querySelectorAll('video').forEach((video) => {
          video.autoplay = false;
          video.removeAttribute('autoplay');
          if (video.preload === 'auto') video.preload = 'metadata';
          try {
            video.pause();
            video.currentTime = 0;
          } catch {}
        });
      };
      document.addEventListener('DOMContentLoaded', pausePreviewVideos, { once: true });
      window.addEventListener('load', pausePreviewVideos, { once: true });
      pausePreviewVideos();
    })();
  </script>
</head>
<body class="preview-mode component-isolate-preview" style="${buildComponentIsolateBodyStyle(frameWidth)}">
  <div ${COMPONENT_PREVIEW_ROOT_ATTR}>${bodyContent}</div>
</body>
</html>`);
}
