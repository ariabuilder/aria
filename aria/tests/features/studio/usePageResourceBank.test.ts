import { beforeEach, describe, expect, it } from "vitest";
import type { PageDSL } from "@/lib/types/nodes";
import {
  __resetPageResourceBankForTests,
  __setPageResourceBankLoaderForTests,
  getCachedPageResource,
  invalidatePageResource,
  isPageResourceStale,
  loadPageResource,
  prefetchPageResource,
} from "@/features/Studio/pages/composables/usePageResourceBank";

function page(slug: string): PageDSL {
  return {
    id: slug,
    slug,
    title: slug,
    status: "draft",
    nodes: [],
    updatedAt: "2026-06-29T00:00:00.000Z",
  };
}

describe("usePageResourceBank", () => {
  beforeEach(() => {
    __resetPageResourceBankForTests();
  });

  it("returns a cached page without calling the loader again", async () => {
    let calls = 0;
    __setPageResourceBankLoaderForTests(async (slug) => {
      calls += 1;
      return { page: page(slug) };
    });

    const first = await loadPageResource("home");
    const second = await loadPageResource("home");

    expect(first.page.slug).toBe("home");
    expect(second.page.slug).toBe("home");
    expect(calls).toBe(1);
  });

  it("keeps cached pages valid until an explicit invalidation", async () => {
    let calls = 0;
    __setPageResourceBankLoaderForTests(async (slug) => {
      calls += 1;
      return { page: page(slug) };
    });

    const originalNow = Date.now;
    let now = 1_000;
    Date.now = () => now;

    try {
      const first = await loadPageResource("home");
      now += 24 * 60 * 60 * 1_000;
      const second = await loadPageResource("home");

      expect(second).toBe(first);
      expect(isPageResourceStale(second)).toBe(false);
      expect(calls).toBe(1);
    } finally {
      Date.now = originalNow;
    }
  });

  it("retains invalidated content and performs one targeted refresh", async () => {
    let calls = 0;
    __setPageResourceBankLoaderForTests(async (slug) => {
      calls += 1;
      return { page: page(slug) };
    });

    const first = await loadPageResource("home");
    invalidatePageResource("home", "remote-mutation");

    const invalidated = getCachedPageResource("home");
    expect(invalidated?.page).toEqual(first.page);
    expect(invalidated && isPageResourceStale(invalidated)).toBe(true);
    expect(invalidated?.invalidationReason).toBe("remote-mutation");

    const refreshed = await loadPageResource("home", { revalidate: true });
    expect(isPageResourceStale(refreshed)).toBe(false);
    expect(calls).toBe(2);
  });

  it("dedupes concurrent loads for the same slug", async () => {
    let calls = 0;
    let resolveLoad!: (value: { page: PageDSL }) => void;

    __setPageResourceBankLoaderForTests(
      () =>
        new Promise((resolve) => {
          calls += 1;
          resolveLoad = resolve;
        }),
    );

    const first = loadPageResource("about");
    const second = loadPageResource("about");

    resolveLoad({ page: page("about") });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.page.slug).toBe("about");
    expect(secondResult.page.slug).toBe("about");
    expect(calls).toBe(1);
  });

  it("keeps the most recent 25 full-page entries", async () => {
    __setPageResourceBankLoaderForTests(async (slug) => ({ page: page(slug) }));

    for (let index = 0; index < 30; index += 1) {
      await loadPageResource(`page-${index}`);
    }

    expect(getCachedPageResource("page-0")).toBeNull();
    expect(getCachedPageResource("page-29")?.page.slug).toBe("page-29");
  });

  it("swallows prefetch failures", async () => {
    __setPageResourceBankLoaderForTests(async () => {
      throw new Error("network hiccup");
    });

    await expect(prefetchPageResource("slow-page")).resolves.toBeUndefined();
    expect(getCachedPageResource("slow-page")).toBeNull();
  });
});
