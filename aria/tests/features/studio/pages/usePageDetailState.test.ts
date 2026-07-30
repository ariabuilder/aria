import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PageDSL } from "@/lib/types/nodes";
import {
  resolveLoadedPageDetail,
  setPageDetailRemoteLoadMerge,
  __resetPageDetailStateForTests,
  usePageDetailState,
} from "@/features/Studio/pages/composables/usePageDetailState";
import {
  __resetPageResourceBankForTests,
  __setPageResourceBankLoaderForTests,
  invalidatePageResource,
} from "@/features/Studio/pages/composables/usePageResourceBank";

const routeState = vi.hoisted(() => ({
  params: { slug: "home" },
}));

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
}));

function pageWithSeo(
  slug: string,
  seo: NonNullable<NonNullable<PageDSL["settings"]>["seo"]>,
  title = slug,
): PageDSL {
  return {
    id: slug,
    slug,
    title,
    status: "draft",
    nodes: [],
    settings: { seo },
    updatedAt: "2026-07-03T00:00:00.000Z",
  };
}

describe("resolveLoadedPageDetail", () => {
  it("replaces the page when no merge hook is registered", () => {
    const current = pageWithSeo("home", { title: "Local title" });
    const incoming = pageWithSeo("home", { title: "Server title" }, "Updated");

    expect(resolveLoadedPageDetail(current, incoming, null)).toEqual(incoming);
  });

  it("preserves local SEO while accepting other incoming fields", () => {
    const current = pageWithSeo("home", {
      title: "Edited title",
      description: "Edited description",
    });
    const incoming = pageWithSeo("home", {
      title: "Server title",
      description: "Server description",
    }, "Server title");

    const merged = resolveLoadedPageDetail(current, incoming, (local, remote) => ({
      ...remote,
      settings: {
        ...remote.settings,
        seo: local.settings?.seo,
      },
    }));

    expect(merged.title).toBe("Server title");
    expect(merged.settings?.seo).toEqual({
      title: "Edited title",
      description: "Edited description",
    });
  });

  it("uses the registered remote load merge hook by default", () => {
    __resetPageDetailStateForTests();
    setPageDetailRemoteLoadMerge((current, incoming) => ({
      ...incoming,
      settings: {
        ...incoming.settings,
        seo: current.settings?.seo,
      },
    }));

    const current = pageWithSeo("blog", { ogImage: "/uploads/local.png" });
    const incoming = pageWithSeo("blog", { ogImage: "/uploads/server.png" });

    expect(resolveLoadedPageDetail(current, incoming).settings?.seo).toEqual({
      ogImage: "/uploads/local.png",
    });

    __resetPageDetailStateForTests();
  });
});

describe("usePageDetailState load contract", () => {
  beforeEach(() => {
    routeState.params.slug = "home";
    __resetPageDetailStateForTests();
    __resetPageResourceBankForTests();
  });

  it("does not resolve a stale cached load before revalidation finishes", async () => {
    __setPageResourceBankLoaderForTests(async () => ({
      page: {
        ...pageWithSeo("home", { title: "Initial" }),
        version: "v1",
      },
    }));

    const state = usePageDetailState();
    await state.loadPage("home");
    expect(state.page.value?.version).toBe("v1");

    invalidatePageResource("home", "saved");

    let resolveFresh:
      | ((bundle: {
          page: PageDSL;
        }) => void)
      | undefined;
    __setPageResourceBankLoaderForTests(
      () =>
        new Promise((resolve) => {
          resolveFresh = resolve;
        }),
    );

    let settled = false;
    const pendingLoad = state.loadPage("home").then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(state.page.value?.version).toBe("v1");
    expect(settled).toBe(false);

    resolveFresh?.({
      page: {
        ...pageWithSeo("home", { title: "Saved" }),
        version: "v2",
      },
    });
    await pendingLoad;

    expect(settled).toBe(true);
    expect(state.page.value?.version).toBe("v2");
  });
});
