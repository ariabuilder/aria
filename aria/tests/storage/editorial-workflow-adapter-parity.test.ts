import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { CloudflareStorageAdapter } from "../../lib/storage/cloudflare";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { createD1Mock } from "../helpers/d1Mock";

let client: Client;
const now = "2026-07-13T12:00:00.000Z";
const later = "2026-07-13T12:10:00.000Z";

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await client.executeMultiple(await fs.readFile(path.resolve("aria/migrations/0001_baseline_schema.sql"), "utf8"));
  await client.execute({ sql: "INSERT INTO aria_schema_migrations (id, applied_at) VALUES (?, ?)", args: ["0001_baseline_schema.sql", now] });
  await client.execute({ sql: "INSERT INTO aria_collections (id, name, label, kind, schema_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", args: ["posts", "posts", "Posts", "content", JSON.stringify({ id: "posts", label: "Posts", kind: "content", fields: [], version: 1 }), now, now] });
  await client.execute({ sql: "INSERT INTO aria_entries (id, collection_id, status, version, author_id, created_at, updated_at) VALUES (?, ?, 'draft', 'v1', 'author', ?, ?)", args: ["entry", "posts", now, now] });
});
afterEach(() => client.close());

describe("editorial workflow adapter parity", () => {
  it.each([
    ["SQLite", () => new SQLiteStorageAdapter(client, { seedStarterLayouts: false, seedStarterPages: false, seedStarterCms: false, seedStarterDesign: false, seedStarterSiteSettings: false })],
    ["D1", () => new CloudflareStorageAdapter({ aria_db: createD1Mock(client) })],
  ])("keeps autosaves ordered and leases advisory on %s", async (_name, createAdapter) => {
    const adapter = createAdapter();
    const first = await adapter.saveCmsEntryAutosave({ id: "save-1", entryId: "entry", collectionId: "posts", locale: "en", baseVersion: "v1", actorId: "editor", clientSequence: 1, payload: { title: "First" }, checksum: "a".repeat(16), createdAt: now, expiresAt: later });
    expect(first?.id).toBe("save-1");
    const stale = await adapter.saveCmsEntryAutosave({ id: "save-0", entryId: "entry", collectionId: "posts", locale: "en", baseVersion: "v1", actorId: "editor", clientSequence: 0, payload: { title: "Stale" }, checksum: "b".repeat(16), createdAt: now, expiresAt: later });
    expect(stale).toBeNull();
    const latestAutosave = await adapter.getLatestCmsEntryAutosave({ entryId: "entry", locale: "en", actorId: "editor", now });
    expect(latestAutosave).not.toBeNull();
    expect(latestAutosave?.payload).toEqual({ title: "First" });
    await adapter.upsertCmsEntryPresenceLease({ entryId: "entry", locale: "en", actorId: "editor", leaseToken: "a".repeat(16), expiresAt: later, updatedAt: now });
    expect(await adapter.listCmsEntryPresenceLeases({ entryId: "entry", locale: "en", now })).toHaveLength(1);
    const lock = await adapter.acquireCmsEntryEditLock({ entryId: "entry", locale: "en", actorId: "editor", leaseToken: "b".repeat(16), expiresAt: later, updatedAt: now, now });
    expect(lock?.actorId).toBe("editor");
    await expect(adapter.acquireCmsEntryEditLock({ entryId: "entry", locale: "en", actorId: "other", leaseToken: "c".repeat(16), expiresAt: later, updatedAt: now, now })).resolves.toBeNull();
    await adapter.releaseCmsEntryEditLock({ entryId: "entry", locale: "en", leaseToken: "b".repeat(16) });
    expect(await adapter.acquireCmsEntryEditLock({ entryId: "entry", locale: "en", actorId: "other", leaseToken: "c".repeat(16), expiresAt: later, updatedAt: now, now })).toMatchObject({ actorId: "other" });
  });

  it.each([
    ["SQLite", () => new SQLiteStorageAdapter(client, { seedStarterLayouts: false, seedStarterPages: false, seedStarterCms: false, seedStarterDesign: false, seedStarterSiteSettings: false })],
    ["D1", () => new CloudflareStorageAdapter({ aria_db: createD1Mock(client) })],
  ])("compare-and-swaps reviews and scopes annotation resolution on %s", async (_name, createAdapter) => {
    const adapter = createAdapter();
    const review = await adapter.saveCmsEntryWorkflow({
      entryId: "entry", locale: "en", state: "in_review", reviewedVersion: null,
      assignedToId: null, updatedById: "editor", updatedAt: now, expectedState: null,
    });
    expect(review).toMatchObject({ state: "in_review", updatedById: "editor" });
    expect(await adapter.saveCmsEntryWorkflow({
      entryId: "entry", locale: "en", state: "approved", reviewedVersion: "v1",
      assignedToId: null, updatedById: "reviewer", updatedAt: later, expectedState: "none",
    })).toBeNull();
    expect(await adapter.saveCmsEntryWorkflow({
      entryId: "entry", locale: "en", state: "approved", reviewedVersion: "v1",
      assignedToId: "reviewer", updatedById: "reviewer", updatedAt: later, expectedState: "in_review",
    })).toMatchObject({ state: "approved", reviewedVersion: "v1" });

    await adapter.createCmsReviewAnnotation({
      id: "other-annotation", resourceType: "entry", resourceId: "other-entry", collectionId: "posts",
      locale: "en", fieldPath: null, anchor: null, fallbackLabel: null, body: "Do not resolve me.",
      status: "open", authorId: "reviewer", resolvedById: null, resolvedAt: null, createdAt: now, updatedAt: now,
    });
    expect(await adapter.resolveCmsReviewAnnotation({
      id: "other-annotation", resourceType: "entry", resourceId: "entry", actorId: "editor", updatedAt: later,
    })).toBeNull();
    expect((await adapter.listCmsReviewAnnotations({ resourceType: "entry", resourceId: "other-entry" }))[0]).toMatchObject({ status: "open" });
    await adapter.createCmsReviewAnnotation({
      id: "annotation", resourceType: "entry", resourceId: "entry", collectionId: "posts",
      locale: "en", fieldPath: null, anchor: null, fallbackLabel: null, body: "Resolve then reopen me.",
      status: "open", authorId: "reviewer", resolvedById: null, resolvedAt: null, createdAt: now, updatedAt: now,
    });
    expect(await adapter.resolveCmsReviewAnnotation({ id: "annotation", resourceType: "entry", resourceId: "entry", actorId: "editor", updatedAt: later })).toMatchObject({ status: "resolved" });
    expect(await adapter.reopenCmsReviewAnnotation({ id: "annotation", resourceType: "entry", resourceId: "entry", actorId: "editor", updatedAt: "2026-07-13T12:11:00.000Z" })).toMatchObject({ status: "open", resolvedById: null });
  });

});
