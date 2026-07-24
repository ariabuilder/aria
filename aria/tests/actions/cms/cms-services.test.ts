import { createClient, type Client, type InArgs } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { createEmptyCollectionSchema } from "../../../lib/cms/storage/db";
import { ensureCmsAuthorshipSchema } from "../../../lib/cms/storage/schema";
import {
  countEntriesByCollectionFromAdapter,
  createCollectionOnAdapter,
  deleteCollectionOnAdapter,
  getCollectionFromAdapter,
  listCollectionsFromAdapter,
  repairCmsPageRoleAssignmentsOnAdapter,
  updateCollectionOnAdapter,
} from "../../../lib/cms/services/collections";
import {
  checkEntrySlugAvailabilityOnAdapter,
  createEntryOnAdapter,
  duplicateEntryOnAdapter,
  publishEntryOnAdapter,
  restoreEntrySnapshotOnAdapter,
  updateEntryOnAdapter,
  listEntriesFromAdapter,
} from "../../../lib/cms/services/entries";
import {
  listRevisionsFromAdapter,
  restoreRevisionOnAdapter,
} from "../../../lib/cms/services/revisions";
import { SQLiteStorageAdapter } from "../../../lib/storage/sqlite";
import type { ActorRef } from "../../../lib/auth/types";
import type { PageDSL } from "../../../lib/types/nodes";
import { LibSqlApiSqlDatabase } from "../../../lib/api/database";
import { createApiMutationActionContext } from "../../../lib/api/mutationContext";
import { ApiRepository } from "../../../lib/api/repository";
import { createCmsAuditEvent } from "../../../lib/cms/services/accessPolicy";

function buildTestPage(input: {
  id: string;
  slug: string;
  title: string;
  parent?: string;
}): PageDSL {
  return {
    id: input.id,
    title: input.title,
    slug: input.slug,
    description: "",
    layout: "default",
    status: "draft",
    parent: input.parent,
    nodes: [
      {
        id: `${input.id}-root`,
        type: "Container",
        props: {},
        styles: {},
        children: [],
      },
    ],
    settings: {
      cssVariables: {},
      breakpoints: [],
    },
  };
}

function actor(id: string, username: string): ActorRef {
  return {
    id,
    username,
    email: `${username}@example.test`,
  };
}

vi.mock("astro:actions", () => ({
  ActionError: class MockActionError extends Error {
    code: string;
    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.code = input.code;
    }
  },
}));

