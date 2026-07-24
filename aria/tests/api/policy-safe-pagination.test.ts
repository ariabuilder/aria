import { describe, expect, it } from "vitest";
import type { SessionUser } from "../../lib/auth/types";
import type { AriaEntryRecord } from "../../lib/cms/schemas";
import { listPolicySafeEntries } from "../../lib/cms/services/policySafeEntryCursor";
import type { StorageAdapter } from "../../lib/storage/adapter";

const actor: SessionUser = {
  id: "10000000-0000-4000-8000-000000000001",
  username: "api-user",
  email: "api@example.test",
  role: "contributor",
  totpEnabled: false,
};

function record(index: number, owner: string): AriaEntryRecord {
  const id = `entry-${String(index).padStart(3, "0")}`;
  return {
    entry: {
      id,
      collectionId: "posts",
      status: index % 2 === 0 ? "published" : "draft",
      version: `v-${index}`,
      authorId: owner,
      createdAt: `2026-07-18T12:${String(index % 60).padStart(2, "0")}:00.000Z`,
      updatedAt: `2026-07-18T12:${String(index % 60).padStart(2, "0")}:00.000Z`,
      publishedAt: null,
      scheduledFor: null,
    },
    locales: [
      {
        entryId: id,
        collectionId: "posts",
        locale: "en",
        slug: id,
        title: owner === actor.id ? `Visible ${index}` : `Hidden ${index}`,
        frontmatter: {},
        body: null,
        isSource: true,
      },
    ],
  };
}

describe("policy-safe API pagination", () => {
  it("fills a page after policy projection without exposing hidden totals", async () => {
    const records = Array.from({ length: 130 }, (_, index) =>
      record(index, index >= 80 ? actor.id : "someone-else"),
    );
    const adapter = {
      getCollection: async () => ({ id: "posts" }),
      getCollectionPolicy: async () => ({
        collectionId: "posts",
        mode: "restricted",
        rules: [
          {
            principalId: actor.id,
            actions: ["read"],
            documentScope: "own",
            locales: [],
          },
        ],
        updatedAt: "2026-07-18T12:00:00.000Z",
      }),
      getSiteSettings: async () => null,
      listEntries: async ({ page = 1, limit = 100 }) => ({
        items: records.slice((page - 1) * limit, page * limit),
        total: records.length,
        page,
        limit,
      }),
    } as unknown as StorageAdapter;

    const first = await listPolicySafeEntries({
      adapter,
      actor,
      collectionId: "posts",
      pageSize: 10,
    });
    expect(first.items).toHaveLength(10);
    expect(first.items.map((item) => item.entry.id)).toEqual(
      Array.from({ length: 10 }, (_, offset) =>
        `entry-${String(80 + offset).padStart(3, "0")}`,
      ),
    );
    expect(first.next).toEqual({ page: 1, index: 90 });
    expect(first).not.toHaveProperty("total");

    const published = await listPolicySafeEntries({
      adapter,
      actor,
      collectionId: "posts",
      status: "published",
      query: "visible",
      pageSize: 10,
      cursor: first.next ?? undefined,
    });
    expect(published.items).toHaveLength(10);
    expect(published.items.every((item) => item.entry.status === "published")).toBe(
      true,
    );
  });
});
