import { describe, expect, it } from "vitest";

import type { AriaCollection } from "../../../../lib/cms/schemas";
import {
  buildCmsEntryPreviewUrl,
  buildContentPreviewUrl,
  buildPagePreviewUrl,
  getPreviewDisabledReason,
} from "./buildContentPreviewUrl";

type PreviewCollectionFixture = Partial<Pick<
  AriaCollection,
  "urlPattern" | "templatePageId"
>>;

function collectionFixture(fixture: PreviewCollectionFixture = {}): AriaCollection {
  return fixture as AriaCollection;
}

const readyCollection = collectionFixture({
  urlPattern: "/posts/{slug}",
  templatePageId: "page-template",
});

describe("buildCmsEntryPreviewUrl", () => {
  it("interpolates the entry slug into the collection URL pattern", () => {
    expect(
      buildCmsEntryPreviewUrl({
        collection: readyCollection,
        slug: "hello-world",
        status: "published",
      }),
    ).toBe("/posts/hello-world");
  });

  it("adds preview=1 for draft and scheduled entries", () => {
    expect(
      buildCmsEntryPreviewUrl({
        collection: readyCollection,
        slug: "draft-post",
        status: "draft",
      }),
    ).toBe("/posts/draft-post?preview=1");

    expect(
      buildCmsEntryPreviewUrl({
        collection: readyCollection,
        slug: "scheduled-post",
        status: "scheduled",
      }),
    ).toBe("/posts/scheduled-post?preview=1");
  });

  it("returns null when the collection is missing routing prerequisites", () => {
    expect(
      buildCmsEntryPreviewUrl({
        collection: collectionFixture({
          urlPattern: null,
          templatePageId: "page-template",
        }),
        slug: "hello-world",
        status: "draft",
      }),
    ).toBeNull();

    expect(
      buildCmsEntryPreviewUrl({
        collection: collectionFixture({
          urlPattern: "/posts/{slug}",
          templatePageId: null,
        }),
        slug: "hello-world",
        status: "draft",
      }),
    ).toBeNull();
  });

  it("returns null for unsupported URL pattern tokens", () => {
    expect(
      buildCmsEntryPreviewUrl({
        collection: collectionFixture({
          urlPattern: "/posts/{id}",
          templatePageId: "page-template",
        }),
        slug: "hello-world",
        status: "draft",
      }),
    ).toBeNull();
  });
});

describe("buildPagePreviewUrl", () => {
  it("maps index to the site root", () => {
    expect(
      buildPagePreviewUrl({
        slug: "index",
        status: "published",
      }),
    ).toBe("/");
  });

  it("adds preview=1 for draft and scheduled pages", () => {
    expect(
      buildPagePreviewUrl({
        slug: "about",
        status: "draft",
      }),
    ).toBe("/about?preview=1");

    expect(
      buildPagePreviewUrl({
        slug: "about",
        status: "scheduled",
      }),
    ).toBe("/about?preview=1");
  });

  it("keeps published and archived pages on their public URLs", () => {
    expect(
      buildPagePreviewUrl({
        slug: "about",
        status: "published",
      }),
    ).toBe("/about");

    expect(
      buildPagePreviewUrl({
        slug: "about",
        status: "archived",
      }),
    ).toBe("/about");
  });
});

describe("buildContentPreviewUrl", () => {
  it("dispatches CMS entry and page inputs to the matching builder", () => {
    expect(
      buildContentPreviewUrl({
        kind: "cms_entry",
        collection: readyCollection,
        slug: "launch-notes",
        status: "published",
      }),
    ).toBe("/posts/launch-notes");

    expect(
      buildContentPreviewUrl({
        kind: "page",
        slug: "contact",
        status: "draft",
      }),
    ).toBe("/contact?preview=1");
  });
});

describe("getPreviewDisabledReason", () => {
  it("returns null for page previews", () => {
    expect(
      getPreviewDisabledReason({
        kind: "page",
        slug: "home",
        status: "draft",
      }),
    ).toBeNull();
  });

  it("explains why CMS preview is disabled when routing is incomplete", () => {
    expect(
      getPreviewDisabledReason({
        kind: "cms_entry",
        collection: collectionFixture({
          urlPattern: null,
          templatePageId: null,
        }),
        slug: "hello-world",
        status: "draft",
      }),
    ).toBe("Set a URL pattern in collection settings to enable preview.");

    expect(
      getPreviewDisabledReason({
        kind: "cms_entry",
        collection: collectionFixture({
          urlPattern: "/posts/{slug}",
          templatePageId: null,
        }),
        slug: "hello-world",
        status: "draft",
      }),
    ).toBe("Set a template page in collection settings to enable preview.");

    expect(
      getPreviewDisabledReason({
        kind: "cms_entry",
        collection: collectionFixture({
          urlPattern: "/posts/{id}",
          templatePageId: "page-template",
        }),
        slug: "hello-world",
        status: "draft",
      }),
    ).toBe("{id} is not supported yet. Use {slug}.");
  });

  it("returns a friendly reason when slug is empty during load", () => {
    expect(
      getPreviewDisabledReason({
        kind: "cms_entry",
        collection: collectionFixture(),
        slug: "",
        status: "draft",
      }),
    ).toBe("Missing entry slug.");
  });
});
