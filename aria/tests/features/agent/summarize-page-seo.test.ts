import { describe, expect, it } from "vitest";
import { summarizePageDslForSeo } from "../../../admin/features/Agent/lib/tools/content/summarize";
import type { PageDSL } from "../../../lib/types/nodes";

describe("summarizePageDslForSeo", () => {
  it("extracts headings, visible text, and current SEO fields", () => {
    const page: PageDSL = {
      id: "blog",
      slug: "blog",
      title: "Blog",
      description: "Latest posts",
      systemRole: "cms-collection",
      nodes: [
        {
          id: "hero",
          type: "Section",
          props: {},
          styles: {},
          children: [
            {
              id: "h1",
              type: "h1",
              props: { text: "Our Blog" },
              styles: {},
              children: [],
            },
            {
              id: "p",
              type: "p",
              props: { text: "Stories from the team." },
              styles: {},
              children: [],
            },
          ],
        },
      ],
      settings: {
        seo: {
          title: "Old title",
          description: "Old description",
        },
      },
      version: "1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const summary = summarizePageDslForSeo(page);

    expect(summary.slug).toBe("blog");
    expect(summary.systemRole).toBe("cms-collection");
    expect(summary.headings).toEqual(["Our Blog"]);
    expect(summary.contentExcerpt).toContain("Stories from the team.");
    expect(summary.seo).toEqual({
      title: "Old title",
      description: "Old description",
      ogTitle: undefined,
      ogDescription: undefined,
      ogImage: undefined,
      canonical: undefined,
      noindex: undefined,
      nofollow: undefined,
    });
  });
});
