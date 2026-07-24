import { describe, expect, it } from "vitest";

import { buildPageDeleteRoutingUnbindPatches } from "../../../../admin/features/Studio/pages/lib/pageDeleteRouting";
import type { PageCmsRoutingImpact } from "../../../../lib/pages/cmsTemplatePolicy";

describe("buildPageDeleteRoutingUnbindPatches", () => {
  it("builds entry-template unbind patches", () => {
    const impact: PageCmsRoutingImpact = {
      pageId: "page-template",
      templateCollections: [
        { id: "collection-blog", name: "blog", label: "Blog" },
      ],
      listCollections: [],
    };

    expect(buildPageDeleteRoutingUnbindPatches(impact)).toEqual([
      {
        collectionId: "collection-blog",
        patch: { templatePageId: null },
      },
    ]);
  });

  it("merges entry and list template unbind patches for one collection", () => {
    const impact: PageCmsRoutingImpact = {
      pageId: "page-archive",
      templateCollections: [
        { id: "collection-blog", name: "blog", label: "Blog" },
      ],
      listCollections: [
        { id: "collection-blog", name: "blog", label: "Blog" },
      ],
    };

    expect(buildPageDeleteRoutingUnbindPatches(impact)).toEqual([
      {
        collectionId: "collection-blog",
        patch: {
          templatePageId: null,
          listPageId: null,
        },
      },
    ]);
  });
});
