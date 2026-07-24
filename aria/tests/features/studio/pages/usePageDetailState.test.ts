import { describe, expect, it } from "vitest";
import type { PageDSL } from "@/lib/types/nodes";
import {
  resolveLoadedPageDetail,
  setPageDetailRemoteLoadMerge,
  __resetPageDetailStateForTests,
} from "@/features/Studio/pages/composables/usePageDetailState";

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
