import { describe, expect, it } from "vitest";

import { getAuthorshipColumnTargets } from "../../../lib/authorship/schemaMigrations";
import {
  STAMPING_ASSET_ROW_COLUMN_NAMES,
  STAMPING_MEDIA_DELETE_COLUMN_NAMES,
  STAMPING_VERSION_COLUMN_NAMES,
} from "../../../lib/authorship/stamping";

describe("authorship storage target sync", () => {
  it("includes all version columns targeted by stamping helpers", () => {
    const migrated = new Set(
      getAuthorshipColumnTargets()
        .filter((target) => target.table.endsWith("_versions"))
        .map((target) => target.column),
    );

    for (const column of STAMPING_VERSION_COLUMN_NAMES) {
      expect(migrated.has(column)).toBe(true);
    }
  });

  it("includes singleton and media asset columns targeted by stamping helpers", () => {
    const migrated = new Set(
      getAuthorshipColumnTargets().map(
        (target) => `${target.table}.${target.column}`,
      ),
    );

    for (const column of STAMPING_ASSET_ROW_COLUMN_NAMES) {
      expect(migrated.has(`aria_media_assets.${column}`)).toBe(true);
      expect(migrated.has(`aria_site_settings.${column}`)).toBe(true);
      expect(migrated.has(`aria_page_metadata.${column}`)).toBe(true);
      expect(migrated.has(`aria_styles.${column}`)).toBe(true);
    }

    for (const column of STAMPING_MEDIA_DELETE_COLUMN_NAMES) {
      expect(migrated.has(`aria_media_assets.${column}`)).toBe(true);
    }
  });
});
