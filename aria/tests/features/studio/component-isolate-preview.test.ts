import { describe, expect, it } from "vitest";

import { generateComponentIsolateHtml } from "@/features/Studio/components/composables/componentPreviewLiveHtml";
import { COMPONENT_PREVIEW_ROOT_ATTR } from "@/lib/schemas/componentPreview";
import { EMPTY_PAGE_PREVIEW_RENDER_STYLES } from "@/features/Studio/pages/composables/pagePreviewTypes";

describe("generateComponentIsolateHtml", () => {
  it("renders isolate preview root without forcing desktop canvas width", () => {
    const html = generateComponentIsolateHtml({
      nodes: [
        {
          id: "btn-1",
          type: "button",
          props: {},
          styles: {},
          children: [],
          data: { type: "button", text: "Click me" },
        },
      ],
      settings: null,
      renderStyles: { ...EMPTY_PAGE_PREVIEW_RENDER_STYLES },
      pageCssVariables: {},
    });

    expect(html).toContain(`data-aria-component-preview-root`);
    expect(html).toContain(COMPONENT_PREVIEW_ROOT_ATTR);
    expect(html).toContain("component-isolate-preview");
    expect(html).not.toContain("width: 1280px");
    expect(html).toContain('class="component-isolate-preview"');
    expect(html).toContain("width:1440px");
  });

  it("uses runtime-safe UnoCSS tags when the utility engine is unocss", () => {
    const html = generateComponentIsolateHtml({
      nodes: [],
      settings: {
        utilityEngine: "unocss",
        unocssConfig: {
          rules: [["demo-rule", { color: "red" }]],
        },
      },
      renderStyles: { ...EMPTY_PAGE_PREVIEW_RENDER_STYLES },
      pageCssVariables: {},
    });

    expect(html).toContain("window.__unocss_runtime");
    expect(html).not.toContain("window.__unocss =");
  });

  it("disables autoplaying videos in component preview iframes", () => {
    const html = generateComponentIsolateHtml({
      nodes: [
        {
          id: "video-1",
          type: "video",
          props: {
            src: "/uploads/demo.mp4",
            autoplay: true,
            muted: true,
            preload: "auto",
          },
          styles: {},
          children: [],
        },
      ],
      settings: null,
      renderStyles: { ...EMPTY_PAGE_PREVIEW_RENDER_STYLES },
      pageCssVariables: {},
    });

    expect(html).toContain("<video");
    expect(html).toContain('src="/uploads/demo.mp4"');
    expect(html).not.toMatch(/<video[^>]*\sautoplay(?:[\s=>]|$)/i);
    expect(html).toContain('preload="metadata"');
    expect(html).toContain("pausePreviewVideos");
  });
});
