import { describe, expect, it } from "vitest";

import { resolvePagePublicationDependencies } from "../../lib/publishing/pageDependencies";
import type { StorageAdapter } from "../../lib/storage/adapter";
import type { BuilderNode, PageDSL } from "../../lib/types/nodes";

function componentRef(id: string): BuilderNode {
  return {
    id: `${id}-instance`,
    type: "Component",
    props: {},
    styles: {},
    children: [],
    reference: {
      id,
      masterId: id,
      type: "instance",
    },
  };
}

describe("page publication dependencies", () => {
  it("pins layout, region, page, and nested component revisions", async () => {
    const page: PageDSL = {
      id: "home",
      slug: "home",
      title: "Home",
      layout: "site-layout",
      nodes: [componentRef("hero")],
    };
    const adapter = {
      getLayoutDSL: async () => ({
        id: "site-layout",
        name: "Site layout",
        version: "layout-v3",
        nodes: [componentRef("footer")],
        slots: [{ name: "main", defaultContent: [componentRef("promo")] }],
        regions: { headerComponent: "header" },
      }),
      getComponentDSL: async (id: string) => ({
        id,
        name: id,
        category: "custom",
        version: `${id}-v2`,
        nodes: id === "hero" ? [componentRef("button")] : [],
      }),
    } as unknown as StorageAdapter;

    await expect(
      resolvePagePublicationDependencies(page, adapter),
    ).resolves.toEqual({
      layout: { id: "site-layout", version: "layout-v3" },
      components: {
        button: "button-v2",
        footer: "footer-v2",
        header: "header-v2",
        hero: "hero-v2",
        promo: "promo-v2",
      },
    });
  });

  it("fails closed when a referenced dependency has no saved revision", async () => {
    const page: PageDSL = {
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [componentRef("header")],
    };
    const adapter = {
      getComponentDSL: async () => ({
        id: "header",
        name: "Header",
        category: "custom",
        nodes: [],
      }),
    } as unknown as StorageAdapter;

    await expect(
      resolvePagePublicationDependencies(page, adapter),
    ).rejects.toThrow(/no saved revision/i);
  });
});
