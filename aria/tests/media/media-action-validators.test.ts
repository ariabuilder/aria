import { describe, expect, it } from "vitest";
import {
  validateMediaObjectKey,
  validateSafeMediaFilename,
} from "../../lib/media/utils/action-validators";

describe("media action validators", () => {
  describe("validateMediaObjectKey", () => {
    it("accepts file paths and canonicalizes uploads prefix", () => {
      expect(validateMediaObjectKey("/uploads/gallery/hero.jpg")).toBe(
        "gallery/hero.jpg",
      );
      expect(validateMediaObjectKey("gallery/hero.jpg")).toBe(
        "gallery/hero.jpg",
      );
    });

    it("rejects directory-style paths", () => {
      expect(() => validateMediaObjectKey("/uploads/gallery/")).toThrow(
        "Directory paths are not allowed",
      );
      expect(() => validateMediaObjectKey("gallery/")).toThrow(
        "Directory paths are not allowed",
      );
    });

    it("rejects traversal paths", () => {
      expect(() => validateMediaObjectKey("../secrets.txt")).toThrow(
        "Invalid media key",
      );
    });

    it("rejects hidden media paths", () => {
      expect(() => validateMediaObjectKey("images/.DS_Store")).toThrow(
        "Hidden media paths are not allowed",
      );
    });

    it("rejects site export artifact paths", () => {
      expect(() =>
        validateMediaObjectKey(
          "_exports/site/2a356334-24f8-4e22-87c8-4065f73479fb/aria-site-export-2026-05-31T12-00-00-000Z.zip",
        ),
      ).toThrow("Hidden media paths are not allowed");
    });
  });

  describe("validateSafeMediaFilename", () => {
    it("accepts plain filenames", () => {
      expect(validateSafeMediaFilename("hero.jpg")).toBe("hero.jpg");
    });

    it("rejects names with path separators", () => {
      expect(() => validateSafeMediaFilename("folder/hero.jpg")).toThrow(
        "path separators",
      );
      expect(() => validateSafeMediaFilename("folder\\hero.jpg")).toThrow(
        "path separators",
      );
    });

    it("rejects dot-only names", () => {
      expect(() => validateSafeMediaFilename("..")).toThrow("Invalid filename");
      expect(() => validateSafeMediaFilename(".")).toThrow("Invalid filename");
    });

    it("rejects hidden filenames", () => {
      expect(() => validateSafeMediaFilename(".DS_Store")).toThrow(
        "Hidden filenames are not allowed",
      );
    });
  });
});
