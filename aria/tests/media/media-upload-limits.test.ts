import { describe, expect, it } from "vitest";

import {
  exceedsMediaTransformInputLimit,
  MEDIA_TRANSFORM_INPUT_MAX_BYTES,
} from "../../lib/media/uploadLimits";

describe("media transform input limits", () => {
  it("allows raster images at the Cloudflare binding boundary", () => {
    expect(
      exceedsMediaTransformInputLimit({
        name: "hero.webp",
        type: "image/webp",
        size: MEDIA_TRANSFORM_INPUT_MAX_BYTES,
      }),
    ).toBe(false);
  });

  it("rejects raster images above the binding boundary", () => {
    expect(
      exceedsMediaTransformInputLimit({
        name: "hero.jpg",
        type: "image/jpeg",
        size: MEDIA_TRANSFORM_INPUT_MAX_BYTES + 1,
      }),
    ).toBe(true);
  });

  it("retains the broader upload allowance for non-transform media", () => {
    expect(
      exceedsMediaTransformInputLimit({
        name: "guide.pdf",
        type: "application/pdf",
        size: MEDIA_TRANSFORM_INPUT_MAX_BYTES + 1,
      }),
    ).toBe(false);
  });
});
