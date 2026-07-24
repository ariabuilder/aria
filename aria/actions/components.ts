/**
 * Component Preview Actions
 *
 * Mutations for component thumbnails and snapshots.
 */

import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import {
  ComponentThumbnailDeleteResponseSchema,
  ComponentThumbnailIdSchema,
  ComponentThumbnailMimeTypeSchema,
  ComponentThumbnailSaveResponseSchema,
  ComponentThumbnailUploadSchema,
  ComponentSnapshotSaveResponseSchema,
} from "../lib/schemas/componentPreview";
import {
  GetComponentVersionsInputSchema,
  GetComponentVersionsOutputSchema,
} from "../lib/schemas/componentVersions";
import { buildComponentSnapshotInput } from "./_componentSnapshotInput";
import {
  buildComponentSnapshotAdminUrl,
  saveComponentSnapshot,
} from "../lib/rendering/componentSnapshots";
import { buildComponentThumbnailAdminUrl } from "../lib/rendering/componentThumbnails";
import { getSiteStyleRevision } from "../lib/storage/adapter";
import { requireOperation, resolveAuthorizedMutation } from "./_shared";
import { log as baseLog } from "../lib/utils/logger";
import { countComponentReferences } from "../lib/components/references";

type LogLevel = "debug" | "info" | "warn" | "error";

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  baseLog(level, `[Aria Components][${level.toUpperCase()}] ${message}`, context);
}

function decodeThumbnailBase64(
  fileBase64: string,
  mimeType: z.infer<typeof ComponentThumbnailMimeTypeSchema>,
): Blob {
  const normalized = fileBase64.trim();
  const buffer = Buffer.from(normalized, "base64");
  return new Blob([buffer], { type: mimeType });
}

export const components = {
  getUsage: defineAction({
    accept: "json",
    input: z.object({ componentId: z.string().trim().min(1) }),
    handler: async ({ componentId }, context) => {
      await requireOperation(context, "components.getUsage");

      const adapter = await getStorageAdapterAsync(context.locals);
      const component = await adapter.getComponentDSL(componentId);
      if (!component) throw new Error("Component not found");

      const [pages, layouts] = await Promise.all([
        adapter.listPagesDSL({ limit: 1000, offset: 0 }),
        adapter.listLayoutsDSL(),
      ]);
      const pageItems: Array<{
        id: string;
        kind: "page";
        title: string;
        path: string;
        matchCount: number;
      }> = [];

      // Bound concurrent D1 work while collapsing the browser's N+M action
      // waterfall into one request. An indexed repository can replace this
      // implementation without changing the client contract.
      const concurrency = 8;
      for (let offset = 0; offset < pages.length; offset += concurrency) {
        const matches = await Promise.all(
          pages.slice(offset, offset + concurrency).map(async (page) => {
            const pageDsl = await adapter.getPageDSL(page.id);
            const matchCount = countComponentReferences(pageDsl, componentId);
            if (matchCount === 0) return null;
            const slug = page.slug ?? page.id;
            return {
              id: page.id,
              kind: "page" as const,
              title: page.title || page.id,
              path: `/${slug}`,
              matchCount,
            };
          }),
        );
        for (const match of matches) {
          if (match) pageItems.push(match);
        }
      }

      const layoutItems = layouts.flatMap((layout) => {
        const matchCount = countComponentReferences(layout, componentId);
        if (matchCount === 0) return [];
        return [{
          id: layout.id,
          kind: "layout" as const,
          title: layout.title || layout.name || layout.id,
          path: layout.id,
          matchCount,
        }];
      });

      const items = [...pageItems, ...layoutItems].sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "page" ? -1 : 1;
        if (right.matchCount !== left.matchCount) {
          return right.matchCount - left.matchCount;
        }
        return left.title.localeCompare(right.title);
      });

      return { items };
    },
  }),

  saveThumbnail: defineAction({
    accept: "json",
    input: ComponentThumbnailUploadSchema,
    handler: async (input, context) => {
      await resolveAuthorizedMutation(
        context,
        "components.saveThumbnail",
        "save-component",
      );

      const adapter = await getStorageAdapterAsync(context.locals);
      const component = await adapter.getComponentDSL(input.componentId);
      if (!component) {
        throw new Error("Component not found");
      }

      const blob = decodeThumbnailBase64(input.fileBase64, input.mimeType);
      await adapter.saveThumbnail("component", component.id, blob);
      const siteSettings = await adapter.getSiteSettings();

      return ComponentThumbnailSaveResponseSchema.parse({
        success: true,
        data: {
          componentId: component.id,
          thumbnailUrl: buildComponentThumbnailAdminUrl(
            component.id,
            component.updatedAt ?? null,
            getSiteStyleRevision(siteSettings),
          ),
        },
      });
    },
  }),

  deleteThumbnail: defineAction({
    accept: "json",
    input: z.object({
      componentId: ComponentThumbnailIdSchema,
    }),
    handler: async ({ componentId }, context) => {
      await resolveAuthorizedMutation(
        context,
        "components.deleteThumbnail",
        "save-component",
      );

      const adapter = await getStorageAdapterAsync(context.locals);
      await adapter.deleteThumbnail("component", componentId);

      return ComponentThumbnailDeleteResponseSchema.parse({
        success: true,
        data: {
          componentId,
          deleted: true,
        },
      });
    },
  }),

  saveSnapshot: defineAction({
    accept: "json",
    input: z.object({
      componentId: ComponentThumbnailIdSchema,
    }),
    handler: async ({ componentId }, context) => {
      await resolveAuthorizedMutation(
        context,
        "components.saveSnapshot",
        "save-component",
      );

      const adapter = await getStorageAdapterAsync(context.locals);
      const snapshotInput = await buildComponentSnapshotInput(
        componentId,
        adapter,
      );

      if (!snapshotInput) {
        throw new Error("Component not found");
      }

      await saveComponentSnapshot(snapshotInput, adapter, {
        locals: context.locals,
      });
      const component = await adapter.getComponentDSL(componentId);
      const siteSettings = await adapter.getSiteSettings();

      log("info", "Component snapshot saved", { componentId });

      return ComponentSnapshotSaveResponseSchema.parse({
        success: true,
        data: {
          componentId,
          snapshotUrl: buildComponentSnapshotAdminUrl(
            componentId,
            component?.updatedAt ?? null,
            getSiteStyleRevision(siteSettings),
          ),
        },
      });
    },
  }),

  getVersions: defineAction({
    accept: "json",
    input: GetComponentVersionsInputSchema,
    handler: async ({ componentId }, context) => {
      await requireOperation(context, "components.getVersions");

      const adapter = await getStorageAdapterAsync(context.locals);
      const component = await adapter.getComponentDSL(componentId);
      if (!component) {
        throw new Error("Component not found");
      }

      const versions = await adapter.listComponentVersions(component.id);
      const sorted = [...versions].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      );

      return GetComponentVersionsOutputSchema.parse({ versions: sorted });
    },
  }),
};
