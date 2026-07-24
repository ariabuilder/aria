import { describe, expect, it } from "vitest";

import { getStageImageDefaultsCss } from "../../../admin/features/Stage/styles/stageImageDefaults";

describe("getStageImageDefaultsCss", () => {
  it("uses zero-specificity selectors so node styles can override", () => {
    const css = getStageImageDefaultsCss();

    expect(css).toContain(":where([data-aria-stage-content-root])");
    expect(css).toContain(":where(img[data-aria-type=\"image\"])");
  });

  it("caps images to their parent container on the canvas", () => {
    const css = getStageImageDefaultsCss();

    expect(css).toContain("max-width: 100%");
    expect(css).toContain("max-height: 100%");
    expect(css).toContain("min-height: 0");
    expect(css).not.toContain("width: auto");
    expect(css).not.toContain("height: auto");
  });

  it("styles empty-src images as bounded placeholders", () => {
    const css = getStageImageDefaultsCss();

    expect(css).toContain(":where(img[data-aria-image-empty=\"true\"])");
    expect(css).toContain("aspect-ratio: 16 / 9");
    expect(css).toContain("object-fit: none");
  });
});
