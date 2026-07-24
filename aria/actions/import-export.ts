/**
 * Astro actions for listing and exporting DSL resources back to. astro format.
 */

import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import {
  createDefaultUniversalDesignSystem,
  resolveBreakpointDefinitionsFromDesignSystem,
} from "../lib/styles/universalDesignSystem";
import { requireOperation } from "./_shared";
import { log as baseLog } from "../lib/utils/logger";

type LogLevel = "debug" | "info" | "warn" | "error";

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const prefix = `[Aria Export][${level.toUpperCase()}]`;

  baseLog(level, `${prefix} ${message}`, context);
}

function sanitizeInput(input: string): string {
  return input.replace(/[^a-zA-Z0-9-_./]/g, "");
}

export const importExport = {
  /**
   * List all exportable items
   *
   * Returns metadata for all pages, layouts, and components
   * that can be exported to .astro format.
   *
   * @returns Lists of exportable items by type
   */
  list: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireOperation(context, "importExport.list");

      try {
        const adapter = await getStorageAdapterAsync(context.locals);

        const [pages, layouts, components, collections] = await Promise.all([
          adapter.listPagesDSL(),
          adapter.listLayoutsDSL(),
          adapter.listComponentsDSL(),
          adapter.listCollections(),
        ]);
        const entryCounts = await adapter.countEntriesByCollection(
          collections.map((collection) => collection.id),
        );

        return {
          pages: pages.map((p) => ({
            id: p.id,
            title: p.title || p.id,
          })),
          layouts: layouts.map((l) => ({
            id: l.id,
            title: l.title || l.id,
          })),
          components: components.map((c) => ({
            id: c.id,
            title: c.title || c.id,
          })),
          cmsCollections: collections
            .map((collection) => ({
              id: collection.id,
              title: collection.label || collection.name || collection.id,
            }))
            .sort(
              (a, b) =>
                a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
            ),
          cmsEntries: collections
            .map((collection) => ({
              id: collection.id,
              title: collection.label || collection.name || collection.id,
              count: entryCounts[collection.id] ?? 0,
            }))
            .sort(
              (a, b) =>
                a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
            ),
        };
      } catch (error) {
        log("error", "Failed to list exportable items", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          pages: [],
          layouts: [],
          components: [],
          error: error instanceof Error ? error.message : "List failed",
        };
      }
    },
  }),

  /**
   * Export single item to .astro format
   *
   * Converts a single page, layout, or component from DSL
   * to .astro file format.
   *
   * @param type - Resource type (page, layout, component)
   * @param id - Resource identifier
   * @returns Generated .astro content and suggested file path
   */
  exportItem: defineAction({
    accept: "json",
    input: z.object({
      type: z.enum(["page", "layout", "component"]),
      id: z.string().min(1).max(255),
    }),
    handler: async ({ type, id }, context) => {
      await requireOperation(context, "importExport.exportItem");

      try {
        const sanitizedId = sanitizeInput(id);
        const adapter = await getStorageAdapterAsync(context.locals);
        const designSystem =
          (await adapter.getDesignSystem()) ??
          createDefaultUniversalDesignSystem();
        const canonicalBreakpoints =
          resolveBreakpointDefinitionsFromDesignSystem(designSystem);

        const { nodesToAstro, nodesToAstroLayout, nodesToAstroComponent } =
          await import("../lib/blocks/nodesToAstro");
        const { resolveIconRenderResources } = await import(
          "../lib/icons/resolveIconResources"
        );

        // Get the resource and convert based on type
        let astroContent: string;
        let filePath: string;

        if (type === "page") {
          const page = await adapter.getPageDSL(sanitizedId);
          if (!page) {
            return {
              success: false,
              error: `Page not found: ${sanitizedId}`,
            };
          }
          astroContent = nodesToAstro(page.nodes || [], {
            ...page,
            breakpoints: canonicalBreakpoints,
            iconResources: await resolveIconRenderResources(page.nodes || [], {
              locals: context.locals,
            }),
          });
          filePath = `src/pages/${sanitizedId}.astro`;
        } else if (type === "layout") {
          const layout = await adapter.getLayoutDSL(sanitizedId);
          if (!layout) {
            return {
              success: false,
              error: `Layout not found: ${sanitizedId}`,
            };
          }
          astroContent = nodesToAstroLayout(
            layout.nodes || [],
            layout.slots || [],
            {
              title: layout.title || layout.name,
              description: layout.description,
              breakpoints: canonicalBreakpoints,
              iconResources: await resolveIconRenderResources(
                [
                  ...(layout.nodes || []),
                  ...(layout.slots ?? []).flatMap(
                    (slot) => slot.defaultContent ?? [],
                  ),
                ],
                { locals: context.locals },
              ),
            },
          );
          filePath = `src/layouts/${sanitizedId}.astro`;
        } else {
          const component = await adapter.getComponentDSL(sanitizedId);
          if (!component) {
            return {
              success: false,
              error: `Component not found: ${sanitizedId}`,
            };
          }
          astroContent = nodesToAstroComponent(component.nodes || [], {
            ...component,
            breakpoints: canonicalBreakpoints,
            iconResources: await resolveIconRenderResources(
              component.nodes || [],
              { locals: context.locals },
            ),
          });
          filePath = `src/components/${sanitizedId}.astro`;
        }

        log("info", `Generated export for ${type}: ${sanitizedId}`);

        return {
          success: true,
          type,
          id: sanitizedId,
          content: astroContent,
          filePath,
        };
      } catch (error) {
        log("error", "Export failed", {
          type,
          id,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : "Export failed",
        };
      }
    },
  }),

  /**
   * Export multiple items in batch
   *
   * Exports selected pages, layouts, and/or components
   * to .astro format in a single operation.
   *
   * @param pages - Array of page IDs to export
   * @param layouts - Array of layout IDs to export
   * @param components - Array of component IDs to export
   * @returns Results with exported and failed items
   */
  exportAll: defineAction({
    accept: "json",
    input: z.object({
      pages: z.array(z.string()).optional().default([]),
      layouts: z.array(z.string()).optional().default([]),
      components: z.array(z.string()).optional().default([]),
    }),
    handler: async ({ pages, layouts, components }, context) => {
      await requireOperation(context, "importExport.exportAll");

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const designSystem =
          (await adapter.getDesignSystem()) ??
          createDefaultUniversalDesignSystem();
        const canonicalBreakpoints =
          resolveBreakpointDefinitionsFromDesignSystem(designSystem);
        const { nodesToAstro, nodesToAstroLayout, nodesToAstroComponent } =
          await import("../lib/blocks/nodesToAstro");
        const { resolveIconRenderResources } = await import(
          "../lib/icons/resolveIconResources"
        );

        const results = {
          exported: [] as Array<{
            type: string;
            id: string;
            filePath: string;
            content?: string;
          }>,
          failed: [] as Array<{ type: string; id: string; error: string }>,
        };

        // Process exports in parallel for better performance
        const exportPromises: Promise<void>[] = [];

        for (const pageId of pages) {
          exportPromises.push(
            (async () => {
              try {
                const page = await adapter.getPageDSL(pageId);
                if (!page) {
                  results.failed.push({
                    type: "page",
                    id: pageId,
                    error: "Not found",
                  });
                  return;
                }

                const content = nodesToAstro(page.nodes || [], {
                  ...page,
                  breakpoints: canonicalBreakpoints,
                  iconResources: await resolveIconRenderResources(
                    page.nodes || [],
                    { locals: context.locals },
                  ),
                });
                const filePath = `src/pages/${pageId}.astro`;

                results.exported.push({
                  type: "page",
                  id: pageId,
                  filePath,
                  content,
                });
              } catch (error) {
                results.failed.push({
                  type: "page",
                  id: pageId,
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                });
              }
            })(),
          );
        }

        for (const layoutId of layouts) {
          exportPromises.push(
            (async () => {
              try {
                const layout = await adapter.getLayoutDSL(layoutId);
                if (!layout) {
                  results.failed.push({
                    type: "layout",
                    id: layoutId,
                    error: "Not found",
                  });
                  return;
                }

                const content = nodesToAstroLayout(
                  layout.nodes || [],
                  layout.slots || [],
                  {
                    title: layout.title || layout.name,
                    description: layout.description,
                    breakpoints: canonicalBreakpoints,
                    iconResources: await resolveIconRenderResources(
                      [
                        ...(layout.nodes || []),
                        ...(layout.slots ?? []).flatMap(
                          (slot) => slot.defaultContent ?? [],
                        ),
                      ],
                      { locals: context.locals },
                    ),
                  },
                );
                const filePath = `src/layouts/${layoutId}.astro`;

                results.exported.push({
                  type: "layout",
                  id: layoutId,
                  filePath,
                  content,
                });
              } catch (error) {
                results.failed.push({
                  type: "layout",
                  id: layoutId,
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                });
              }
            })(),
          );
        }

        for (const componentId of components) {
          exportPromises.push(
            (async () => {
              try {
                const component = await adapter.getComponentDSL(componentId);
                if (!component) {
                  results.failed.push({
                    type: "component",
                    id: componentId,
                    error: "Not found",
                  });
                  return;
                }

                const content = nodesToAstroComponent(component.nodes || [], {
                  ...component,
                  breakpoints: canonicalBreakpoints,
                  iconResources: await resolveIconRenderResources(
                    component.nodes || [],
                    { locals: context.locals },
                  ),
                });
                const filePath = `src/components/${componentId}.astro`;

                results.exported.push({
                  type: "component",
                  id: componentId,
                  filePath,
                  content,
                });
              } catch (error) {
                results.failed.push({
                  type: "component",
                  id: componentId,
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                });
              }
            })(),
          );
        }

        await Promise.all(exportPromises);

        log("info", "Batch export completed", {
          exported: results.exported.length,
          failed: results.failed.length,
        });

        return {
          success: results.failed.length === 0,
          ...results,
        };
      } catch (error) {
        log("error", "Batch export failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          exported: [],
          failed: [],
          error: error instanceof Error ? error.message : "Export failed",
        };
      }
    },
  }),
};
