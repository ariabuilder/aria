import { describe, expect, it } from "vitest";

import { resolveIconRenderResources } from "../../lib/icons/resolveIconResources";
import type { IconProvider } from "../../lib/icons/staticIconProvider";
import type { BuilderNode } from "../../lib/types/nodes";

const iconNode = {
  id: "icon-1",
  type: "icon",
  props: { icon: "lucide:star" },
  styles: {},
  children: [],
} satisfies BuilderNode;

describe("resolveIconRenderResources", () => {
  it("keeps SSR available when static icon assets cannot be read", async () => {
    const unavailableProvider: IconProvider = {
      search: async () => ({
        items: [],
        nextCursor: null,
        snapshotVersion: "test",
      }),
      resolve: async () => {
        throw new Error("ICON_ASSET_READ_FAILED:404");
      },
    };

    const resources = await resolveIconRenderResources([iconNode], {
      provider: unavailableProvider,
    });

    expect(resources.icons.size).toBe(0);
  });
});
