import { describe, expect, it } from "vitest";

import { resolveStageMediaSrc } from "../../../admin/features/Stage/utils/imagePresentation";

describe("resolveStageMediaSrc", () => {
  it("normalizes bare cms filenames to uploads paths", () => {
    expect(resolveStageMediaSrc("face-7c4f59.webp")).toBe(
      "/uploads/face-7c4f59.webp",
    );
  });

  it("resolves cms image objects stored with filename mediaId values", () => {
    expect(
      resolveStageMediaSrc({
        mediaId: "Breanne.webp",
        alt: "Breanne.webp",
      }),
    ).toBe("/uploads/Breanne.webp");
  });

  it("promotes same-origin paths to absolute urls for the stage iframe", () => {
    expect(
      resolveStageMediaSrc("/uploads/Breanne.webp", {
        origin: "http://localhost:4321",
      }),
    ).toBe("http://localhost:4321/uploads/Breanne.webp");
  });
});
