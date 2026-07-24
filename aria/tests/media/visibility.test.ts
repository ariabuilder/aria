import { describe, expect, it } from "vitest";
import {
  isHiddenMediaPath,
  isListableMediaPath,
} from "../../lib/media/utils/visibility";

describe("media visibility", () => {
  describe("isListableMediaPath", () => {
    it("rejects site export artifact paths", () => {
      expect(
        isListableMediaPath(
          "_exports/site/2a356334-24f8-4e22-87c8-4065f73479fb/aria-site-export-2026-05-31T12-00-00-000Z.zip",
        ),
      ).toBe(false);
      expect(
        isListableMediaPath(
          "_exports/site/2a356334-24f8-4e22-87c8-4065f73479fb/meta.json",
        ),
      ).toBe(false);
    });

    it("rejects import source artifact paths", () => {
      expect(
        isListableMediaPath(
          "_imports/wordpress/2a356334-24f8-4e22-87c8-4065f73479fb/site.xml",
        ),
      ).toBe(false);
    });

    it("still allows normal upload paths", () => {
      expect(isListableMediaPath("gallery/logo.svg")).toBe(true);
    });
  });

  describe("isHiddenMediaPath", () => {
    it("treats site export paths as hidden", () => {
      expect(
        isHiddenMediaPath(
          "_exports/site/2a356334-24f8-4e22-87c8-4065f73479fb/aria-site-export-2026-05-31T12-00-00-000Z.zip",
        ),
      ).toBe(true);
    });

    it("allows import source artifact paths for internal storage", () => {
      expect(
        isHiddenMediaPath(
          "_imports/wordpress/2a356334-24f8-4e22-87c8-4065f73479fb/site.xml",
        ),
      ).toBe(false);
    });
  });
});
