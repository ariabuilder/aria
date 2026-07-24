import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import type { AriaCloudflareEnv } from "../../lib/cloudflare/env";
import { createEmptyCollectionSchema } from "../../lib/cms/storage/db";
import type { AriaCollection, AriaEntryRecord } from "../../lib/cms/types";
import { CloudflareStorageAdapter } from "../../lib/storage/cloudflare";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { createD1Mock } from "../helpers/d1Mock";

type StorageAdapterUnderTest = SQLiteStorageAdapter | CloudflareStorageAdapter;

const now = "2026-06-25T12:00:00.000Z";

function createSampleCollection(): AriaCollection {
  const id = "col-posts-001";
  return {
    id,
    name: "posts",
    label: "Posts",
    kind: "content",
    schema: createEmptyCollectionSchema(id, "Posts", "content"),
    scope: "global",
    urlPattern: "/posts/{slug}",
    templatePageId: null,
    listPageId: null,
    supports: ["drafts", "revisions"],
    createdAt: now,
    updatedAt: now,
  };
}

function createSampleEntry(
  collectionId: string,
  version = "v1",
): AriaEntryRecord {
  const entryId = "entry-hello-001";
  return {
    entry: {
      id: entryId,
      collectionId,
      status: "draft",
      version,
      authorId: "author-001",
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      scheduledFor: null,
    },
    locales: [
      {
        entryId,
        collectionId,
        locale: "en",
        slug: "hello-world",
        title: "Hello World",
        frontmatter: { excerpt: "First post" },
        body: null,
        isSource: true,
      },
    ],
  };
}

async function expectCmsRoundTrip(
  adapter: StorageAdapterUnderTest,
): Promise<void> {
  const collection = createSampleCollection();
  const savedCollection = await adapter.saveCollection(collection);

  expect(savedCollection.name).toBe("posts");
  expect(await adapter.getCollection(collection.id)).toMatchObject({
    id: collection.id,
    label: "Posts",
  });
  expect(await adapter.getCollection("posts")).toMatchObject({
    id: collection.id,
  });

  const listed = await adapter.listCollections({ kind: "content" });
  expect(listed).toHaveLength(1);

  const record = createSampleEntry(savedCollection.id);
  const savedEntry = await adapter.saveEntry(record);

  expect(savedEntry.entry.version).toBe("v1");
  expect(savedEntry.locales[0]?.title).toBe("Hello World");

  const bySlug = await adapter.getEntry({
    collectionId: savedCollection.id,
    idOrSlug: "hello-world",
    locale: "en",
  });
  expect(bySlug?.entry.id).toBe(record.entry.id);

  const list = await adapter.listEntries({
    collectionId: savedCollection.id,
    locale: "en",
  });
  expect(list.total).toBe(1);

  await expect(
    adapter.saveEntry(
      {
        ...record,
        entry: { ...record.entry, version: "v2", updatedAt: now },
        locales: [
          {
            ...record.locales[0]!,
            title: "Updated title",
          },
        ],
      },
      { expectedVersion: "stale-version" },
    ),
  ).rejects.toThrow(/version conflict/i);

  const revision = await adapter.saveEntryRevision({
    id: "rev-001",
    entryId: record.entry.id,
    locale: "en",
    version: record.entry.version,
    snapshot: {
      entry: record.entry,
      locales: record.locales,
      relations: [],
    },
    actorId: "author-001",
    message: "Initial save",
    createdAt: now,
  });

  const revisions = await adapter.listEntryRevisions(record.entry.id);
  expect(revisions).toHaveLength(1);
  expect(revisions[0]?.id).toBe(revision.id);

  await adapter.deleteEntry(savedCollection.id, record.entry.id);
  expect(
    await adapter.getEntry({
      collectionId: savedCollection.id,
      idOrSlug: record.entry.id,
    }),
  ).toBeNull();

  await adapter.deleteCollection(savedCollection.id);
  expect(await adapter.getCollection(savedCollection.id)).toBeNull();
}

