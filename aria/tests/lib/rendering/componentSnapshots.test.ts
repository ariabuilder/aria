import { describe, expect, it } from "vitest";
import { ICON_SNAPSHOT_VERSION } from "../../../lib/icons/generatedIconSnapshot";

import {
  extractComponentSnapshotRenderableHtml,
  hasCurrentComponentSnapshotVersion,
  prepareComponentSnapshotForThumbnailCapture,
  renderComponentIsolateSnapshotHtml,
  stripComponentSnapshotRuntimeAssets,
} from "../../../lib/rendering/componentSnapshots";

describe("componentSnapshots", () => {
  it("uses runtime-safe UnoCSS tags for live snapshot html", () => {
    const html = renderComponentIsolateSnapshotHtml({
      componentId: "hero-cta",
      nodes: [],
      settings: {
        utilityEngine: "unocss",
        unocssConfig: {
          shortcuts: { btn: "px-4 py-2" },
          rules: [["custom-rule", { color: "red" }]],
          safelist: ["text-center"],
        },
      },
      renderStyles: {
        globalCSS: ".preview { color: black; }",
        baseCSS: "",
        utilityCSS: "",
      },
      pageCssVariables: {},
    });

    expect(html).toContain("uno.global.js");
    expect(html).toContain("window.__unocss_runtime");
    expect(html).toContain("custom-rule");
    expect(html).not.toContain("window.__unocss =");
  });

  it("strips runtime assets for thumbnail capture responses", () => {
    const html = renderComponentIsolateSnapshotHtml({
      componentId: "hero-cta",
      nodes: [],
      settings: {
        utilityEngine: "unocss",
      },
      renderStyles: {
        globalCSS: ".preview { color: black; }",
        baseCSS: "",
        utilityCSS: "",
      },
      pageCssVariables: {},
    });

    const stripped = stripComponentSnapshotRuntimeAssets(html);

    expect(stripped).toContain(".preview { color: black; }");
    expect(stripped).not.toContain("uno.global.js");
    expect(stripped).not.toContain("window.__unocss_runtime");
  });

  it("extracts renderable html without storage markers for iframe srcdoc", () => {
    const html = `<!-- aria-component-snapshot:v1 -->
<!-- aria-component-snapshot:style-revision:abc -->
<!DOCTYPE html><html><body><div data-aria-component-preview-root>Preview</div></body></html>`;

    const extracted = extractComponentSnapshotRenderableHtml(html);

    expect(extracted.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(extracted).not.toContain("aria-component-snapshot");
    expect(extracted).toContain("data-aria-component-preview-root");
  });

  it("prepares thumbnail capture html from stored snapshot markers", () => {
    const html = renderComponentIsolateSnapshotHtml({
      componentId: "hero-cta",
      nodes: [],
      settings: { utilityEngine: "unocss" },
      renderStyles: {
        globalCSS: ".preview { color: black; }",
        baseCSS: "",
        utilityCSS: "",
      },
      pageCssVariables: {},
    });
    const stored = `<!-- aria-component-snapshot:v1 -->\n<!-- aria-component-snapshot:icon-snapshot:${ICON_SNAPSHOT_VERSION} -->\n<!-- aria-component-snapshot:style-revision:rev -->\n${html}`;
    const prepared = prepareComponentSnapshotForThumbnailCapture(stored);

    expect(prepared.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(prepared).not.toContain("uno.global.js");
    expect(prepared).toContain("data-aria-component-preview-root");
  });

  it("invalidates stored snapshots when component updatedAt changes", () => {
    const stored = `<!-- aria-component-snapshot:v1 -->
<!-- aria-component-snapshot:icon-snapshot:${ICON_SNAPSHOT_VERSION} -->
<!-- aria-component-snapshot:style-revision:rev -->
<!-- aria-component-snapshot:component-updated:old-revision -->
<!DOCTYPE html><html><body><div data-aria-component-preview-root>Preview</div></body></html>`;

    expect(
      hasCurrentComponentSnapshotVersion(stored, "rev", "old-revision"),
    ).toBe(true);
    expect(
      hasCurrentComponentSnapshotVersion(stored, "rev", "new-revision"),
    ).toBe(false);
  });

  it("strips google font assets for thumbnail capture responses", () => {
    const html = `<!DOCTYPE html><html><head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap">
  <style>@import url("https://fonts.googleapis.com/css2?family=Roboto:wght@400&display=swap");</style>
</head><body><div>Preview</div></body></html>`;

    const stripped = stripComponentSnapshotRuntimeAssets(html);

    expect(stripped).not.toContain("fonts.googleapis.com");
    expect(stripped).not.toContain("fonts.gstatic.com");
    expect(stripped).toContain("Preview");
  });

  it("removes video autoplay from component snapshot preview html", () => {
    const html = renderComponentIsolateSnapshotHtml({
      componentId: "video-card",
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
      renderStyles: {
        globalCSS: "",
        baseCSS: "",
        utilityCSS: "",
      },
      pageCssVariables: {},
    });

    expect(html).toContain("<video");
    expect(html).not.toMatch(/<video[^>]*\sautoplay(?:[\s=>]|$)/i);
    expect(html).toContain('preload="metadata"');
  });
});
