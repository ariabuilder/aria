#!/usr/bin/env node
/**
 * Idempotent backfill for starter CMS seeds on local SQLite.
 */

import { createClient } from "@libsql/client/node";
import { resolve } from "path";
import { pathToFileURL } from "url";

const dbPath = resolve(process.cwd(), "aria/storage/aria.db");
const client = createClient({ url: `file:${dbPath}` });

const { seedStarterMainNavCollectionIfMissing } = await import(
  pathToFileURL(resolve(process.cwd(), "aria/lib/storage/starterMainNav.ts")).href
);
const { seedStarterCmsEntriesIfMissing } = await import(
  pathToFileURL(resolve(process.cwd(), "aria/lib/storage/starterCmsEntries.ts")).href
);

const executor = {
  queryAll: async (sql, args = []) => {
    const result = await client.execute({ sql, args });
    return result.rows;
  },
  queryFirst: async (sql, args = []) => {
    const result = await client.execute({ sql, args });
    return result.rows[0] ?? null;
  },
  run: async (sql, args = []) => {
    await client.execute({ sql, args });
  },
};

const now = new Date().toISOString();
await seedStarterMainNavCollectionIfMissing(executor, now);
await seedStarterCmsEntriesIfMissing(executor, now);

const tagRows = await executor.queryAll(
  `SELECT l.slug
   FROM aria_collections c
   JOIN aria_entry_locales l ON l.collection_id = c.id
   WHERE c.name = 'tags'
   ORDER BY l.slug ASC`,
);
const blogRows = await executor.queryAll(
  `SELECT l.slug
   FROM aria_collections c
   JOIN aria_entry_locales l ON l.collection_id = c.id
   WHERE c.name = 'blog'
   ORDER BY l.slug ASC`,
);
const authorRow = await executor.queryFirst(
  `SELECT l.slug
   FROM aria_collections c
   JOIN aria_entry_locales l ON l.collection_id = c.id
   WHERE c.name = 'authors'
   LIMIT 1`,
);
const mainNavEntries = await executor.queryFirst(
  `SELECT COUNT(*) AS count
   FROM aria_collections c
   JOIN aria_entry_locales l ON l.collection_id = c.id
   WHERE c.name = 'main-nav'`,
);

console.log(
  JSON.stringify(
    {
      mainNav: {
        collection: "main-nav",
        entryCount: Number(mainNavEntries?.count ?? 0),
      },
      cmsEntries: {
        tags: tagRows.map((row) => String(row.slug)),
        author: authorRow?.slug ?? null,
        blog: blogRows.map((row) => String(row.slug)),
      },
    },
    null,
    2,
  ),
);

client.close();