async function expectCmsStringBodyRoundTrip(
  adapter: StorageAdapterUnderTest,
): Promise<void> {
  const collection = createSampleCollection();
  const savedCollection = await adapter.saveCollection(collection);
  const htmlBody = "<p>Hello from imported HTML</p>";
  const record = createSampleEntry(savedCollection.id);

  await adapter.saveEntry({
    ...record,
    locales: [
      {
        ...record.locales[0]!,
        body: htmlBody,
      },
    ],
  });

  const savedEntry = await adapter.getEntry({
    collectionId: savedCollection.id,
    idOrSlug: record.entry.id,
  });

  expect(savedEntry?.locales[0]?.body).toBe(htmlBody);
}

async function expectCmsLocaleProjection(
  adapter: StorageAdapterUnderTest,
): Promise<void> {
  const collection = createSampleCollection();
  const savedCollection = await adapter.saveCollection(collection);
  const record = createSampleEntry(savedCollection.id);

  await adapter.saveEntry({
    ...record,
    locales: [
      record.locales[0]!,
      {
        ...record.locales[0]!,
        locale: "fr",
        slug: "bonjour-le-monde",
        title: "Bonjour le monde",
        frontmatter: { excerpt: "Premier article" },
        isSource: false,
      },
    ],
  });

  const frenchById = await adapter.getEntry({
    collectionId: savedCollection.id,
    idOrSlug: record.entry.id,
    locale: "fr",
  });
  expect(frenchById?.locales).toHaveLength(1);
  expect(frenchById?.locales[0]?.locale).toBe("fr");
  expect(frenchById?.locales[0]?.title).toBe("Bonjour le monde");

  const fallbackById = await adapter.getEntry({
    collectionId: savedCollection.id,
    idOrSlug: record.entry.id,
    locale: "fr-CA",
  });
  expect(fallbackById?.locales).toHaveLength(1);
  expect(fallbackById?.locales[0]?.locale).toBe("en");

  const frenchBySlug = await adapter.getEntry({
    collectionId: savedCollection.id,
    idOrSlug: "bonjour-le-monde",
    locale: "fr",
  });
  expect(frenchBySlug?.entry.id).toBe(record.entry.id);

  const wrongLocaleSlug = await adapter.getEntry({
    collectionId: savedCollection.id,
    idOrSlug: "bonjour-le-monde",
    locale: "en",
  });
  expect(wrongLocaleSlug).toBeNull();

  const listedFallback = await adapter.listEntries({
    collectionId: savedCollection.id,
    locale: "fr-CA",
  });
  expect(listedFallback.total).toBe(1);
  expect(listedFallback.items[0]?.locales).toHaveLength(1);
  expect(listedFallback.items[0]?.locales[0]?.locale).toBe("en");
}

async function expectCmsEntrySorting(
  adapter: StorageAdapterUnderTest,
): Promise<void> {
  const collection = createSampleCollection();
  const savedCollection = await adapter.saveCollection(collection);
  const baseRecord = createSampleEntry(savedCollection.id);
  const entries: AriaEntryRecord[] = [
    {
      ...baseRecord,
      entry: {
        ...baseRecord.entry,
        id: "entry-charlie",
        updatedAt: "2026-06-25T12:03:00.000Z",
      },
      locales: [
        {
          ...baseRecord.locales[0]!,
          entryId: "entry-charlie",
          slug: "charlie",
          title: "Charlie",
        },
      ],
    },
    {
      ...baseRecord,
      entry: {
        ...baseRecord.entry,
        id: "entry-alpha",
        updatedAt: "2026-06-25T12:01:00.000Z",
      },
      locales: [
        {
          ...baseRecord.locales[0]!,
          entryId: "entry-alpha",
          slug: "alpha",
          title: "Alpha",
        },
      ],
    },
    {
      ...baseRecord,
      entry: {
        ...baseRecord.entry,
        id: "entry-bravo",
        updatedAt: "2026-06-25T12:02:00.000Z",
      },
      locales: [
        {
          ...baseRecord.locales[0]!,
          entryId: "entry-bravo",
          slug: "bravo",
          title: "Bravo",
        },
      ],
    },
  ];

  for (const entry of entries) {
    await adapter.saveEntry(entry);
  }

  const titleAsc = await adapter.listEntries({
    collectionId: savedCollection.id,
    sort: [{ field: "title", direction: "asc" }],
  });
  expect(titleAsc.items.map((item) => item.locales[0]?.title)).toEqual([
    "Alpha",
    "Bravo",
    "Charlie",
  ]);

  const updatedDesc = await adapter.listEntries({
    collectionId: savedCollection.id,
    sort: [{ field: "updatedAt", direction: "desc" }],
  });
  expect(updatedDesc.items.map((item) => item.entry.id)).toEqual([
    "entry-charlie",
    "entry-bravo",
    "entry-alpha",
  ]);
}

