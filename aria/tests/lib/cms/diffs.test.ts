import { describe, expect, it } from "vitest";
import { diffEntrySnapshots } from "../../../lib/cms/services/diffs";

const base = {
  entry: { id: "entry", collectionId: "posts", status: "draft" as const, version: "v1", authorId: "author", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", publishedAt: null, scheduledFor: null },
  locales: [{ entryId: "entry", collectionId: "posts", locale: "en", slug: "before", title: "Before", frontmatter: { visible: "old", private: "secret" }, body: "Old body", isSource: true, commentsClosed: false }],
  relations: [{ sourceEntryId: "entry", fieldKey: "visible", targetEntryId: "one", position: 0 }],
};

describe("entry revision diffs", () => {
  it("reports supported changes while projecting restricted fields", () => {
    const result = diffEntrySnapshots({
      entryId: "entry", locale: "en", left: base,
      right: {
        ...base,
        locales: [{ ...base.locales[0], slug: "after", title: "After", frontmatter: { visible: "new", private: "changed" }, body: "New body" }],
        relations: [{ sourceEntryId: "entry", fieldKey: "visible", targetEntryId: "two", position: 0 }],
      },
      visibleFields: new Set(["title", "slug", "body", "visible"]),
    });
    expect(result.changes.map((change) => change.field)).toEqual([
      "title", "slug", "body", "visible", "relations",
    ]);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("changed");
  });
});
