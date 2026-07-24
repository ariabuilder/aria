import fs from "fs/promises";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  AuthorshipColumnTargetSchema,
  AuthorshipTableNameSchema,
  getAuthorshipColumnTargets,
  getAuthorshipColumnsForTable,
  getAuthorshipMigrationStatements,
} from "../../../lib/authorship/schemaMigrations";
import {
  ASSET_ROW_AUTHORSHIP_COLUMNS,
  MEDIA_ASSET_DELETE_AUTHORSHIP_COLUMNS,
  VERSION_AUTHORSHIP_COLUMNS,
} from "../../../lib/authorship/storageTargets";

describe("schemaMigrations", () => {
  it("defines column targets for every authorship table", () => {
    const targets = getAuthorshipColumnTargets();

    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(() => AuthorshipColumnTargetSchema.parse(target)).not.toThrow();
    }

    const versionTargets = targets.filter((target) =>
      target.table.endsWith("_versions"),
    );
    expect(versionTargets).toHaveLength(VERSION_AUTHORSHIP_COLUMNS.length * 3);
  });

  it("maps singleton tables to row-level actor columns", () => {
    expect(getAuthorshipColumnsForTable("aria_styles")).toEqual(
      ASSET_ROW_AUTHORSHIP_COLUMNS,
    );
    expect(getAuthorshipColumnsForTable("aria_media_assets")).toEqual([
      ...ASSET_ROW_AUTHORSHIP_COLUMNS,
      ...MEDIA_ASSET_DELETE_AUTHORSHIP_COLUMNS,
    ]);
  });

  it("keeps every authorship column defined statically in the baseline schema", async () => {
    // The baseline schema (aria/migrations/0001_baseline_schema.sql) declares
    // authorship columns directly on each CREATE TABLE statement instead of
    // via incremental ALTER TABLE migrations. This guards against drift
    // between the canonical column list here and the checked-in baseline —
    // `ensureAuthorshipColumnsAndBackfill()` in sqlite.ts is only a defensive
    // safety net, not the source of truth.
    const baselinePath = path.resolve(
      process.cwd(),
      "aria/migrations/0001_baseline_schema.sql",
    );
    const baselineSql = await fs.readFile(baselinePath, "utf-8");

    for (const target of getAuthorshipColumnTargets()) {
      const createTableMatch = new RegExp(
        `CREATE TABLE IF NOT EXISTS ${target.table} \\(([\\s\\S]*?)\\n\\);`,
        "u",
      ).exec(baselineSql);
      expect(createTableMatch, `missing CREATE TABLE for ${target.table}`).not
        .toBeNull();

      const columnPattern = new RegExp(`\\b${target.column}\\b`, "u");
      expect(
        columnPattern.test(createTableMatch![1]),
        `missing column ${target.column} on ${target.table}`,
      ).toBe(true);
    }

    expect(getAuthorshipMigrationStatements().length).toBe(
      getAuthorshipColumnTargets().length,
    );
  });

  it("parses every target table name", () => {
    for (const target of getAuthorshipColumnTargets()) {
      expect(AuthorshipTableNameSchema.parse(target.table)).toBe(target.table);
    }
  });
});
