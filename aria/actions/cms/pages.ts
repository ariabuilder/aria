import { defineAction } from "astro:actions";
import {
  GetCmsPageUsageIndexRequestSchema,
  GetCmsPageUsageIndexResponseSchema,
} from "../../lib/cms/actionSchemas";
import { deriveCmsPageUsageIndex } from "../../lib/cms/pageUsageIndex";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import { requireOperation } from "../_shared";

export const pages = {
  usageIndex: defineAction({
    accept: "json",
    input: GetCmsPageUsageIndexRequestSchema,
    handler: async (_, context) => {
      await requireOperation(context, "cms.collections.list");
      await requireOperation(context, "pages.listInventory");
      const adapter = await getStorageAdapterAsync(context.locals);
      const [collections, pageInventory] = await Promise.all([
        adapter.listCollections(),
        adapter.listPagesDSL({ limit: 1000, offset: 0 }),
      ]);
      const pages = pageInventory.flatMap((page) =>
        page.slug
          ? [
              {
                id: page.id,
                slug: page.slug,
                title: page.title,
                systemRole: page.systemRole,
              },
            ]
          : [],
      );

      return GetCmsPageUsageIndexResponseSchema.parse(
        deriveCmsPageUsageIndex({
          collections,
          pages,
        }),
      );
    },
  }),
};
