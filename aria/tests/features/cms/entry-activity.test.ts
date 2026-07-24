import { describe, expect, it } from "vitest";
import { buildCmsEntryActivityItems } from "../../../admin/features/CMS/lib/entryActivity";
import type { AriaEntryRevision } from "../../../lib/cms/schemas";

function revision(
  overrides: Partial<AriaEntryRevision> & Pick<AriaEntryRevision, "id" | "createdAt">,
): AriaEntryRevision {
  return {
    entryId: "entry-1",
    locale: "en",
    version: "v1",
    snapshot: {
      entry: {
        id: "entry-1",
        collectionId: "posts",
        status: "draft",
        version: "v1",
        authorId: "user-1",
        createdAt: "2026-05-10T09:15:00.000Z",
        updatedAt: "2026-05-12T10:18:00.000Z",
        publishedAt: null,
        scheduledFor: null,
      },
      locales: [
        {
          entryId: "entry-1",
          collectionId: "posts",
          locale: "en",
          slug: "hello",
          title: "Hello",
          body: null,
          frontmatter: {},
          isSource: true,
        },
      ],
    },
    actorId: "user-1",
    authorship: {
      actor: {
        id: "user-1",
        username: "Jenny Wilson",
      },
    },
    ...overrides,
  };
}

describe("buildCmsEntryActivityItems", () => {
  it("maps revision avatar urls onto activity items", () => {
    const items = buildCmsEntryActivityItems({
      revisions: [
        revision({
          id: "rev-avatar",
          createdAt: "2026-05-12T10:24:00.000Z",
          message: "Before update",
          authorship: {
            actor: {
              id: "user-1",
              username: "Jenny Wilson",
              avatarUrl: "/uploads/jenny.avif",
            },
          },
        }),
      ],
    });

    expect(items[0]?.userAvatarUrl).toBe("/uploads/jenny.avif");
  });

  it("maps revision messages to activity copy", () => {
    const items = buildCmsEntryActivityItems({
      revisions: [
        revision({
          id: "rev-1",
          createdAt: "2026-05-12T10:24:00.000Z",
          message: "Before published",
        }),
        revision({
          id: "rev-2",
          createdAt: "2026-05-12T10:18:00.000Z",
          message: "Before update",
          authorship: {
            actor: { id: "user-1", username: "Jenny Wilson" },
          },
        }),
      ],
      canRestore: true,
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      action: "published",
      target: "this entry",
      isHighlighted: true,
      actions: [{ id: "restore", label: "Restore revision" }],
    });
    expect(items[1]).toMatchObject({
      action: "updated",
      target: "content",
    });
  });

  it("caps activity items at five", () => {
    const items = buildCmsEntryActivityItems({
      revisions: Array.from({ length: 8 }, (_, index) =>
        revision({
          id: `rev-${index}`,
          createdAt: `2026-05-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
          message: "Before update",
        }),
      ),
    });

    expect(items).toHaveLength(5);
  });

  it("falls back to entry metadata when revisions are empty", () => {
    const items = buildCmsEntryActivityItems({
      revisions: [],
      createdAt: "2026-05-10T09:15:00.000Z",
      createdBy: "Devon Lane",
      publishedAt: "2026-05-12T10:24:00.000Z",
      publishedBy: "Jenny Wilson",
    });

    expect(items[0]).toMatchObject({
      userName: "Jenny Wilson",
      action: "published",
      isHighlighted: true,
    });
    expect(items.at(-1)).toMatchObject({
      userName: "Devon Lane",
      action: "created",
    });
  });
});
