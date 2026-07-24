import { describe, expect, it } from "vitest";

import {
  CmsLinkFieldValueSchema,
  materializeCmsLinkPropsOnNodes,
  resolveCmsLinkHref,
  resolveCmsLinkValue,
} from "../../../lib/cms/linkField";
import type { StorageAdapter } from "../../../lib/storage/adapter";
import type { AriaCollection } from "../../../lib/cms/schemas";

const blogCollection = {
  id: "collection-blog",
  name: "blog",
  label: "Blog",
  kind: "content",
  schema: {
    id: "collection-blog",
    label: "Blog",
    kind: "content",
    fields: [],
    version: 1,
  },
  scope: "global",
  urlPattern: "/blog/{slug}",
  templatePageId: "page-template",
  listPageId: "page-blog",
  supports: [],
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
} satisfies AriaCollection;

function createAdapterStub(): StorageAdapter {
  return {
    getPagePolicy: async (idOrSlug: string) => {
      if (idOrSlug === "page-about" || idOrSlug === "about") {
        return {
          id: "page-about",
          slug: "about",
          systemRole: "standard",
          accessMode: "public",
          accessPasswordHash: null,
          accessPromptTitle: null,
          accessPromptDescription: null,
          accessRememberForDays: null,
          accessPolicyVersion: 1,
          publishedVersion: "v1",
          updatedAt: "2026-06-30T00:00:00.000Z",
        };
      }
      return null;
    },
    getCollection: async (idOrSlug: string) => {
      if (idOrSlug === blogCollection.id || idOrSlug === blogCollection.name) {
        return blogCollection;
      }
      return null;
    },
    getEntry: async ({ idOrSlug }: { idOrSlug: string }) => {
      if (idOrSlug === "hello-world" || idOrSlug === "entry-1") {
        return {
          entry: {
            id: "entry-1",
            collectionId: blogCollection.id,
            slug: "hello-world",
            status: "published",
            version: "1",
            createdAt: "2026-06-30T00:00:00.000Z",
            updatedAt: "2026-06-30T00:00:00.000Z",
            publishedAt: "2026-06-30T00:00:00.000Z",
            scheduledFor: null,
            createdBy: null,
            updatedBy: null,
            publishedBy: null,
          },
          locales: [
            {
              entryId: "entry-1",
              locale: "en",
              isSource: true,
              title: "Hello World",
              slug: "hello-world",
              frontmatter: {},
              body: null,
              createdAt: "2026-06-30T00:00:00.000Z",
              updatedAt: "2026-06-30T00:00:00.000Z",
            },
          ],
          relations: [],
        };
      }
      return null;
    },
  } as unknown as StorageAdapter;
}

describe("resolveCmsLinkValue", () => {
  it("resolves external, email, phone, and internal links", async () => {
    const adapter = createAdapterStub();

    await expect(
      resolveCmsLinkValue(adapter, {
        type: "external",
        url: "example.com",
      }),
    ).resolves.toEqual({
      href: "https://example.com",
    });

    await expect(
      resolveCmsLinkValue(adapter, {
        type: "email",
        url: "hello@example.com",
      }),
    ).resolves.toEqual({
      href: "mailto:hello@example.com",
    });

    await expect(
      resolveCmsLinkValue(adapter, {
        type: "phone",
        url: "+15551234567",
      }),
    ).resolves.toEqual({
      href: "tel:+15551234567",
    });

    await expect(
      resolveCmsLinkValue(adapter, {
        type: "internal",
        url: "/pricing",
      }),
    ).resolves.toEqual({
      href: "/pricing",
    });
  });

  it("resolves page and entry links through storage", async () => {
    const adapter = createAdapterStub();

    await expect(
      resolveCmsLinkValue(adapter, {
        type: "page",
        pageId: "page-about",
      }),
    ).resolves.toEqual({
      href: "/about",
    });

    await expect(
      resolveCmsLinkValue(adapter, {
        type: "entry",
        collectionId: blogCollection.id,
        entryId: "entry-1",
      }),
    ).resolves.toEqual({
      href: "/blog/hello-world",
    });
  });

  it("adds preview query params for draft-stage page and entry links", async () => {
    const adapter = createAdapterStub();

    await expect(
      resolveCmsLinkHref(
        adapter,
        { type: "page", pageId: "page-about" },
        { preview: true },
      ),
    ).resolves.toBe("/about?preview=1");

    await expect(
      resolveCmsLinkHref(
        adapter,
        {
          type: "entry",
          collectionId: blogCollection.id,
          slug: "hello-world",
        },
        { preview: true },
      ),
    ).resolves.toBe("/blog/hello-world?preview=1");
  });

  it("materializes link objects on node href props", async () => {
    const adapter = createAdapterStub();
    const nodes = [
      {
        props: {
          href: CmsLinkFieldValueSchema.parse({
            type: "page",
            pageId: "page-about",
            openInNewTab: true,
          }),
        },
        children: [],
      },
    ];

    await materializeCmsLinkPropsOnNodes(nodes, adapter);

    expect(nodes[0]?.props).toEqual({
      href: "/about",
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });
});
