import { describe, expect, it } from "vitest";
import { buildPageSeoUpdatePayload } from "../../admin/features/Studio/pages/composables/useDebouncedPageSeoSave";

describe("buildPageSeoUpdatePayload", () => {
  it("sends explicit false for noindex and nofollow when disabled", () => {
    expect(
      buildPageSeoUpdatePayload({
        title: "Home",
        noindex: false,
        nofollow: false,
      }),
    ).toEqual({
      title: "Home",
      noindex: false,
      nofollow: false,
    });
  });

  it("preserves noindex true when page is hidden from search", () => {
    expect(
      buildPageSeoUpdatePayload({
        noindex: true,
        nofollow: true,
      }),
    ).toEqual({
      noindex: true,
      nofollow: true,
    });
  });

  it("defaults booleans to false when seo settings are missing", () => {
    expect(buildPageSeoUpdatePayload(undefined)).toEqual({
      noindex: false,
      nofollow: false,
    });
  });
});