async function expectCmsSearchDocuments(
  adapter: StorageAdapterUnderTest,
): Promise<void> {
  const collection = await adapter.saveCollection(createSampleCollection());
  const record = createSampleEntry(collection.id);
  await adapter.replaceCmsSearchDocuments([
    {
      entityType: "collection",
      entityId: collection.id,
      collectionId: collection.id,
      locale: "global",
      title: collection.label,
      slug: collection.name,
      collectionName: collection.name,
      collectionLabel: collection.label,
      status: null,
      searchableText: "posts",
      sourceVersion: "1",
      updatedAt: now,
    },
    {
      entityType: "entry",
      entityId: record.entry.id,
      collectionId: collection.id,
      locale: "en",
      title: "Hello World",
      slug: "hello-world",
      collectionName: collection.name,
      collectionLabel: collection.label,
      status: "draft",
      searchableText: "hello world first post",
      sourceVersion: record.entry.version,
      updatedAt: now,
    },
  ]);

  await expect(
    adapter.searchCmsSearchDocuments({
      query: "hello",
      locales: ["en", "global"],
      limit: 10,
    }),
  ).resolves.toMatchObject([{ entityId: record.entry.id, rank: 1 }]);

  await adapter.deleteCmsSearchDocuments({
    entityType: "entry",
    entityId: record.entry.id,
  });
  await expect(
    adapter.searchCmsSearchDocuments({
      query: "hello",
      locales: ["en", "global"],
      limit: 10,
    }),
  ).resolves.toEqual([]);
}

async function expectCmsSearchGenerationSwap(
  adapter: StorageAdapterUnderTest,
): Promise<void> {
  const collection = await adapter.saveCollection(createSampleCollection());
  const baseDocument = {
    entityType: "entry" as const,
    entityId: "entry-generation",
    collectionId: collection.id,
    locale: "en",
    title: "Original title",
    slug: "original-title",
    collectionName: collection.name,
    collectionLabel: collection.label,
    status: "draft" as const,
    searchableText: "original title",
    sourceVersion: "001",
    updatedAt: "2026-06-25T12:00:00.000Z",
  };
  const collectionDocument = {
    entityType: "collection" as const,
    entityId: collection.id,
    collectionId: collection.id,
    locale: "global",
    title: collection.label,
    slug: collection.name,
    collectionName: collection.name,
    collectionLabel: collection.label,
    status: null,
    searchableText: collection.name,
    sourceVersion: "001",
    updatedAt: "2026-06-25T12:00:00.000Z",
  };
  await adapter.replaceCmsSearchDocuments([collectionDocument, baseDocument]);

  const generation = "rebuild-generation";
  await expect(
    adapter.beginCmsSearchScopeRebuild({
      collectionId: collection.id,
      generation,
    }),
  ).resolves.toBe(true);

  await adapter.replaceCmsSearchDocuments([
    {
      ...baseDocument,
      title: "Newest title",
      slug: "newest-title",
      searchableText: "newest title",
      sourceVersion: "002",
      updatedAt: "2026-06-25T12:01:00.000Z",
    },
  ]);
  await adapter.writeCmsSearchScopeGeneration({
    collectionId: collection.id,
    generation,
    documents: [collectionDocument, baseDocument],
  });
  await expect(
    adapter.commitCmsSearchScopeRebuild({
      collectionId: collection.id,
      generation,
    }),
  ).resolves.toBe(true);
  await expect(
    adapter.searchCmsSearchDocuments({
      query: "newest",
      locales: ["en"],
      limit: 10,
    }),
  ).resolves.toMatchObject([{ entityId: baseDocument.entityId }]);
  await expect(
    adapter.searchCmsSearchDocuments({
      query: "original",
      locales: ["en"],
      limit: 10,
    }),
  ).resolves.toEqual([]);
  await expect(adapter.getCmsSearchDocumentStats()).resolves.toMatchObject({
    collections: 1,
    entries: 1,
    documents: 2,
    expectedCollections: 1,
    expectedEntries: 0,
    expectedDocuments: 1,
    orphanedDocuments: 1,
  });
}

