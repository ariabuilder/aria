import {
  createClient,
  type Client,
  type InArgs,
  type InValue,
} from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";

import {
  formatLocalizationSchemaVerificationFailure,
  verifyLocalizationSchema,
} from "../../lib/storage/verifyLocalizationSchema";

let client: Client;

function toLibsqlArgs(values: readonly unknown[]): InArgs {
  return values.map((value): InValue => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint" ||
      typeof value === "boolean" ||
      value instanceof Uint8Array ||
      value instanceof Date
    ) {
      return value;
    }

    throw new TypeError("Unsupported localization verification SQL argument.");
  });
}

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await client.execute("PRAGMA foreign_keys = ON");
  const sql = await fs.readFile(
    path.resolve(process.cwd(), "aria/migrations/0001_baseline_schema.sql"),
    "utf8",
  );
  await client.executeMultiple(sql);
});

afterEach(() => client.close());

describe("pre-release baseline schema", () => {
  async function verify() {
    return verifyLocalizationSchema({
      async execute(sql, args = []) {
        const result = await client.execute({ sql, args: toLibsqlArgs(args) });
        return { rows: result.rows as Record<string, unknown>[] };
      },
    });
  }

  it("creates the complete localization and media foundation from 0001", async () => {
    const result = await client.execute(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN (
         'aria_page_locale_versions',
         'aria_page_locale_meta',
         'aria_page_locale_routes',
         'aria_locale_route_leases',
         'aria_layout_locale_versions',
         'aria_layout_locale_meta',
         'aria_cache_invalidation_jobs',
         'aria_media_profiles',
         'aria_media_source_versions',
         'aria_media_transform_variants'
       )
       ORDER BY name`,
    );

    expect(result.rows.map((row) => row.name)).toEqual([
      "aria_cache_invalidation_jobs",
      "aria_layout_locale_meta",
      "aria_layout_locale_versions",
      "aria_locale_route_leases",
      "aria_media_profiles",
      "aria_media_source_versions",
      "aria_media_transform_variants",
      "aria_page_locale_meta",
      "aria_page_locale_routes",
      "aria_page_locale_versions",
    ]);
    await expect(verify()).resolves.toMatchObject({ ok: true });
  });

  it("reports a stale recorded baseline without attempting repair", async () => {
    await client.execute(`DROP TABLE aria_locale_route_leases`);

    const result = await verify();

    expect(result.ok).toBe(false);
    expect(result.missingTables).toEqual(["aria_locale_route_leases"]);
    expect(formatLocalizationSchemaVerificationFailure(result)).toMatch(
      /reset\/reprovision/i,
    );
  });

  it("reports missing media transform tables without attempting repair", async () => {
    await client.execute(`DROP TABLE aria_media_transform_variants`);

    const result = await verify();

    expect(result.ok).toBe(false);
    expect(result.missingTables).toEqual(["aria_media_transform_variants"]);
    expect(formatLocalizationSchemaVerificationFailure(result)).toMatch(
      /reset\/reprovision/i,
    );
  });

  it("keeps draft and published route claims independently unique", async () => {
    await client.execute({
      sql: `INSERT INTO aria_page_versions
              (id, version, dsl_json, created_at)
            VALUES (?, ?, ?, ?)`,
      args: ["about", "source-v1", "{}", "2026-07-13T12:00:00.000Z"],
    });
    await client.execute({
      sql: `INSERT INTO aria_page_meta
              (id, slug, title, status, current_version, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        "about",
        "about",
        "About",
        "published",
        "source-v1",
        "2026-07-13T12:00:00.000Z",
      ],
    });
    await client.execute({
      sql: `INSERT INTO aria_page_locale_versions
              (page_id, locale, version, source_version, seo_json, dsl_json,
               translated_paths_json, source_manifest_hash, source_structure_hash,
               created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "about",
        "fr",
        "fr-v1",
        "source-v1",
        "{}",
        "{}",
        "[]",
        "a".repeat(16),
        "b".repeat(16),
        "2026-07-13T12:00:00.000Z",
      ],
    });
    await client.execute({
      sql: `INSERT INTO aria_page_locale_meta
              (page_id, locale, draft_version, published_version, current_version,
               published_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "about",
        "fr",
        "fr-v1",
        "fr-v1",
        "fr-v1",
        "2026-07-13T12:00:00.000Z",
        "2026-07-13T12:00:00.000Z",
      ],
    });

    await client.execute({
      sql: `INSERT INTO aria_page_locale_routes
              (locale, pathname_key, pathname, page_id, draft_claim, published_claim)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: ["fr", "/a-propos", "/a-propos", "about", 1, 1],
    });

    await expect(
      client.execute({
        sql: `INSERT INTO aria_page_locale_routes
                (locale, pathname_key, pathname, page_id, draft_claim, published_claim)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: ["fr", "/notre-equipe", "/notre-equipe", "about", 1, 0],
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });
});
