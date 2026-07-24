import { nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PageDSL } from "../../../lib/types/nodes";

const { collectionsListMock, entriesListMock } = vi.hoisted(() => ({
  collectionsListMock: vi.fn(),
  entriesListMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    cms: {
      collections: {
        list: collectionsListMock,
      },
      entries: {
        list: entriesListMock,
      },
    },
  },
}));

async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
    await nextTick();
  }
}

describe("useCmsPreviewEntryContext", () => {
  beforeEach(() => {
    collectionsListMock.mockReset();
    entriesListMock.mockReset();
  });

  it("keeps preview entry id, slug, and render options in sync when selecting another entry", async () => {
    collectionsListMock.mockResolvedValue({
      data: {
        collections: [
          {
            id: "collection-tags",
            name: "tags",
            label: "Tags",
            kind: "tags",
            templatePageId: "tag-archive",
            listPageId: null,
          },
        ],
      },
      error: null,
    });
    entriesListMock.mockResolvedValue({
      data: {
        items: [
          {
            entry: {
              id: "tag-design",
              collectionId: "collection-tags",
              status: "published",
            },
            locales: [
              {
                entryId: "tag-design",
                collectionId: "collection-tags",
                locale: "en",
                slug: "design",
                title: "Design",
                frontmatter: {},
                body: null,
                isSource: true,
              },
            ],
          },
        ],
      },
      error: null,
    });

    const currentPage = ref<PageDSL | null>({
      id: "tag-archive",
      slug: "tag-archive",
      title: "Tag Archive",
      nodes: [],
    });
    const previewContextModule = await import(
      "../../../admin/features/CMS/composables/useCmsPreviewEntryContext"
    );
    const useCmsPreviewEntryContext =
      previewContextModule.useCmsPreviewEntryContext as (page: unknown) => {
        entryContext: { value: unknown };
        previewEntryId: { value: string };
        previewEntrySlug: { value: string };
        cmsRenderOptions: { value: unknown };
        setPreviewEntry: (entry: { id: string; slug: string }) => void;
      };
    const context = useCmsPreviewEntryContext(currentPage);

    await settle();

    expect(context.entryContext.value).toEqual({
      collectionId: "collection-tags",
      entryId: "tag-design",
      slug: "design",
    });

    context.setPreviewEntry({
      id: "tag-engineering",
      slug: "engineering",
    });

    expect(context.previewEntryId.value).toBe("tag-engineering");
    expect(context.previewEntrySlug.value).toBe("engineering");
    expect(context.cmsRenderOptions.value).toEqual({
      preview: true,
      entryContext: {
        collectionId: "collection-tags",
        entryId: "tag-engineering",
        slug: "engineering",
      },
    });
  });
});
