import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";

const componentRevision = ref(0);
let componentText = "Old component text";

vi.mock("astro:actions", () => ({
  actions: {
    pages: {
      getMeta: vi.fn(async () => ({
        data: {
          success: true,
          data: {
            slug: "home",
            title: "Home",
            path: "/",
            status: "published",
            layout: {
              slug: null,
              name: null,
              hasHeader: false,
              hasFooter: false,
            },
            seo: {},
            frontmatter: [],
          },
        },
      })),
    },
    compose: vi.fn(async () => ({
      data: {
        pageBlocks: [
          {
            id: "header-instance",
            type: "Component",
            props: {},
            styles: {},
            children: [],
            reference: {
              id: "header",
              masterId: "header",
              type: "instance",
            },
          },
        ],
      },
    })),
  },
}));

vi.mock("@/features/Blocks/composables/useComponentFetcher", () => ({
  useComponentFetcher: () => ({
    revision: componentRevision,
    expandComponentReferencesClient: vi.fn(async () => [
      {
        id: "expanded-text",
        type: "Text",
        props: { text: componentText },
        styles: {},
        children: [],
      },
    ]),
  }),
}));

vi.mock(
  "@/features/Studio/pages/composables/useSeoHistory",
  () => ({
    useSeoHistory: () => ({
      recordSeoUpdate: vi.fn(async () => ({ success: true })),
    }),
  }),
);

describe("useSeoAnalysis component revisions", () => {
  beforeEach(async () => {
    componentRevision.value = 0;
    componentText = "Old component text";
    const { clearAllSeoCache } =
      await import("@/features/Studio/pages/composables/useSeoAnalysis");
    clearAllSeoCache();
  });

  it("re-expands cached page references after a component commit", async () => {
    const { useSeoAnalysis } =
      await import("@/features/Studio/pages/composables/useSeoAnalysis");
    const analysis = useSeoAnalysis(ref("home"));
    await analysis.refresh();

    expect(analysis.pageStats.value.wordCount).toBe(3);

    componentText = "Fresh component text with more words";
    componentRevision.value += 1;
    await nextTick();
    await Promise.resolve();
    await Promise.resolve();

    expect(analysis.pageStats.value.wordCount).toBe(6);
  });
});