describe("CMS storage adapters", () => {
  describe("SQLiteStorageAdapter", () => {
    let tmpDir: string;
    let client: Client;
    let adapter: SQLiteStorageAdapter;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-cms-sqlite-"));
      client = createClient({ url: `file:${path.join(tmpDir, "test.db")}` });
      adapter = new SQLiteStorageAdapter(client, {
        seedStarterLayouts: false,
        seedStarterPages: false,
        seedStarterCms: false,
        seedStarterDesign: false,
        seedStarterSiteSettings: false,
      });
    });

    afterEach(async () => {
      client.close();
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("round-trips collections and entries", async () => {
      await expectCmsRoundTrip(adapter);
    });

    it("round-trips string entry bodies", async () => {
      await expectCmsStringBodyRoundTrip(adapter);
    });

    it("projects requested locales with fallback", async () => {
      await expectCmsLocaleProjection(adapter);
    });

    it("sorts entries server-side", async () => {
      await expectCmsEntrySorting(adapter);
    });

    it("indexes and searches CMS documents", async () => {
      await expectCmsSearchDocuments(adapter);
    });

    it("keeps newer entry syncs when activating a rebuild generation", async () => {
      await expectCmsSearchGenerationSwap(adapter);
    });
  });

  describe("CloudflareStorageAdapter", () => {
    let tmpDir: string;
    let client: Client;
    let adapter: CloudflareStorageAdapter;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-cms-d1-"));
      client = createClient({ url: `file:${path.join(tmpDir, "test.db")}` });
      for (const migration of [
        "0001_baseline_schema.sql",
        "0002_api_foundation.sql",
        "0003_api_idempotency_leases.sql",
        "0004_api_lifecycle_hardening.sql",
      ]) {
        await client.executeMultiple(
          await fs.readFile(
            path.resolve(process.cwd(), `aria/migrations/${migration}`),
            "utf-8",
          ),
        );
      }

      const env = {
        aria_db: createD1Mock(
          client,
        ) as unknown as AriaCloudflareEnv["aria_db"],
      };
      adapter = new CloudflareStorageAdapter(env);
    });

    afterEach(async () => {
      client.close();
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("round-trips collections and entries", async () => {
      await expectCmsRoundTrip(adapter);
    });

    it("round-trips string entry bodies", async () => {
      await expectCmsStringBodyRoundTrip(adapter);
    });

    it("projects requested locales with fallback", async () => {
      await expectCmsLocaleProjection(adapter);
    });

    it("sorts entries server-side", async () => {
      await expectCmsEntrySorting(adapter);
    });

    it("indexes and searches CMS documents", async () => {
      await expectCmsSearchDocuments(adapter);
    });

    it("keeps newer entry syncs when activating a rebuild generation", async () => {
      await expectCmsSearchGenerationSwap(adapter);
    });

    it("rejects an unprovisioned D1 database before collection writes", async () => {
      const freshDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "aria-cms-d1-bootstrap-"),
      );
      const freshClient = createClient({
        url: `file:${path.join(freshDir, "test.db")}`,
      });
      const freshAdapter = new CloudflareStorageAdapter({
        aria_db: createD1Mock(
          freshClient,
        ) as unknown as AriaCloudflareEnv["aria_db"],
      });

      try {
        await expect(
          freshAdapter.saveCollection(createSampleCollection()),
        ).rejects.toThrow(/reset\/reprovision/i);
        const tables = await freshClient.execute(
          `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
        );
        expect(tables.rows).toEqual([]);
      } finally {
        freshClient.close();
        await fs.rm(freshDir, { recursive: true, force: true });
      }
    });
  });
});
