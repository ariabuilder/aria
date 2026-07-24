import { describe, expect, it } from "vitest";

import { AriaCollectionSchema } from "../../lib/cms/schemas";
import {
  buildUpgradedTagsCollectionForArchive,
  isTagArchiveStarterConfigured,
  TAG_ARCHIVE_URL_PATTERN,
} from "../../lib/storage/starterTagArchive";
import {
  buildTagArchiveTemplatePage,
  TAG_ARCHIVE_PAGE_ID,
  TAGS_COLLECTION_NAME,
} from "../../lib/storage/starterContent";

function tagsCollection() {
  return AriaCollectionSchema.parse({
    id: TAGS_COLLECTION_NAME,
    name: TAGS_COLLECTION_NAME,
    label: "Tags",
    kind: "tags",
    schema: {
      id: TAGS_COLLECTION_NAME,
      label: "Tags",
      kind: "tags",
      fields: [],
      version: 1,
    },
    scope: "global",
    urlPattern: null,
    templatePageId: null,
    listPageId: null,
    supports: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  });
}

describe("starterTagArchive", () => {
  it("detects when tags collection archive starter is configured", () => {
    expect(isTagArchiveStarterConfigured(tagsCollection())).toBe(false);
    expect(
      isTagArchiveStarterConfigured({
        urlPattern: TAG_ARCHIVE_URL_PATTERN,
        templatePageId: TAG_ARCHIVE_PAGE_ID,
      }),
    ).toBe(true);
  });

  it("builds upgraded tags collection with archive routing", () => {
    const upgraded = buildUpgradedTagsCollectionForArchive(
      tagsCollection(),
      "2026-07-03T00:00:00.000Z",
    );
    expect(upgraded.urlPattern).toBe("/tags/{slug}");
    expect(upgraded.templatePageId).toBe(TAG_ARCHIVE_PAGE_ID);
  });

  it("gives empty dynamic fields descriptive layer names", () => {
    const page = buildTagArchiveTemplatePage();
    const description = page.nodes.find(
      (node) => node.id === "tag-archive-description",
    );
    const list = page.nodes.find((node) => node.id === "tag-archive-list");
    const card = list?.children?.find((node) => node.id === "blog-list-card");
    const excerpt = card?.children?.find(
      (node) => node.id === "blog-list-card-excerpt",
    );
    const date = card?.children?.find(
      (node) => node.id === "blog-list-card-date",
    );

    expect(description?.metadata?.label).toBe("Tag description");
    expect(excerpt?.metadata?.label).toBe("Post excerpt");
    expect(date?.metadata?.label).toBe("Published date");
  });
});
