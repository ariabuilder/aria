import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";

import { CloudflareStorageAdapter } from "../../lib/storage/cloudflare";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import type { PublicComment } from "../../lib/cms/schemas";
import { createD1Mock } from "../helpers/d1Mock";

let client: Client;
const now = "2026-07-13T12:00:00.000Z";

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await client.executeMultiple(
    await fs.readFile(path.resolve("aria/migrations/0001_baseline_schema.sql"), "utf8"),
  );
  await client.execute({ sql: `INSERT INTO aria_schema_migrations (id, applied_at) VALUES (?, ?)`, args: ["0001_baseline_schema.sql", now] });
  await client.execute({ sql: `INSERT INTO aria_collections (id, name, label, kind, schema_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, args: ["posts", "posts", "Posts", "content", JSON.stringify({ id: "posts", label: "Posts", kind: "content", fields: [], version: 1 }), now, now] });
  await client.execute({ sql: `INSERT INTO aria_entries (id, collection_id, status, version, author_id, created_at, updated_at) VALUES (?, ?, 'published', 'v1', 'author', ?, ?)`, args: ["entry", "posts", now, now] });
});
afterEach(() => client.close());

function comment(id = "comment-1"): PublicComment {
  return { id, collectionId: "posts", entryId: "entry", locale: "en", authorId: "visitor", authorName: "Visitor", body: "A useful comment", status: "pending", idempotencyKey: "a".repeat(16), createdAt: now, updatedAt: now, moderatedAt: null, moderatedById: null };
}

describe("public comments adapter parity", () => {
  it.each([
    ["SQLite", () => new SQLiteStorageAdapter(client, { seedStarterLayouts: false, seedStarterPages: false, seedStarterCms: false, seedStarterDesign: false, seedStarterSiteSettings: false })],
    ["D1", () => new CloudflareStorageAdapter({ aria_db: createD1Mock(client) } as any)],
  ])("keeps pending comments private and moderation compare-and-swap on %s", async (_name, createAdapter) => {
    const adapter = createAdapter();
    const first = await adapter.createPublicComment(comment());
    const retried = await adapter.createPublicComment(comment("comment-retry"));
    expect(retried.id).toBe(first.id);
    expect(await adapter.listPublicComments({ entryId: "entry", locale: "en", status: "approved" })).toEqual([]);
    const approved = await adapter.moderatePublicComment({ commentId: first.id, expectedStatus: "pending", nextStatus: "approved", actorId: "moderator", event: { id: "event-1", commentId: first.id, fromStatus: "pending", toStatus: "approved", actorId: "moderator", reasonCode: null, createdAt: now } });
    expect(approved?.status).toBe("approved");
    expect((await adapter.listPublicComments({ entryId: "entry", locale: "en", status: "approved" })).map((item) => item.id)).toEqual([first.id]);
    await expect(adapter.moderatePublicComment({ commentId: first.id, expectedStatus: "pending", nextStatus: "spam", actorId: "moderator", event: { id: "event-2", commentId: first.id, fromStatus: "pending", toStatus: "spam", actorId: "moderator", reasonCode: "duplicate", createdAt: now } })).resolves.toBeNull();
    const events = await client.execute({
      sql: "SELECT id, to_status FROM aria_public_comment_moderation_events WHERE comment_id = ? ORDER BY id",
      args: [first.id],
    });
    expect(events.rows).toEqual([{ id: "event-1", to_status: "approved" }]);
  });

  it.each([
    ["SQLite", () => new SQLiteStorageAdapter(client, { seedStarterLayouts: false, seedStarterPages: false, seedStarterCms: false, seedStarterDesign: false, seedStarterSiteSettings: false })],
    ["D1", () => new CloudflareStorageAdapter({ aria_db: createD1Mock(client) } as any)],
  ])("enforces durable rolling submission reservations on %s", async (_name, createAdapter) => {
    const adapter = createAdapter();
    const reserve = (index: number) => adapter.reservePublicCommentRateSlot({
      id: `reserve-${index}`, authorId: "visitor", entryId: "entry", locale: "en",
      idempotencyKey: `reservation-key-${index}`.padEnd(16, "x"), createdAt: now,
      windowStart: "2026-07-13T11:50:00.000Z", authorLimit: 2, entryLimit: 3,
    });
    await expect(reserve(1)).resolves.toBe(true);
    await expect(reserve(2)).resolves.toBe(true);
    await expect(reserve(3)).resolves.toBe(false);
    await expect(adapter.reservePublicCommentRateSlot({
      id: "entry-reserve", authorId: "other", entryId: "entry", locale: "en",
      idempotencyKey: "entry-reserve-key", createdAt: now,
      windowStart: "2026-07-13T11:50:00.000Z", authorLimit: 2, entryLimit: 3,
    })).resolves.toBe(true);
    await expect(adapter.reservePublicCommentRateSlot({
      id: "entry-reserve-over", authorId: "third", entryId: "entry", locale: "en",
      idempotencyKey: "entry-reserve-over", createdAt: now,
      windowStart: "2026-07-13T11:50:00.000Z", authorLimit: 2, entryLimit: 3,
    })).resolves.toBe(false);
  });

  it.each([
    ["SQLite", () => new SQLiteStorageAdapter(client, { seedStarterLayouts: false, seedStarterPages: false, seedStarterCms: false, seedStarterDesign: false, seedStarterSiteSettings: false })],
    ["D1", () => new CloudflareStorageAdapter({ aria_db: createD1Mock(client) } as any)],
  ])("anonymizes deleted commenter projections while retaining moderation records on %s", async (_name, createAdapter) => {
    const adapter = createAdapter();
    await adapter.createPublicComment(comment());
    await adapter.reservePublicCommentRateSlot({
      id: "erase-reservation", authorId: "visitor", entryId: "entry", locale: "en",
      idempotencyKey: "erase-reserve-key", createdAt: now, windowStart: "2026-07-13T11:50:00.000Z", authorLimit: 5, entryLimit: 20,
    });
    await adapter.anonymizePublicCommentsForDeletedAuthor("visitor");
    expect(await adapter.getPublicComment("comment-1")).toMatchObject({ authorId: "deleted:visitor", authorName: "Deleted user" });
    const reservations = await client.execute({ sql: "SELECT * FROM aria_public_comment_rate_reservations WHERE author_id = ?", args: ["visitor"] });
    expect(reservations.rows).toEqual([]);
  });

  it.each([
    ["SQLite", () => new SQLiteStorageAdapter(client, { seedStarterLayouts: false, seedStarterPages: false, seedStarterCms: false, seedStarterDesign: false, seedStarterSiteSettings: false })],
    ["D1", () => new CloudflareStorageAdapter({ aria_db: createD1Mock(client) } as any)],
  ])("prunes expired durable rate reservations on %s", async (_name, createAdapter) => {
    const adapter = createAdapter();
    await adapter.reservePublicCommentRateSlot({
      id: "old-reservation", authorId: "visitor", entryId: "entry", locale: "en",
      idempotencyKey: "old-reserve-key", createdAt: "2026-07-10T12:00:00.000Z",
      windowStart: "2026-07-10T11:50:00.000Z", authorLimit: 5, entryLimit: 20,
    });
    await adapter.prunePublicCommentRateReservations("2026-07-11T12:00:00.000Z");
    const rows = await client.execute({ sql: "SELECT * FROM aria_public_comment_rate_reservations", args: [] });
    expect(rows.rows).toEqual([]);
  });

  it.each([
    ["SQLite", () => new SQLiteStorageAdapter(client, { seedStarterLayouts: false, seedStarterPages: false, seedStarterCms: false, seedStarterDesign: false, seedStarterSiteSettings: false })],
    ["D1", () => new CloudflareStorageAdapter({ aria_db: createD1Mock(client) } as any)],
  ])("reports scoped moderation metrics on %s", async (_name, createAdapter) => {
    const adapter = createAdapter();
    const first = await adapter.createPublicComment(comment());
    await adapter.createPublicComment({ ...comment("comment-2"), idempotencyKey: "b".repeat(16), status: "approved" });
    await adapter.moderatePublicComment({ commentId: first.id, expectedStatus: "pending", nextStatus: "spam", actorId: "moderator", event: { id: "metrics-event", commentId: first.id, fromStatus: "pending", toStatus: "spam", actorId: "moderator", reasonCode: null, createdAt: now } });
    await expect(adapter.getPublicCommentModerationMetrics({ collectionId: "posts" })).resolves.toEqual({ pending: 0, approved: 1, rejected: 0, spam: 1, deleted: 0, oldestPendingAt: null });
  });
});
