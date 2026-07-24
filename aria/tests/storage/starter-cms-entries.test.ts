import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import {
  STARTER_AUTHOR_ARIA_TEAM_SLUG,
  STARTER_BLOG_AI_ENGINEER_MCP_SLUG,
  STARTER_BLOG_CMS_DYNAMIC_DATA_SLUG,
  STARTER_BLOG_PAGES_COMPOSER_SLUG,
  STARTER_MAIN_NAV_SLUG,
  STARTER_TAG_AI_ENGINEER_SLUG,
  STARTER_TAG_CMS_SLUG,
  STARTER_TAG_COMPOSER_SLUG,
  STARTER_TAG_GETTING_STARTED_SLUG,
  buildStarterAuthorEntryRecord,
  buildStarterBlogEntryRecords,
  buildStarterCmsEntryRecords,
  buildStarterTagEntryRecords,
  seedStarterCmsEntriesIfMissing,
} from "../../lib/storage/starterCmsEntries";
import { cmsSaveCollection } from "../../lib/cms/storage/collections";
import type { CmsStorageExecutor } from "../../lib/cms/storage/executor";
import {
  buildAriaCollection,
  buildStarterCollectionDefinitions,
} from "../../lib/storage/starterContent";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import {
  buildBootstrapSql,
  buildStarterCmsEntriesOnlySql,
} from "../../scripts/bootstrap-remote-storage";

describe("starterCmsEntries", () => {
  it("builds valid tag, author, and blog records", () => {
    const now = "2026-07-03T00:00:00.000Z";
    const tags = buildStarterTagEntryRecords(now);
    const author = buildStarterAuthorEntryRecord(now);
    const tagIdsBySlug = Object.fromEntries(
      tags.map((record) => [record.locales[0]!.slug, record.entry.id]),
    );
    const blogPosts = buildStarterBlogEntryRecords(now, {
      authorId: author.entry.id,
      tagIdsBySlug,
    });

    expect(tags.map((record) => record.locales[0]?.slug)).toEqual([
      STARTER_TAG_GETTING_STARTED_SLUG,
      STARTER_TAG_COMPOSER_SLUG,
      STARTER_TAG_CMS_SLUG,
      STARTER_TAG_AI_ENGINEER_SLUG,
    ]);
    expect(author.locales[0]?.slug).toBe(STARTER_AUTHOR_ARIA_TEAM_SLUG);
    expect(blogPosts.map((record) => record.locales[0]?.slug)).toEqual([
      STARTER_BLOG_PAGES_COMPOSER_SLUG,
      STARTER_BLOG_CMS_DYNAMIC_DATA_SLUG,
      STARTER_BLOG_AI_ENGINEER_MCP_SLUG,
    ]);
    expect(blogPosts[0]?.locales[0]?.frontmatter).toMatchObject({
      featured: true,
      category: "Design",
    });
    expect(blogPosts[0]?.relations).toHaveLength(2);
  });

  it("buildStarterCmsEntryRecords returns the main navigation and 8 CMS entries", () => {
    const records = buildStarterCmsEntryRecords("2026-07-03T00:00:00.000Z");
    expect(records).toHaveLength(9);
    expect(records[0]?.locales[0]?.slug).toBe(STARTER_MAIN_NAV_SLUG);
    expect(records[0]?.locales[0]?.frontmatter).toMatchObject({
      location: "header",
      items: [
        { label: "Home" },
        { label: "Blog" },
      ],
    });
  });
});

