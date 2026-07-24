/**
 * Reorder pages, layouts, and components in the sidebar.
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import {
  getAdapter,
  log,
  startPerformanceTracking,
  endPerformanceTracking,
  handleError,
  resolveAuthorizedMutation,
  saveResource,
  type CollectionType,
} from "./_shared";

const UpdateOrderInputSchema = z.object({
  kind: z.enum(["pages", "layouts", "components"]),
  order: z.array(z.string()),
});

export const ordering = {
  /**
   * Update order for pages, layouts, or components
   *
   * Reorders items in the sidebar list by updating the order property
   * on each resource. Processes updates in parallel for performance.
   *
   * @param kind - Type of resource collection to reorder
   * @param order - Array of slugs in desired order
   * @returns Success status with count of updated items
   */
  updateOrder: defineAction({
    accept: "json",
    input: UpdateOrderInputSchema,
    handler: async ({ kind, order }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "ordering.updateOrder",
        "save-order",
      );

      const operation = `updateOrder:${kind}`;
      startPerformanceTracking(operation);

      try {
        const adapter = await getAdapter(context);
        const collection: CollectionType = kind;

        const updates = order.map(async (slug, index) => {
          try {
            let existingItem;

            switch (collection) {
              case "pages":
                existingItem = await adapter.getPageDSL(slug);
                if (existingItem) {
                  await saveResource(
                    adapter,
                    context,
                    "pages",
                    slug,
                    {
                      ...existingItem,
                      order: index,
                      updatedAt: new Date().toISOString(),
                    },
                    authorship,
                  );
                }
                break;
              case "layouts":
                existingItem = await adapter.getLayoutDSL(slug);
                if (existingItem) {
                  await saveResource(
                    adapter,
                    context,
                    "layouts",
                    slug,
                    {
                      ...existingItem,
                      order: index,
                      updatedAt: new Date().toISOString(),
                    },
                    authorship,
                  );
                }
                break;
              case "components":
                existingItem = await adapter.getComponentDSL(slug);
                if (existingItem) {
                  await saveResource(
                    adapter,
                    context,
                    "components",
                    slug,
                    {
                      ...existingItem,
                      order: index,
                      updatedAt: new Date().toISOString(),
                    },
                    authorship,
                  );
                }
                break;
            }
            return !!existingItem;
          } catch (error) {
            log("warn", `Failed to update order for ${kind}:${slug}`, {
              error: error instanceof Error ? error.message : String(error),
            });
            return false;
          }
        });

        const results = await Promise.all(updates);
        const updated = results.filter(Boolean).length;

        endPerformanceTracking(operation);
        log("info", `Updated ${kind} order`, { updated });

        return { success: true, kind, updated };
      } catch (error) {
        endPerformanceTracking(operation);
        return handleError(error, operation);
      }
    },
  }),
};
