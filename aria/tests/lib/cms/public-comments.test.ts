import { describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "../../../lib/storage/adapter";
import {
  assertPublicCommentTarget,
  listApprovedPublicComments,
  normalizePublicCommentBody,
  projectPublicComment,
} from "../../../lib/cms/services/publicComments";

function adapterFixture(overrides: Record<string, unknown> = {}) {
  const collection = {
    id: "posts",
    name: "posts",
    label: "Posts",
    kind: "content",
    schema: {
      id: "posts",
      label: "Posts",
      kind: "content",
      fields: [],
      comments: { enabled: true },
      version: 1,
    },
    scope: "global",
    urlPattern: "/posts/{slug}",
    templatePageId: "post-template",
    listPageId: null,
    supports: ["comments"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const record = {
    entry: {
      id: "post-1",
      collectionId: "posts",
      status: "published",
      version: "v1",
      authorId: "author",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      publishedAt: "2026-01-01T00:00:00.000Z",
      scheduledFor: null,
    },
    locales: [{
      entryId: "post-1",
      collectionId: "posts",
      locale: "en",
      slug: "hello",
      title: "Hello",
      frontmatter: {},
      body: null,
      isSource: true,
      commentsClosed: false,
    }],
  };
  return {
    getCollection: vi.fn(async () => collection),
    listCollections: vi.fn(async () => [collection]),
    getEntry: vi.fn(async () => record),
    getSiteSettings: vi.fn(async () => null),
    getPagePolicy: vi.fn(async () => ({ accessMode: "public" })),
    listPublicComments: vi.fn(async () => [{
      id: "comment-1", collectionId: "posts", entryId: "post-1", locale: "en",
      authorId: "visitor-id", authorName: "Visitor", body: "Safe text", status: "approved",
      idempotencyKey: "a".repeat(16), createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z", moderatedAt: null, moderatedById: null,
    }]),
    ...overrides,
  } as unknown as StorageAdapter;
}

describe("public comment policy", () => {
  it("requires an enabled published exact-locale route and projects no identity", async () => {
    const adapter = adapterFixture();
    await expect(assertPublicCommentTarget(adapter, {
      collectionId: "posts", entryId: "post-1", locale: "en",
    })).resolves.toBeTruthy();
    await expect(listApprovedPublicComments(adapter, {
      collectionId: "posts", entryId: "post-1", locale: "en",
    })).resolves.toEqual([{
      id: "comment-1", locale: "en", authorName: "Visitor", body: "Safe text",
      createdAt: "2026-01-01T00:00:00.000Z",
    }]);
  });

  it("does not distinguish a closed locale from an unavailable target", async () => {
    const adapter = adapterFixture({
      getEntry: vi.fn(async () => ({
        entry: { id: "post-1", collectionId: "posts", status: "published", version: "v1", authorId: "author", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", publishedAt: null, scheduledFor: null },
        locales: [{ entryId: "post-1", collectionId: "posts", locale: "en", slug: "hello", title: "Hello", frontmatter: {}, body: null, isSource: true, commentsClosed: true }],
      })),
    });
    await expect(assertPublicCommentTarget(adapter, {
      collectionId: "posts", entryId: "post-1", locale: "en",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("normalizes plaintext and excludes internal comment fields", () => {
    expect(normalizePublicCommentBody("  café\n ")).toBe("café");
    expect(() => normalizePublicCommentBody("\u0000no")).toThrow(/control/i);
    expect(projectPublicComment({
      id: "comment-1", collectionId: "posts", entryId: "post-1", locale: "en",
      authorId: "private", authorName: "Visitor", body: "Text", status: "approved",
      idempotencyKey: "a".repeat(16), createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z", moderatedAt: null, moderatedById: null,
    })).not.toHaveProperty("authorId");
  });
});
