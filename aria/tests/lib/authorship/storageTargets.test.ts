import { describe, expect, it } from "vitest";

import {
  AUTHORSHIP_STORAGE_TARGETS,
  SINGLETON_AUTHORSHIP_TABLES,
  VERSION_AUTHORSHIP_COLUMNS,
  VERSIONED_ASSET_META,
} from "../../../lib/authorship/storageTargets";

describe("AUTHORSHIP_STORAGE_TARGETS", () => {
  it("defines version columns for Phase 4 migrations", () => {
    expect(VERSION_AUTHORSHIP_COLUMNS).toEqual([
      "created_by_id",
      "created_by_username",
      "created_by_email",
      "created_by_avatar_url",
    ]);
  });

  it("maps versioned assets without meta actor columns", () => {
    expect(VERSIONED_ASSET_META.page.versionTable).toBe("aria_page_versions");
    expect(VERSIONED_ASSET_META.page.pointers).toContain("published_version");
    expect(SINGLETON_AUTHORSHIP_TABLES).toContain("aria_media_assets");
  });

  it("exposes a single catalog object", () => {
    expect(AUTHORSHIP_STORAGE_TARGETS.versionColumns).toBe(
      VERSION_AUTHORSHIP_COLUMNS,
    );
    expect(AUTHORSHIP_STORAGE_TARGETS.mediaLocationsNote).toMatch(
      /aria_media_locations/,
    );
  });
});