describe("seedStarterCmsEntriesIfMissing", () => {
  let client: Client;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "aria-starter-cms-entries-")),
      "starter-cms.sqlite",
    );
    client = createClient({ url: `file:${dbPath}` });
  });

  afterEach(async () => {
    client.close();
    await fs.rm(path.dirname(dbPath), { recursive: true, force: true });
  });

  it("seeds blog content idempotently on fresh starter CMS installs", async () => {
    const adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: true,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
    });
    await adapter.getPageDSL("blog");

    const executor = {
      queryAll: async (sql: string, args: unknown[] = []) => {
        const result = await client.execute({ sql, args: args as never[] });
        return result.rows;
      },
      queryFirst: async (sql: string, args: unknown[] = []) => {
        const result = await client.execute({ sql, args: args as never[] });
        return result.rows[0] ?? null;
      },
      run: async (sql: string, args: unknown[] = []) => {
        await client.execute({ sql, args: args as never[] });
      },
    } as CmsStorageExecutor;

    await seedStarterCmsEntriesIfMissing(executor, "2026-07-03T00:00:00.000Z");

    const countAfterFirst = await client.execute({
      sql: `SELECT COUNT(*) AS count FROM aria_entry_locales`,
      args: [],
    });
    await seedStarterCmsEntriesIfMissing(executor, "2026-07-03T00:00:00.000Z");
    const countAfterSecond = await client.execute({
      sql: `SELECT COUNT(*) AS count FROM aria_entry_locales`,
      args: [],
    });

    expect(Number(countAfterFirst.rows[0]?.count)).toBe(9);
    expect(Number(countAfterSecond.rows[0]?.count)).toBe(9);

    const blogSlugs = await client.execute({
      sql: `SELECT l.slug
            FROM aria_collections c
            JOIN aria_entry_locales l ON l.collection_id = c.id
            WHERE c.name = 'blog'
            ORDER BY l.slug ASC`,
      args: [],
    });
    expect(blogSlugs.rows.map((row) => String(row.slug))).toEqual([
      STARTER_BLOG_AI_ENGINEER_MCP_SLUG,
      STARTER_BLOG_CMS_DYNAMIC_DATA_SLUG,
      STARTER_BLOG_PAGES_COMPOSER_SLUG,
    ]);
  });

  it("repairs missing tags/authors collections when blog already exists", async () => {
    const now = "2026-07-03T00:00:00.000Z";
    const adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: true,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
    });
    await adapter.getPageDSL("blog");

    await client.execute({
      sql: `DELETE FROM aria_collections WHERE name IN ('tags', 'authors')`,
      args: [],
    });

    const executor = {
      queryAll: async (sql: string, args: unknown[] = []) => {
        const result = await client.execute({ sql, args: args as never[] });
        return result.rows;
      },
      queryFirst: async (sql: string, args: unknown[] = []) => {
        const result = await client.execute({ sql, args: args as never[] });
        return result.rows[0] ?? null;
      },
      run: async (sql: string, args: unknown[] = []) => {
        await client.execute({ sql, args: args as never[] });
      },
    } as CmsStorageExecutor;

    await expect(
      seedStarterCmsEntriesIfMissing(executor, now),
    ).resolves.toBeUndefined();

    const collections = await client.execute({
      sql: `SELECT name FROM aria_collections WHERE name IN ('tags', 'authors', 'blog') ORDER BY name ASC`,
      args: [],
    });
    const entryCount = await client.execute({
      sql: `SELECT COUNT(*) AS count FROM aria_entry_locales`,
      args: [],
    });

    expect(collections.rows.map((row) => String(row.name))).toEqual([
      "authors",
      "blog",
      "tags",
    ]);
    expect(Number(entryCount.rows[0]?.count)).toBe(9);
  });

  it("seeds starter entries into Studio-style UUID-backed collections", async () => {
    const now = "2026-07-03T00:00:00.000Z";
    const tagsUuid = "a1803cad-6c78-4a8b-85f7-b02bb8ec208d";
    const authorsUuid = "afdb3402-6c34-43c6-81ae-8a5d2a69dee6";
    const blogUuid = "cfd79bac-1ba5-488b-b218-c2e151718086";

    const adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
    });
    await adapter.getPageDSL("index");

    const executor = {
      queryAll: async (sql: string, args: unknown[] = []) => {
        const result = await client.execute({ sql, args: args as never[] });
        return result.rows;
      },
      queryFirst: async (sql: string, args: unknown[] = []) => {
        const result = await client.execute({ sql, args: args as never[] });
        return result.rows[0] ?? null;
      },
      run: async (sql: string, args: unknown[] = []) => {
        await client.execute({ sql, args: args as never[] });
      },
    } as CmsStorageExecutor;

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

    await seedStarterCmsEntriesIfMissing(executor, now);

    const starterTag = await client.execute({
      sql: `SELECT l.collection_id, c.name, c.id AS collection_uuid
            FROM aria_entry_locales l
            JOIN aria_collections c ON c.id = l.collection_id
            WHERE l.slug = ?
            LIMIT 1`,
      args: [STARTER_TAG_GETTING_STARTED_SLUG],
    });
    const entryCount = await client.execute({
      sql: `SELECT COUNT(*) AS count FROM aria_entry_locales`,
      args: [],
    });

    expect(Number(entryCount.rows[0]?.count)).toBe(9);
    expect(String(starterTag.rows[0]?.name)).toBe("tags");
    expect(String(starterTag.rows[0]?.collection_id)).toBe(tagsUuid);
    expect(String(starterTag.rows[0]?.collection_uuid)).toBe(tagsUuid);
    expect(String(starterTag.rows[0]?.collection_id)).not.toBe("tags");
  });
});

describe("starter CMS bootstrap SQL", () => {
  it("includes CMS entry slugs in full bootstrap SQL", async () => {
    const sql = await buildBootstrapSql();
    expect(sql).toContain("ON CONFLICT(name) DO UPDATE SET");
    expect(sql).toContain("(SELECT id FROM aria_collections WHERE name = 'blog' LIMIT 1)");
    expect(sql).toContain("'main-nav'");
    expect(sql).not.toContain("'primary-navigation'");
    expect(sql).toContain(`'${STARTER_AUTHOR_ARIA_TEAM_SLUG}'`);
    expect(sql).toContain(`'${STARTER_BLOG_PAGES_COMPOSER_SLUG}'`);
    expect(sql).toContain(`'${STARTER_BLOG_CMS_DYNAMIC_DATA_SLUG}'`);
    expect(sql).toContain(`'${STARTER_BLOG_AI_ENGINEER_MCP_SLUG}'`);
    expect(sql).toContain("INSERT OR IGNORE INTO aria_entry_relations");
  });

  it("includes the main navigation entry in incremental bootstrap SQL", async () => {
    const sql = await buildStarterCmsEntriesOnlySql();
    expect(sql).toContain(`'${STARTER_BLOG_PAGES_COMPOSER_SLUG}'`);
    expect(sql).toContain(`'${STARTER_MAIN_NAV_SLUG}'`);
  });
});
