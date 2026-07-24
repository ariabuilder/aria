import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cmsSaveCollection,
  type CmsStorageExecutor,
} from "../../lib/cms/storage";
import {
  buildAriaCollection,
  buildStarterCollectionDefinitions,
} from "../../lib/storage/starterContent";
import { STARTER_LAYOUT_IDS } from "../../lib/storage/starterLayoutIds";
import { STARTER_PAGE_ID } from "../../lib/storage/starterPages";
import {
  buildBootstrapSql,
  buildClaimUrl,
  isRemoteDatabaseEmpty,
  resolveSiteUrl,
} from "../../scripts/bootstrap-remote-storage";

const wranglerSiteUrlFixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wrangler-site-url.toml",
);

describe("bootstrap-remote-storage", () => {
  it("builds transaction-free canonical bootstrap SQL covering all starter content", async () => {
    const sql = await buildBootstrapSql();

    expect(sql).toContain("INSERT OR IGNORE INTO aria_layout_versions");
    expect(sql).toContain("INSERT OR IGNORE INTO aria_layout_meta");
    expect(sql).toContain("INSERT OR IGNORE INTO aria_page_versions");
    expect(sql).toContain("INSERT OR IGNORE INTO aria_page_meta");
    expect(STARTER_LAYOUT_IDS).toHaveLength(4);
    for (const layoutId of STARTER_LAYOUT_IDS) {
      expect(sql).toContain(`'${layoutId}'`);
    }
    expect(sql).toMatch(
      new RegExp(
        `aria_page_meta[\\s\\S]*?VALUES \\('${STARTER_PAGE_ID}', '${STARTER_PAGE_ID}'`,
      ),
    );
    expect(sql).toContain("'not-found'");
    expect(sql).toContain("'cms-collection'");
    expect(sql).toContain("'cms-entry'");
    expect(sql).toContain("INSERT INTO aria_collections");
    expect(sql).toContain("ON CONFLICT(name) DO UPDATE SET");
    expect(sql).not.toContain("ON CONFLICT(id) DO UPDATE SET");
    expect(sql).toContain(
      "(SELECT id FROM aria_collections WHERE name = 'tags' LIMIT 1)",
    );
    expect(sql).toContain(
      "(SELECT id FROM aria_collections WHERE name = 'authors' LIMIT 1)",
    );
    expect(sql).toContain(
      "(SELECT id FROM aria_collections WHERE name = 'blog' LIMIT 1)",
    );
    expect(sql).toContain("'blog'");
    expect(sql).toContain("'authors'");
    expect(sql).toContain("'tags'");
    expect(sql).toContain("'tag-archive'");
    expect(sql).toContain("'/tags/{slug}'");
    expect(sql).toContain("'main-nav'");
    expect(sql).not.toContain("'primary-navigation'");
    expect(sql).toContain("'pages-components-and-composer'");
    expect(sql).toContain("'cms-and-dynamic-data'");
    expect(sql).toContain("'ai-engineer-and-mcp'");
    expect(sql).toContain("INSERT OR IGNORE INTO aria_entry_relations");
    expect(sql).toContain("INSERT OR IGNORE INTO aria_styles");
    expect(sql).toContain("INSERT OR IGNORE INTO aria_site_settings");
    expect(sql).not.toContain("BEGIN TRANSACTION");
    expect(sql).not.toContain("COMMIT");
    expect(sql).not.toMatch(/VALUES \([^)]*\?/);
  });

  it("disables icon packs and UnoCSS utilities in starter settings", async () => {
    const sql = await buildBootstrapSql();
    const settingsMatch = sql.match(
      /INSERT OR IGNORE INTO aria_site_settings[\s\S]*?VALUES \('default', '([\s\S]*?)', '/,
    );
    expect(settingsMatch).not.toBeNull();
    const settings = JSON.parse(settingsMatch![1].replace(/''/g, "'"));

    expect(settings).toMatchObject({
      utilityEngine: "custom",
      icons: { enabledPacks: { lucide: false, "coreui-brands": false } },
      localization: {
        content: {
          defaultLocale: "en",
          locales: [{ code: "en", label: "English", enabled: true, fallbacks: [] }],
        },
      },
      system: {
        createdWith: {
          aria: { version: expect.any(String) },
          astro: { major: expect.any(Number), version: expect.any(String) },
          capturedAt: expect.any(String),
          runtime: "cloudflare",
          storageSchemaVersion: "baseline",
        },
        projectCreatedAt: expect.any(String),
      },
    });
    expect(settings).not.toHaveProperty("appearance");
    expect(settings).not.toHaveProperty("utilityLibraries");
  });

  it("only seeds a remote database when Wrangler reports it empty", () => {
    expect(
      isRemoteDatabaseEmpty(
        JSON.stringify([{ success: true, results: [{ is_empty: 1 }] }]),
      ),
    ).toBe(true);
    expect(
      isRemoteDatabaseEmpty(
        JSON.stringify([{ success: true, results: [{ is_empty: 0 }] }]),
      ),
    ).toBe(false);
    expect(() => isRemoteDatabaseEmpty(JSON.stringify([{ success: true, results: [] }]))).toThrow(
      /determine/i,
    );
  });

  it("builds a first-admin claim URL from the deployed site URL", () => {
    expect(buildClaimUrl("https://demo.aria.build/some/path?x=1#y")).toBe(
      "https://demo.aria.build/admin/setup",
    );
    expect(buildClaimUrl("   ")).toBeNull();
  });

  it("resolves the claim URL from CLI args, env, or wrangler.toml vars", () => {
    expect(
      resolveSiteUrl({
        argv: ["--site-url=https://cli.aria.build/app"],
        env: {},
        wranglerTomlPath: "/does/not/exist",
      }),
    ).toBe("https://cli.aria.build/admin/setup");

    expect(
      resolveSiteUrl({
        argv: [],
        env: { SITE_URL: "https://env.aria.build" },
        wranglerTomlPath: "/does/not/exist",
      }),
    ).toBe("https://env.aria.build/admin/setup");

    expect(
      resolveSiteUrl({
        argv: [],
        env: {},
        wranglerTomlPath: wranglerSiteUrlFixturePath,
      }),
    ).toBe("https://fixture.aria.build/admin/setup");
  });
});

describe("bootstrap SQL idempotency", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    const schemaPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../migrations/0001_baseline_schema.sql",
    );
    await client.executeMultiple(await readFile(schemaPath, "utf8"));
  });

  afterEach(async () => {
    client.close();
  });

  it("applies twice without error when collections use UUID ids", async () => {
    const now = "2026-07-03T00:00:00.000Z";
    const tagsUuid = "a1803cad-6c78-4a8b-85f7-b02bb8ec208d";
    const authorsUuid = "afdb3402-6c34-43c6-81ae-8a5d2a69dee6";
    const blogUuid = "cfd79bac-1ba5-488b-b218-c2e151718086";

    const executor: CmsStorageExecutor = {
      queryAll: async <T extends Record<string, unknown>>(
        sql: string,
        args: unknown[] = [],
      ) => {
        const result = await client.execute({ sql, args: args as never[] });
        return result.rows as unknown as T[];
      },
      queryFirst: async <T extends Record<string, unknown>>(
        sql: string,
        args: unknown[] = [],
      ) => {
        const result = await client.execute({ sql, args: args as never[] });
        return (result.rows[0] as unknown as T | undefined) ?? null;
      },
      run: async (sql: string, args: unknown[] = []) => {
        await client.execute({ sql, args: args as never[] });
      },
      batch: async (statements) => {
        await client.batch(
          statements.map((statement) => ({
            sql: statement.sql,
            args: (statement.args ?? []) as never[],
          })),
          "write",
        );
      },
    };

    const definitions = buildStarterCollectionDefinitions({
      collectionIdByName: {
        tags: tagsUuid,
        authors: authorsUuid,
      },
    });

    await cmsSaveCollection(
      executor,
      buildAriaCollection({ ...definitions.tags, id: tagsUuid }, now),
    );
    await cmsSaveCollection(
      executor,
      buildAriaCollection({ ...definitions.authors, id: authorsUuid }, now),
    );
    await cmsSaveCollection(
      executor,
      buildAriaCollection({ ...definitions.blog, id: blogUuid }, now),
    );

    const sql = await buildBootstrapSql();
    await client.executeMultiple(sql);
    await expect(client.executeMultiple(sql)).resolves.not.toThrow();

    const entryCount = await client.execute({
      sql: `SELECT COUNT(*) AS count FROM aria_entry_locales`,
      args: [],
    });
    const starterTag = await client.execute({
      sql: `SELECT l.collection_id, c.id AS collection_uuid
            FROM aria_entry_locales l
            JOIN aria_collections c ON c.id = l.collection_id
            WHERE l.slug = 'getting-started'
            LIMIT 1`,
      args: [],
    });

    expect(Number(entryCount.rows[0]?.count)).toBe(9);
    expect(String(starterTag.rows[0]?.collection_id)).toBe(tagsUuid);
    expect(String(starterTag.rows[0]?.collection_uuid)).toBe(tagsUuid);
  });
});