describe("CMS services", () => {
  let client: Client;
  let dbPath: string;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    dbPath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "aria-cms-actions-")),
      "cms.sqlite",
    );
    client = createClient({ url: `file:${dbPath}` });
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
    await fs.rm(path.dirname(dbPath), { recursive: true, force: true });
  });

  it("creates a collection and entry with schema validation", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "posts",
      label: "Posts",
      kind: "content",
      icon: "i-lucide:book-open",
      fields: [
        { key: "excerpt", label: "Excerpt", type: "text", required: true },
      ],
    });

    expect(collection.name).toBe("posts");
    expect(collection.schema.icon).toBe("i-lucide:book-open");

    const entry = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Hello World",
        frontmatter: { excerpt: "Intro" },
      },
      actor("author-1", "admin"),
    );

    expect(entry.locales[0]?.slug).toBe("hello-world");
    expect(entry.locales[0]?.frontmatter).toEqual({ excerpt: "Intro" });

    const listed = await listCollectionsFromAdapter(adapter, { query: "post" });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.schema.icon).toBe("i-lucide:book-open");
  });

  it("creates empty collection schemas with optional icons", () => {
    expect(
      createEmptyCollectionSchema(
        "collection-icon",
        "Collection Icon",
        "content",
        "i-lucide:folder",
      ).icon,
    ).toBe("i-lucide:folder");

    expect(
      createEmptyCollectionSchema(
        "collection-no-icon",
        "Collection No Icon",
        "content",
      ),
    ).not.toHaveProperty("icon");
  });

  it("commits the canonical service response with API idempotency state", async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const collection = await createCollectionOnAdapter(adapter, {
      name: "api-posts",
      label: "API Posts",
      kind: "content",
      fields: [],
    });
    const principalId = "10000000-0000-4000-8000-000000000091";
    await client.execute({
      sql: `INSERT INTO aria_users (
        id, username, email, password_hash, role, created_at
      ) VALUES (?, 'api-service', 'api-service@example.test', 'not-used', 'administrator', ?)`,
      args: [principalId, "2026-07-19T00:00:00.000Z"],
    });
    const repository = new ApiRepository(new LibSqlApiSqlDatabase(client));
    const siteId = await repository.getOrCreateSiteIdentity(
      "20000000-0000-4000-8000-000000000091",
    );
    const credential = await repository.insertCredential({
      id: "30000000-0000-4000-8000-000000000091",
      siteId,
      kind: "personal",
      principalId,
      createdById: principalId,
      name: "CMS service",
      tokenPrefix: "servicepref1",
      tokenDigest: "digest-value-that-is-long-enough-for-schema-validation",
      keyId: "v1",
      scopes: ["entries:write"],
      expiresAt: null,
    });
    const claim = await repository.claimIdempotency({
      credentialId: credential.id,
      key: "cms-service-idempotency-0001",
      method: "POST",
      routeTemplate: "/api/v1/collections/{collectionId}/entries",
      fingerprint: "cms-service-fingerprint",
      expiresAt,
    });
    if (claim.kind !== "claimed") throw new Error("Expected idempotency claim");
    const mutation = createApiMutationActionContext({
      execution: {
        credentialId: credential.id,
        key: "cms-service-idempotency-0001",
        fingerprint: "cms-service-fingerprint",
        leaseToken: claim.leaseToken,
        requestId: crypto.randomUUID(),
        siteId,
        actorId: principalId,
        method: "POST",
        routeTemplate: "/api/v1/collections/{collectionId}/entries",
      },
      responseFor: (record) => ({
        status: 201,
        body: { success: true, data: record },
        headers: { ETag: `\"aria-entry-${record.entry.version}\"` },
        resourceVersion: `\"aria-entry-${record.entry.version}\"`,
      }),
    });
    const onIntegrationEventCommitted = vi.fn();
    const entry = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Atomic service response",
        frontmatter: {},
      },
      actor(principalId, "api-service"),
      {
        apiContext: mutation,
        onIntegrationEventCommitted,
        auditEventFor: (record) =>
          createCmsAuditEvent({
            action: "entry.create",
            actorId: principalId,
            actorUsername: "api-service",
            collectionId: record.entry.collectionId,
            entryId: record.entry.id,
            summary: "Created CMS entry",
            metadata: {},
          }),
      },
    );
    expect(mutation.committedResponse()?.body).toEqual({
      success: true,
      data: entry,
    });
    expect(onIntegrationEventCommitted).toHaveBeenCalledOnce();
    expect(onIntegrationEventCommitted).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxId: expect.any(String),
        type: "cms.entry.created.v1",
      }),
    );
    await expect(
      repository.claimIdempotency({
        credentialId: credential.id,
        key: "cms-service-idempotency-0001",
        method: "POST",
        routeTemplate: "/api/v1/collections/{collectionId}/entries",
        fingerprint: "cms-service-fingerprint",
        expiresAt,
      }),
    ).resolves.toMatchObject({
      kind: "replay",
      response: { body: { success: true, data: entry } },
    });
  });

  it("backfills CMS actor snapshots from existing auth users", async () => {
    await client.execute(`
      CREATE TABLE aria_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT
      )
    `);
    await client.execute({
      sql: `INSERT INTO aria_users (id, username, email) VALUES (?, ?, ?)`,
      args: ["author-1", "admin", "admin@example.test"],
    });
    await client.execute(`
      CREATE TABLE aria_entries (
        id TEXT PRIMARY KEY NOT NULL,
        collection_id TEXT NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        author_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT,
        scheduled_for TEXT
      )
    `);
    await client.execute(`
      CREATE TABLE aria_entry_revisions (
        id TEXT PRIMARY KEY NOT NULL,
        entry_id TEXT NOT NULL,
        locale TEXT,
        version TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        message TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await client.execute({
      sql: `INSERT INTO aria_entries (
        id, collection_id, status, version, author_id,
        created_at, updated_at, published_at, scheduled_for
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "entry-1",
        "posts",
        "published",
        "v1",
        "author-1",
        "2026-06-26T00:00:00.000Z",
        "2026-06-26T00:01:00.000Z",
        "2026-06-26T00:02:00.000Z",
        null,
      ],
    });
    await client.execute({
      sql: `INSERT INTO aria_entry_revisions (
        id, entry_id, locale, version, snapshot_json, actor_id, message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "revision-1",
        "entry-1",
        "en",
        "v1",
        JSON.stringify({
          entry: {
            id: "entry-1",
            collectionId: "posts",
            status: "published",
            version: "v1",
            authorId: "author-1",
            createdAt: "2026-06-26T00:00:00.000Z",
            updatedAt: "2026-06-26T00:01:00.000Z",
            publishedAt: "2026-06-26T00:02:00.000Z",
            scheduledFor: null,
          },
          locales: [
            {
              entryId: "entry-1",
              collectionId: "posts",
              locale: "en",
              slug: "hello",
              title: "Hello",
              frontmatter: {},
              body: null,
              isSource: true,
            },
          ],
        }),
        "author-1",
        "Created entry",
        "2026-06-26T00:00:00.000Z",
      ],
    });

    await ensureCmsAuthorshipSchema({
      queryAll: async <T extends Record<string, unknown>>(
        sql: string,
        args: unknown[] = [],
      ) => {
        const result = await client.execute({ sql, args: args as InArgs });
        return result.rows as unknown as T[];
      },
      queryFirst: async <T extends Record<string, unknown>>(
        sql: string,
        args: unknown[] = [],
      ) => {
        const result = await client.execute({ sql, args: args as InArgs });
        return (result.rows[0] as unknown as T | undefined) ?? null;
      },
      run: async (sql: string, args: unknown[] = []) => {
        await client.execute({ sql, args: args as InArgs });
      },
    });

    const entry = await client.execute({
      sql: `SELECT
        created_by_username,
        updated_by_username,
        published_by_username
      FROM aria_entries WHERE id = ?`,
      args: ["entry-1"],
    });
    const revision = await client.execute({
      sql: `SELECT actor_username FROM aria_entry_revisions WHERE id = ?`,
      args: ["revision-1"],
    });

    expect(entry.rows[0]).toMatchObject({
      created_by_username: "admin",
      updated_by_username: "admin",
      published_by_username: "admin",
    });
    expect(revision.rows[0]).toMatchObject({
      actor_username: "admin",
    });
  });

  it("counts entries for listed collections", async () => {
    const posts = await createCollectionOnAdapter(adapter, {
      name: "counted-posts",
      label: "Counted Posts",
      kind: "content",
      fields: [],
    });
    const authors = await createCollectionOnAdapter(adapter, {
      name: "authors",
      label: "Authors",
      kind: "data",
      fields: [],
    });

    await createEntryOnAdapter(
      adapter,
      { collectionId: posts.id, title: "One", frontmatter: {} },
      actor("author-1", "admin"),
    );
    await createEntryOnAdapter(
      adapter,
      { collectionId: posts.id, title: "Two", frontmatter: {} },
      actor("author-1", "admin"),
    );
    await createEntryOnAdapter(
      adapter,
      { collectionId: authors.id, title: "Ada", frontmatter: {} },
      actor("author-1", "admin"),
    );

    const listEntriesSpy = vi.spyOn(adapter, "listEntries");
    const counts = await countEntriesByCollectionFromAdapter(adapter, [
      posts,
      authors,
    ]);

    expect(listEntriesSpy).not.toHaveBeenCalled();
    expect(counts).toEqual({
      [posts.id]: 2,
      [authors.id]: 1,
    });
  });

  it("deletes a collection with entries and removes it from collection state", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "delete-posts",
      label: "Delete Posts",
      kind: "content",
      fields: [],
    });
    const created = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Delete Me",
        slug: "delete-me",
        frontmatter: {},
      },
      actor("author-1", "admin"),
    );

    await deleteCollectionOnAdapter(adapter, collection.id);

    await expect(
      getCollectionFromAdapter(adapter, collection.id),
    ).rejects.toThrow(`Collection not found: ${collection.id}`);
    await expect(
      getCollectionFromAdapter(adapter, collection.name),
    ).rejects.toThrow(`Collection not found: ${collection.name}`);

    await expect(
      adapter.getEntry({
        collectionId: collection.id,
        idOrSlug: created.entry.id,
      }),
    ).resolves.toBeNull();
    await expect(
      adapter.getEntry({
        collectionId: collection.id,
        idOrSlug: "delete-me",
      }),
    ).resolves.toBeNull();

    const listed = await listCollectionsFromAdapter(adapter);
    expect(listed).not.toContainEqual(
      expect.objectContaining({ id: collection.id }),
    );

    const counts = await countEntriesByCollectionFromAdapter(adapter, listed);
    expect(counts).not.toHaveProperty(collection.id);
  });

  it("duplicates an entry as a draft with copied content and actor snapshots", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "duplicate-posts",
      label: "Duplicate Posts",
      kind: "content",
      fields: [
        { key: "cover", label: "Cover", type: "image", required: false },
      ],
    });

    const created = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Launch Notes",
        slug: "launch-notes",
        frontmatter: { cover: { mediaId: "media-1", alt: "Cover" } },
      },
      actor("author-1", "admin"),
    );

    const duplicated = await duplicateEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: created.entry.id,
      },
      actor("editor-1", "editor"),
    );

    expect(duplicated.entry.id).not.toBe(created.entry.id);
    expect(duplicated.entry.status).toBe("draft");
    expect(duplicated.entry.publishedAt).toBeNull();
    expect(duplicated.locales[0]?.title).toBe("Launch Notes Copy");
    expect(duplicated.locales[0]?.slug).toBe("launch-notes-copy");
    expect(duplicated.locales[0]?.frontmatter).toEqual({
      cover: { mediaId: "media-1", alt: "Cover" },
    });
    expect(duplicated.authorship?.createdBy?.username).toBe("editor");
    expect(duplicated.authorship?.updatedBy?.username).toBe("editor");
    expect(duplicated.authorship?.publishedBy).toBeNull();

    const secondDuplicate = await duplicateEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: created.entry.id,
      },
      actor("editor-1", "editor"),
    );

    expect(secondDuplicate.locales[0]?.slug).toBe("launch-notes-copy-2");

    const revisions = await listRevisionsFromAdapter(adapter, {
      collectionId: collection.id,
      entryId: duplicated.entry.id,
    });

    expect(
      revisions.revisions.some(
        (revision) => revision.message === "Duplicated entry",
      ),
    ).toBe(true);
    expect(revisions.revisions[0]?.authorship?.actor?.username).toBe("editor");
  });

  it("publishes an entry and sets publishedAt", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "news",
      label: "News",
      kind: "content",
      fields: [],
    });

    const created = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Launch",
        frontmatter: {},
      },
      actor("author-1", "admin"),
    );

    const published = await publishEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: created.entry.id,
        version: created.entry.version,
      },
      actor("publisher-1", "publisher"),
    );

    expect(published.entry.status).toBe("published");
    expect(published.entry.publishedAt).toBeTruthy();
    expect(published.entry.authorId).toBe("publisher-1");
  });

  it("cancels a scheduled entry when a newer draft is saved", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "scheduled-news",
      label: "Scheduled News",
      kind: "content",
      fields: [],
    });
    const created = await createEntryOnAdapter(
      adapter,
      { collectionId: collection.id, title: "Launch", frontmatter: {} },
      actor("author-1", "admin"),
    );
    const scheduled = await publishEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: created.entry.id,
        version: created.entry.version,
        scheduledFor: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      actor("publisher-1", "publisher"),
    );

    const updated = await updateEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: scheduled.entry.id,
        version: scheduled.entry.version,
        patch: { title: "Launch updated" },
      },
      actor("author-1", "admin"),
    );

    expect(updated.entry.status).toBe("draft");
    expect(updated.entry.scheduledFor).toBeNull();
    const row = await client.execute({
      sql: `SELECT scheduled_version FROM aria_entries WHERE id = ?`,
      args: [updated.entry.id],
    });
    expect(row.rows[0]?.scheduled_version).toBeNull();
  });

  it("allows incomplete drafts but validates required fields before publish", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "required-posts",
      label: "Required Posts",
      kind: "content",
      fields: [
        { key: "summary", label: "Summary", type: "string", required: true },
      ],
    });

    const draft = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Work in Progress",
        frontmatter: {},
      },
      actor("author-1", "admin"),
    );

    expect(draft.entry.status).toBe("draft");
    expect(draft.locales[0]?.frontmatter).toEqual({});

    await expect(
      publishEntryOnAdapter(
        adapter,
        {
          collectionId: collection.id,
          id: draft.entry.id,
          version: draft.entry.version,
        },
        actor("publisher-1", "publisher"),
      ),
    ).rejects.toThrow(/summary/i);

    const updated = await updateEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: draft.entry.id,
        version: draft.entry.version,
        patch: {
          frontmatter: { summary: "Ready" },
        },
      },
      actor("author-1", "admin"),
    );

    const published = await publishEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: updated.entry.id,
        version: updated.entry.version,
      },
      actor("publisher-1", "publisher"),
    );

    expect(published.entry.status).toBe("published");
  });

  it("stores relation fields in aria_entry_relations and validates them before publish", async () => {
    const authors = await createCollectionOnAdapter(adapter, {
      name: "relation-authors",
      label: "Relation Authors",
      kind: "data",
      fields: [],
    });
    const posts = await createCollectionOnAdapter(adapter, {
      name: "relation-posts",
      label: "Relation Posts",
      kind: "content",
      fields: [
        {
          key: "authors",
          label: "Authors",
          type: "relation",
          targetCollection: authors.id,
          required: true,
        },
      ],
    });

    const authorEntry = await createEntryOnAdapter(
      adapter,
      {
        collectionId: authors.id,
        title: "Ada Lovelace",
        frontmatter: {},
      },
      actor("author-1", "admin"),
    );
    const postEntry = await createEntryOnAdapter(
      adapter,
      {
        collectionId: posts.id,
        title: "Relation Draft",
        frontmatter: {},
      },
      actor("author-1", "admin"),
    );

    await expect(
      publishEntryOnAdapter(
        adapter,
        {
          collectionId: posts.id,
          id: postEntry.entry.id,
          version: postEntry.entry.version,
        },
        actor("publisher-1", "publisher"),
      ),
    ).rejects.toThrow(/authors/i);

    const updated = await updateEntryOnAdapter(
      adapter,
      {
        collectionId: posts.id,
        id: postEntry.entry.id,
        version: postEntry.entry.version,
        patch: {
          relations: [
            {
              sourceEntryId: postEntry.entry.id,
              fieldKey: "authors",
              targetEntryId: authorEntry.entry.id,
              position: 0,
            },
          ],
        },
      },
      actor("author-1", "admin"),
    );

    expect(updated.relations).toEqual([
      {
        sourceEntryId: postEntry.entry.id,
        fieldKey: "authors",
        targetEntryId: authorEntry.entry.id,
        position: 0,
      },
    ]);

    const published = await publishEntryOnAdapter(
      adapter,
      {
        collectionId: posts.id,
        id: updated.entry.id,
        version: updated.entry.version,
      },
      actor("publisher-1", "publisher"),
    );

    expect(published.entry.status).toBe("published");
    expect(published.relations?.[0]?.targetEntryId).toBe(authorEntry.entry.id);
  });

  it("restores an entry snapshot with locales, relations, and a revision", async () => {
    const authors = await createCollectionOnAdapter(adapter, {
      name: "restore-authors",
      label: "Restore Authors",
      kind: "data",
      fields: [],
    });
    const posts = await createCollectionOnAdapter(adapter, {
      name: "restore-posts",
      label: "Restore Posts",
      kind: "content",
      fields: [
        {
          key: "summary",
          label: "Summary",
          type: "text",
          required: false,
        },
        {
          key: "authors",
          label: "Authors",
          type: "relation",
          targetCollection: authors.id,
          required: false,
        },
      ],
    });

    const authorEntry = await createEntryOnAdapter(
      adapter,
      {
        collectionId: authors.id,
        title: "Ada Lovelace",
        frontmatter: {},
      },
      actor("author-1", "admin"),
    );
    const created = await createEntryOnAdapter(
      adapter,
      {
        collectionId: posts.id,
        title: "Original",
        slug: "original",
        frontmatter: { summary: "Before" },
      },
      actor("author-1", "admin"),
    );
    const snapshot = {
      ...created,
      relations: [
        {
          sourceEntryId: created.entry.id,
          fieldKey: "authors",
          targetEntryId: authorEntry.entry.id,
          position: 0,
        },
      ],
    };

    await adapter.deleteEntry(posts.id, created.entry.id);

    const restored = await restoreEntrySnapshotOnAdapter(
      adapter,
      {
        collectionId: posts.id,
        snapshot,
        message: "Undo entry delete",
      },
      actor("editor-1", "editor"),
    );

    expect(restored.entry.id).toBe(created.entry.id);
    expect(restored.entry.version).not.toBe(created.entry.version);
    expect(restored.locales[0]).toMatchObject({
      slug: "original",
      title: "Original",
      frontmatter: { summary: "Before" },
    });
    expect(restored.relations).toEqual(snapshot.relations);
    expect(restored.authorship?.updatedBy?.username).toBe("editor");

    const revisions = await listRevisionsFromAdapter(adapter, {
      collectionId: posts.id,
      entryId: created.entry.id,
    });
    expect(
      revisions.revisions.some(
        (revision) => revision.message === "Undo entry delete",
      ),
    ).toBe(true);
  });

  it("rejects snapshot restore when another entry already owns the slug", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "restore-conflicts",
      label: "Restore Conflicts",
      kind: "content",
      fields: [],
    });
    const first = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "First",
        slug: "shared",
        frontmatter: {},
      },
      actor("author-1", "admin"),
    );
    const second = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Second",
        slug: "other",
        frontmatter: {},
      },
      actor("author-1", "admin"),
    );
    const conflictingSnapshot = {
      ...second,
      locales: second.locales.map((locale) => ({
        ...locale,
        slug: first.locales[0]?.slug ?? "shared",
      })),
    };

    await expect(
      restoreEntrySnapshotOnAdapter(
        adapter,
        {
          collectionId: collection.id,
          snapshot: conflictingSnapshot,
        },
        actor("editor-1", "editor"),
      ),
    ).rejects.toThrow(/Slug already exists/i);
  });

  it("rejects invalid frontmatter on create", async () => {
    const id = "col-invalid";
    await adapter.saveCollection({
      id,
      name: "articles",
      label: "Articles",
      kind: "content",
      schema: createEmptyCollectionSchema(id, "Articles", "content"),
      scope: "global",
      urlPattern: null,
      templatePageId: null,
      listPageId: null,
      supports: [],
      createdAt: "2026-06-25T12:00:00.000Z",
      updatedAt: "2026-06-25T12:00:00.000Z",
    });

    await expect(
      createEntryOnAdapter(
        adapter,
        {
          collectionId: id,
          title: "Bad",
          frontmatter: { unknown: true },
        },
        actor("author-1", "admin"),
      ),
    ).rejects.toThrow();
  });

  it("creates a missing locale row on localized update", async () => {
    await adapter.saveSiteSettings({
      localization: {
        content: {
          defaultLocale: "en",
          locales: [
            { code: "en", label: "English", enabled: true, fallbacks: [] },
            { code: "fr", label: "French", enabled: true, fallbacks: ["en"] },
          ],
        },
      },
    });
    const collection = await createCollectionOnAdapter(adapter, {
      name: "localized-posts",
      label: "Localized Posts",
      kind: "content",
      fields: [],
    });

    const created = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Hello World",
        frontmatter: {},
      },
      actor("author-1", "admin"),
    );

    const updated = await updateEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: created.entry.id,
        version: created.entry.version,
        patch: {
          locale: "fr",
          title: "Bonjour le monde",
          slug: "bonjour-le-monde",
          translationMeta: {
            method: "ai",
            sourceLocale: "en",
            sourceContentHash: "source-hash",
            generatedAt: "2026-07-12T12:00:00.000Z",
            translatedFieldPaths: ["title"],
          },
        },
      },
      actor("author-2", "editor"),
    );

    expect(updated.locales.some((locale) => locale.locale === "fr")).toBe(true);

    const frenchEntry = await adapter.getEntry({
      collectionId: collection.id,
      idOrSlug: created.entry.id,
      locale: "fr",
    });

    expect(frenchEntry?.locales).toHaveLength(1);
    expect(frenchEntry?.locales[0]?.title).toBe("Bonjour le monde");
    expect(frenchEntry?.locales[0]?.isSource).toBe(false);
    expect(frenchEntry?.locales[0]?.translationMeta).toEqual({
      method: "ai",
      sourceLocale: "en",
      sourceContentHash: "source-hash",
      generatedAt: "2026-07-12T12:00:00.000Z",
      translatedFieldPaths: ["title"],
    });
  });

  it("runs a configured English/French authoring flow with fallback and locale-scoped slugs", async () => {
    await adapter.saveSiteSettings({
      localization: {
        content: {
          defaultLocale: "en",
          locales: [
            { code: "en", label: "English", enabled: true, fallbacks: [] },
            { code: "fr", label: "French", enabled: true, fallbacks: ["en"] },
          ],
        },
      },
    });
    const collection = await createCollectionOnAdapter(adapter, {
      name: "two-locale-posts",
      label: "Two locale posts",
      kind: "content",
      fields: [],
    });
    const englishOnly = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "English only",
        slug: "english-only",
        frontmatter: {},
      },
      actor("author-1", "admin"),
    );
    const translated = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Hello world",
        slug: "hello-world",
        frontmatter: {},
      },
      actor("author-1", "admin"),
    );

    expect(
      await checkEntrySlugAvailabilityOnAdapter(adapter, {
        collectionId: collection.id,
        locale: "fr",
        slug: "hello-world",
      }),
    ).toEqual({ available: true });

    const french = await updateEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: translated.entry.id,
        version: translated.entry.version,
        patch: {
          locale: "fr",
          title: "Bonjour le monde",
          slug: "hello-world",
        },
      },
      actor("author-2", "editor"),
    );
    expect(french.locales.map((locale) => locale.locale).sort()).toEqual([
      "en",
      "fr",
    ]);

    const frenchList = await listEntriesFromAdapter(adapter, {
      collectionId: collection.id,
      locale: "fr",
    });
    const fallback = frenchList.items.find(
      (item) => item.entry.id === englishOnly.entry.id,
    );
    expect(fallback?.locales[0]?.locale).toBe("en");

    const another = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Another entry",
        frontmatter: {},
      },
      actor("author-1", "admin"),
    );
    await expect(
      updateEntryOnAdapter(
        adapter,
        {
          collectionId: collection.id,
          id: another.entry.id,
          version: another.entry.version,
          patch: { locale: "fr", slug: "hello-world" },
        },
        actor("author-2", "editor"),
      ),
    ).rejects.toThrow(/slug already exists/i);
  });

  it("lists and restores entry revisions with optimistic locking", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "revision-posts",
      label: "Revision Posts",
      kind: "content",
      fields: [],
    });

    const created = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Original Title",
        frontmatter: {},
      },
      actor("author-1", "admin"),
    );

    const updated = await updateEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: created.entry.id,
        version: created.entry.version,
        patch: {
          title: "Updated Title",
        },
      },
      actor("author-2", "editor"),
    );

    const listed = await listRevisionsFromAdapter(adapter, {
      collectionId: collection.id,
      entryId: created.entry.id,
      page: 1,
      limit: 10,
    });

    const updateRevision = listed.revisions.find(
      (revision) => revision.message === "Before update",
    );

    expect(listed.revisions.length).toBeGreaterThanOrEqual(2);
    expect(updateRevision?.authorship?.actor?.username).toBe("editor");
    expect(updateRevision?.snapshot.locales[0]?.title).toBe("Original Title");

    const fetched = await adapter.getEntry({
      collectionId: collection.id,
      idOrSlug: created.entry.id,
    });

    expect(fetched?.authorship?.author?.username).toBe("editor");

    const listedBySlug = await listRevisionsFromAdapter(adapter, {
      collectionId: collection.id,
      entryId: "original-title",
      page: 1,
      limit: 10,
    });

    expect(listedBySlug.revisions.map((revision) => revision.id)).toEqual(
      listed.revisions.map((revision) => revision.id),
    );

    await expect(
      restoreRevisionOnAdapter(
        adapter,
        {
          collectionId: collection.id,
          entryId: created.entry.id,
          revisionId: updateRevision?.id ?? "",
          expectedVersion: created.entry.version,
        },
        actor("author-3", "publisher"),
      ),
    ).rejects.toThrow(/version conflict/i);

    const restored = await restoreRevisionOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        entryId: "original-title",
        revisionId: updateRevision?.id ?? "",
        expectedVersion: updated.entry.version,
      },
      actor("author-3", "publisher"),
    );

    expect(restored.locales[0]?.title).toBe("Original Title");
    expect(restored.entry.authorId).toBe("author-3");
    expect(restored.authorship?.updatedBy?.username).toBe("publisher");
    expect(restored.entry.version).not.toBe(updated.entry.version);
  });

  it("allows adding a cover after restoring a revision without one", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "cover-restore-posts",
      label: "Cover Restore Posts",
      kind: "content",
      fields: [],
      supports: ["cover", "revisions"],
    });

    const created = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Coverless Post",
        frontmatter: {},
      },
      actor("author-1", "admin"),
    );

    const withCover = await updateEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: created.entry.id,
        version: created.entry.version,
        patch: {
          frontmatter: {
            cover: { mediaId: "media-cover-1", alt: "Current cover" },
          },
        },
      },
      actor("author-2", "editor"),
    );

    const listed = await listRevisionsFromAdapter(adapter, {
      collectionId: collection.id,
      entryId: created.entry.id,
    });
    const coverlessRevision = listed.revisions.find(
      (revision) =>
        revision.snapshot.locales[0]?.frontmatter.cover === undefined,
    );

    const restored = await restoreRevisionOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        entryId: created.entry.id,
        revisionId: coverlessRevision?.id ?? "",
        expectedVersion: withCover.entry.version,
      },
      actor("author-3", "publisher"),
    );

    expect(restored.locales[0]?.frontmatter).not.toHaveProperty("cover");

    const recoveredCover = await updateEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: created.entry.id,
        version: restored.entry.version,
        patch: {
          frontmatter: {
            cover: { mediaId: "media-cover-2", alt: "Recovered cover" },
          },
        },
      },
      actor("author-4", "editor"),
    );

    expect(recoveredCover.locales[0]?.frontmatter.cover).toEqual({
      mediaId: "media-cover-2",
      alt: "Recovered cover",
    });
  });

  it("drops stale restored frontmatter keys when saving a current cover field", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "stale-cover-restore-posts",
      label: "Stale Cover Restore Posts",
      kind: "content",
      fields: [
        { key: "legacyHero", label: "Legacy Hero", type: "text" },
        { key: "summary", label: "Summary", type: "text" },
      ],
      supports: ["cover", "revisions"],
    });

    const created = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Legacy Post",
        frontmatter: {
          legacyHero: "old-field",
          summary: "Original summary",
        },
      },
      actor("author-1", "admin"),
    );

    const updated = await updateEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: created.entry.id,
        version: created.entry.version,
        patch: {
          frontmatter: {
            summary: "Updated summary",
          },
        },
      },
      actor("author-2", "editor"),
    );

    await updateCollectionOnAdapter(adapter, {
      id: collection.id,
      patch: {
        fields: [{ key: "summary", label: "Summary", type: "text" }],
      },
    });

    const listed = await listRevisionsFromAdapter(adapter, {
      collectionId: collection.id,
      entryId: created.entry.id,
    });
    const legacyRevision = listed.revisions.find(
      (revision) =>
        revision.snapshot.locales[0]?.frontmatter.legacyHero === "old-field",
    );
    expect(legacyRevision).toBeDefined();

    const restoredLegacyRevision = await restoreRevisionOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        entryId: created.entry.id,
        revisionId: legacyRevision?.id ?? "",
        expectedVersion: updated.entry.version,
      },
      actor("author-3", "publisher"),
    );

    expect(restoredLegacyRevision.locales[0]?.frontmatter).toMatchObject({
      legacyHero: "old-field",
      summary: "Original summary",
    });

    const saved = await updateEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: created.entry.id,
        version: restoredLegacyRevision.entry.version,
        patch: {
          frontmatter: {
            cover: { mediaId: "media-cover-3", alt: "Recovered cover" },
          },
        },
      },
      actor("author-4", "publisher"),
    );

    expect(saved.locales[0]?.frontmatter).toEqual({
      cover: { mediaId: "media-cover-3", alt: "Recovered cover" },
      summary: "Original summary",
    });
  });

  describe("CMS page role auto-sync", () => {
    it("promotes assigned entry and list pages when updating a collection", async () => {
      const listPage = buildTestPage({
        id: "page-blog",
        slug: "blog",
        title: "Blog",
      });
      const entryPage = buildTestPage({
        id: "page-post",
        slug: "post",
        title: "Post",
      });
      await adapter.savePageDSL(listPage.id, listPage);
      await adapter.savePageDSL(entryPage.id, entryPage);

      const collection = await createCollectionOnAdapter(adapter, {
        name: "articles",
        label: "Articles",
        kind: "content",
        fields: [],
      });

      expect((await adapter.getPagePolicy(listPage.id))?.systemRole).toBe(
        "standard",
      );
      expect((await adapter.getPagePolicy(entryPage.id))?.systemRole).toBe(
        "standard",
      );

      await updateCollectionOnAdapter(adapter, {
        id: collection.id,
        expectedUpdatedAt: collection.updatedAt,
        patch: {
          listPageId: listPage.id,
          templatePageId: entryPage.id,
        },
      });

      expect((await adapter.getPagePolicy(listPage.id))?.systemRole).toBe(
        "cms-collection",
      );
      expect((await adapter.getPagePolicy(entryPage.id))?.systemRole).toBe(
        "cms-entry",
      );
    });

    it("allows CMS Entry pages to be reassigned as list templates", async () => {
      const entryPage = buildTestPage({
        id: "page-entry-list-block",
        slug: "entry-list-block",
        title: "Entry List Block",
      });
      await adapter.savePageDSL(entryPage.id, entryPage);
      const policy = await adapter.getPagePolicy(entryPage.id);
      expect(policy).toBeTruthy();
      await adapter.savePagePolicy({
        idOrSlug: entryPage.id,
        systemRole: "cms-entry",
        accessMode: policy?.accessMode ?? "public",
        accessPasswordHash: policy?.accessPasswordHash ?? null,
        accessPromptTitle: policy?.accessPromptTitle ?? null,
        accessPromptDescription: policy?.accessPromptDescription ?? null,
        accessRememberForDays: policy?.accessRememberForDays ?? null,
        accessPolicyVersion: policy?.accessPolicyVersion ?? 1,
      });

      const collection = await createCollectionOnAdapter(adapter, {
        name: "entry-list-blocks",
        label: "Entry List Blocks",
        kind: "content",
        fields: [],
      });

      const updated = await updateCollectionOnAdapter(adapter, {
        id: collection.id,
        expectedUpdatedAt: collection.updatedAt,
        patch: { listPageId: entryPage.id },
      });

      expect(updated.listPageId).toBe(entryPage.id);
      expect((await adapter.getPagePolicy(entryPage.id))?.systemRole).toBe(
        "cms-collection",
      );
    });

    it("allows CMS Collection pages to be reassigned as entry templates", async () => {
      const listPage = buildTestPage({
        id: "page-list-entry-block",
        slug: "list-entry-block",
        title: "List Entry Block",
      });
      await adapter.savePageDSL(listPage.id, listPage);
      const policy = await adapter.getPagePolicy(listPage.id);
      expect(policy).toBeTruthy();
      await adapter.savePagePolicy({
        idOrSlug: listPage.id,
        systemRole: "cms-collection",
        accessMode: policy?.accessMode ?? "public",
        accessPasswordHash: policy?.accessPasswordHash ?? null,
        accessPromptTitle: policy?.accessPromptTitle ?? null,
        accessPromptDescription: policy?.accessPromptDescription ?? null,
        accessRememberForDays: policy?.accessRememberForDays ?? null,
        accessPolicyVersion: policy?.accessPolicyVersion ?? 1,
      });

      const collection = await createCollectionOnAdapter(adapter, {
        name: "list-entry-blocks",
        label: "List Entry Blocks",
        kind: "content",
        fields: [],
      });

      const updated = await updateCollectionOnAdapter(adapter, {
        id: collection.id,
        expectedUpdatedAt: collection.updatedAt,
        patch: { templatePageId: listPage.id },
      });

      expect(updated.templatePageId).toBe(listPage.id);
      expect((await adapter.getPagePolicy(listPage.id))?.systemRole).toBe(
        "cms-entry",
      );
    });

    it("clears opposite-role collection bindings when reassigning a page", async () => {
      const page = buildTestPage({
        id: "page-stuck-tags",
        slug: "stuck-tags",
        title: "Stuck Tags",
      });
      await adapter.savePageDSL(page.id, page);

      const blog = await createCollectionOnAdapter(adapter, {
        name: "blog-stuck",
        label: "Blog Stuck",
        kind: "content",
        fields: [],
      });
      const tags = await createCollectionOnAdapter(adapter, {
        name: "tags-stuck",
        label: "Tags Stuck",
        kind: "tags",
        fields: [],
      });

      const blogAsList = await updateCollectionOnAdapter(adapter, {
        id: blog.id,
        expectedUpdatedAt: blog.updatedAt,
        patch: { listPageId: page.id },
      });
      expect(blogAsList.listPageId).toBe(page.id);
      expect((await adapter.getPagePolicy(page.id))?.systemRole).toBe(
        "cms-collection",
      );

      const tagsAsEntry = await updateCollectionOnAdapter(adapter, {
        id: tags.id,
        expectedUpdatedAt: tags.updatedAt,
        patch: { templatePageId: page.id, urlPattern: "/tags/{slug}" },
      });

      expect(tagsAsEntry.templatePageId).toBe(page.id);
      expect((await adapter.getCollection(blog.id))?.listPageId).toBeNull();
      expect((await adapter.getPagePolicy(page.id))?.systemRole).toBe(
        "cms-entry",
      );
    });

    it("lets the newly assigned role win when the same collection used the page oppositely", async () => {
      const page = buildTestPage({
        id: "page-same-collection-role",
        slug: "same-collection-role",
        title: "Same Collection Role",
      });
      await adapter.savePageDSL(page.id, page);

      const collection = await createCollectionOnAdapter(adapter, {
        name: "same-role",
        label: "Same Role",
        kind: "content",
        fields: [],
      });
      const asList = await updateCollectionOnAdapter(adapter, {
        id: collection.id,
        expectedUpdatedAt: collection.updatedAt,
        patch: { listPageId: page.id },
      });

      const asEntry = await updateCollectionOnAdapter(adapter, {
        id: collection.id,
        expectedUpdatedAt: asList.updatedAt,
        patch: { templatePageId: page.id },
      });

      expect(asEntry.templatePageId).toBe(page.id);
      expect(asEntry.listPageId).toBeNull();
      expect((await adapter.getPagePolicy(page.id))?.systemRole).toBe(
        "cms-entry",
      );
    });

    it("demotes pages to standard when the last collection binding is cleared", async () => {
      const listPage = buildTestPage({
        id: "page-news",
        slug: "news",
        title: "News",
      });
      const entryPage = buildTestPage({
        id: "page-story",
        slug: "story",
        title: "Story",
      });
      await adapter.savePageDSL(listPage.id, listPage);
      await adapter.savePageDSL(entryPage.id, entryPage);

      const collection = await createCollectionOnAdapter(adapter, {
        name: "newsroom",
        label: "Newsroom",
        kind: "content",
        fields: [],
      });

      const assigned = await updateCollectionOnAdapter(adapter, {
        id: collection.id,
        expectedUpdatedAt: collection.updatedAt,
        patch: {
          listPageId: listPage.id,
          templatePageId: entryPage.id,
        },
      });

      await updateCollectionOnAdapter(adapter, {
        id: collection.id,
        expectedUpdatedAt: assigned.updatedAt,
        patch: {
          listPageId: null,
          templatePageId: null,
        },
      });

      expect((await adapter.getPagePolicy(listPage.id))?.systemRole).toBe(
        "standard",
      );
      expect((await adapter.getPagePolicy(entryPage.id))?.systemRole).toBe(
        "standard",
      );
    });

    it("keeps a CMS Entry role when another collection still uses the page", async () => {
      const entryPage = buildTestPage({
        id: "page-shared-entry",
        slug: "shared-entry",
        title: "Shared Entry",
      });
      await adapter.savePageDSL(entryPage.id, entryPage);

      const firstCollection = await createCollectionOnAdapter(adapter, {
        name: "alpha",
        label: "Alpha",
        kind: "content",
        fields: [],
      });
      const secondCollection = await createCollectionOnAdapter(adapter, {
        name: "beta",
        label: "Beta",
        kind: "content",
        fields: [],
      });

      const firstAssigned = await updateCollectionOnAdapter(adapter, {
        id: firstCollection.id,
        expectedUpdatedAt: firstCollection.updatedAt,
        patch: { templatePageId: entryPage.id },
      });
      const secondAssigned = await updateCollectionOnAdapter(adapter, {
        id: secondCollection.id,
        expectedUpdatedAt: secondCollection.updatedAt,
        patch: { templatePageId: entryPage.id },
      });

      await updateCollectionOnAdapter(adapter, {
        id: firstCollection.id,
        expectedUpdatedAt: firstAssigned.updatedAt,
        patch: { templatePageId: null },
      });

      expect((await adapter.getPagePolicy(entryPage.id))?.systemRole).toBe(
        "cms-entry",
      );

      await updateCollectionOnAdapter(adapter, {
        id: secondCollection.id,
        expectedUpdatedAt: secondAssigned.updatedAt,
        patch: { templatePageId: null },
      });

      expect((await adapter.getPagePolicy(entryPage.id))?.systemRole).toBe(
        "standard",
      );
    });

    it("repairs legacy standard pages that were already assigned as templates", async () => {
      const listPage = buildTestPage({
        id: "page-legacy-list",
        slug: "legacy-list",
        title: "Legacy List",
      });
      const entryPage = buildTestPage({
        id: "page-legacy-entry",
        slug: "legacy-entry",
        title: "Legacy Entry",
      });
      await adapter.savePageDSL(listPage.id, listPage);
      await adapter.savePageDSL(entryPage.id, entryPage);

      const timestamp = "2026-06-25T12:00:00.000Z";
      await adapter.saveCollection({
        id: "col-legacy-role",
        name: "legacy",
        label: "Legacy",
        kind: "content",
        schema: createEmptyCollectionSchema(
          "col-legacy-role",
          "Legacy",
          "content",
        ),
        scope: "global",
        urlPattern: "/legacy/{slug}",
        templatePageId: entryPage.id,
        listPageId: listPage.id,
        supports: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      expect((await adapter.getPagePolicy(listPage.id))?.systemRole).toBe(
        "standard",
      );
      expect((await adapter.getPagePolicy(entryPage.id))?.systemRole).toBe(
        "standard",
      );

      await repairCmsPageRoleAssignmentsOnAdapter(adapter);

      expect((await adapter.getPagePolicy(listPage.id))?.systemRole).toBe(
        "cms-collection",
      );
      expect((await adapter.getPagePolicy(entryPage.id))?.systemRole).toBe(
        "cms-entry",
      );
    });
  });
});
