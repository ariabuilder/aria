import { z } from "astro/zod";
import type { RuntimeLocals } from "../../cloudflare/env";
import type { AriaEntryRecord } from "../../cms/schemas";
import type {
  AuthorshipSaveContext,
  SiteSettings,
  StorageAdapter,
} from "../../storage/adapter";
import { parseAuthorshipSaveContext } from "../../authorship/stamping";
import type { ComponentDSL, LayoutDSL, PageDSL } from "../../types/nodes";
import { normalizeLogicalMediaPath } from "../utils/path";
import {
  migrateMediaReferencesInResource,
  scrubMediaReferencesFromResource,
  matchesLogicalMediaPath,
  resolveMigratedMediaRawUrl,
} from "./scrubMediaReferences";
import type { UniversalDesignSystem } from "../../styles/universalDesignSystem";
import {
  MediaReferenceUpdateFailureSchema,
  MediaReferenceUpdateResultSchema,
  UpdateMediaReferencesModeSchema,
  type MediaReferenceUpdateResult,
} from "../../schemas/mediaReferenceUpdate";
import { transformComposerMediaReferencesForAsset } from "../composerReference";

export const UpdateMediaReferencesInputSchema = z
  .object({
    mode: UpdateMediaReferencesModeSchema,
    logicalPath: z.string().trim().min(1),
    newLogicalPath: z.string().trim().min(1).optional(),
    fallback: z.string().optional(),
    mediaId: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === "migrate" && !value.newLogicalPath) {
      ctx.addIssue({
        code: "custom",
        message: "newLogicalPath is required when mode is migrate",
        path: ["newLogicalPath"],
      });
    }
  });

export type UpdateMediaReferencesInput = z.infer<
  typeof UpdateMediaReferencesInputSchema
>;

export type UpdateMediaReferencesContext = {
  locals?: RuntimeLocals;
  authorship: AuthorshipSaveContext;
};

const RESOURCE_LIST_PAGE_SIZE = 500;

type ContentResourceKind = "page" | "layout" | "component";

type ContentResourceRef = {
  kind: ContentResourceKind;
  refId: string;
};

function resourceKey(kind: ContentResourceKind, refId: string): string {
  return `${kind}:${refId}`;
}

async function listAllPageIds(adapter: StorageAdapter): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;

  while (true) {
    const batch = await adapter.listPagesDSL({
      limit: RESOURCE_LIST_PAGE_SIZE,
      offset,
    });
    ids.push(...batch.map((page) => page.id));
    if (batch.length < RESOURCE_LIST_PAGE_SIZE) {
      break;
    }
    offset += RESOURCE_LIST_PAGE_SIZE;
  }

  return ids;
}

async function listAllLayoutIds(adapter: StorageAdapter): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;

  while (true) {
    const batch = await adapter.listLayoutsDSL({
      limit: RESOURCE_LIST_PAGE_SIZE,
      offset,
    });
    ids.push(...batch.map((layout) => layout.id));
    if (batch.length < RESOURCE_LIST_PAGE_SIZE) {
      break;
    }
    offset += RESOURCE_LIST_PAGE_SIZE;
  }

  return ids;
}

async function listAllComponentIds(adapter: StorageAdapter): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;

  while (true) {
    const batch = await adapter.listComponentsDSL({
      limit: RESOURCE_LIST_PAGE_SIZE,
      offset,
    });
    ids.push(...batch.map((component) => component.id));
    if (batch.length < RESOURCE_LIST_PAGE_SIZE) {
      break;
    }
    offset += RESOURCE_LIST_PAGE_SIZE;
  }

  return ids;
}

async function listIndexedContentRefs(
  adapter: StorageAdapter,
  logicalPath: string,
): Promise<ContentResourceRef[]> {
  if (typeof adapter.listMediaUsageByLogicalPath !== "function") {
    return [];
  }

  const usages = await adapter.listMediaUsageByLogicalPath(logicalPath);
  const refs = new Map<string, ContentResourceRef>();

  for (const usage of usages) {
    if (
      usage.kind !== "page" &&
      usage.kind !== "layout" &&
      usage.kind !== "component"
    ) {
      continue;
    }
    refs.set(resourceKey(usage.kind, usage.refId), {
      kind: usage.kind,
      refId: usage.refId,
    });
  }

  return Array.from(refs.values());
}

function applyResourceTransform(
  resource: unknown,
  input: UpdateMediaReferencesInput,
): { resource: unknown; updatedCount: number } {
  const composerResult = input.mediaId
    ? transformComposerMediaReferencesForAsset(resource, {
        mediaId: input.mediaId,
        mode: input.mode,
        newLogicalPath: input.newLogicalPath,
      })
    : { resource, updatedCount: 0 };

  if (input.mode === "scrub") {
    const result = scrubMediaReferencesFromResource(
      composerResult.resource,
      input.logicalPath,
      input.fallback ?? "",
    );
    return {
      resource: result.resource,
      updatedCount: composerResult.updatedCount + result.updatedCount,
    };
  }

  const result = migrateMediaReferencesInResource(
    composerResult.resource,
    input.logicalPath,
    input.newLogicalPath!,
  );
  return {
    resource: result.resource,
    updatedCount: composerResult.updatedCount + result.updatedCount,
  };
}

async function saveContentResource(
  adapter: StorageAdapter,
  authorship: AuthorshipSaveContext,
  kind: ContentResourceKind,
  refId: string,
  resource: PageDSL | LayoutDSL | ComponentDSL,
): Promise<void> {
  const parsedAuthorship = parseAuthorshipSaveContext(authorship);

  switch (kind) {
    case "page":
      await adapter.savePageDSL(
        refId,
        resource as PageDSL,
        undefined,
        parsedAuthorship,
      );
      return;
    case "layout":
      await adapter.saveLayoutDSL(
        refId,
        resource as LayoutDSL,
        undefined,
        parsedAuthorship,
      );
      return;
    case "component":
      await adapter.saveComponentDSL(
        refId,
        resource as ComponentDSL,
        undefined,
        parsedAuthorship,
      );
      return;
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported content resource kind: ${exhaustive}`);
    }
  }
}

async function loadContentResource(
  adapter: StorageAdapter,
  kind: ContentResourceKind,
  refId: string,
): Promise<PageDSL | LayoutDSL | ComponentDSL | null> {
  switch (kind) {
    case "page":
      return adapter.getPageDSL(refId);
    case "layout":
      return adapter.getLayoutDSL(refId);
    case "component":
      return adapter.getComponentDSL(refId);
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported content resource kind: ${exhaustive}`);
    }
  }
}

function transformSiteSettingsValue(
  rawUrl: string | undefined,
  input: UpdateMediaReferencesInput,
): { nextValue: string | undefined; changed: boolean } {
  if (!rawUrl || !matchesLogicalMediaPath(rawUrl, input.logicalPath)) {
    return { nextValue: rawUrl, changed: false };
  }

  if (input.mode === "scrub") {
    return { nextValue: undefined, changed: true };
  }

  return {
    nextValue: resolveMigratedMediaRawUrl(rawUrl, input.newLogicalPath!),
    changed: true,
  };
}

async function updateSiteSettingsReferences(
  adapter: StorageAdapter,
  context: UpdateMediaReferencesContext,
  input: UpdateMediaReferencesInput,
  result: MediaReferenceUpdateResult,
): Promise<void> {
  const currentSettings = await adapter.getSiteSettings();
  if (!currentSettings) {
    return;
  }

  result.scannedResources += 1;

  const faviconResult = transformSiteSettingsValue(
    currentSettings.favicon,
    input,
  );
  const ogImageResult = transformSiteSettingsValue(
    currentSettings.ogImage,
    input,
  );

  if (!faviconResult.changed && !ogImageResult.changed) {
    return;
  }

  const nextSettings: SiteSettings = {
    ...currentSettings,
    ...(faviconResult.changed ? { favicon: faviconResult.nextValue } : {}),
    ...(ogImageResult.changed ? { ogImage: ogImageResult.nextValue } : {}),
  };

  try {
    await adapter.saveSiteSettings(
      nextSettings,
      parseAuthorshipSaveContext(context.authorship),
    );
    result.updatedResources += 1;
    result.updatedLocations +=
      Number(faviconResult.changed) + Number(ogImageResult.changed);
  } catch (error) {
    result.failures.push(
      MediaReferenceUpdateFailureSchema.parse({
        kind: "site-settings",
        refId: "site-settings",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

async function updateDesignSystemReferences(
  adapter: StorageAdapter,
  context: UpdateMediaReferencesContext,
  input: UpdateMediaReferencesInput,
  result: MediaReferenceUpdateResult,
): Promise<void> {
  const designSystem = await adapter.getDesignSystem();
  if (!designSystem) return;
  result.scannedResources += 1;

  const transformed = applyResourceTransform(designSystem, input);
  if (transformed.updatedCount === 0) return;

  try {
    await adapter.saveDesignSystem(
      transformed.resource as UniversalDesignSystem,
      parseAuthorshipSaveContext(context.authorship),
    );
    result.updatedResources += 1;
    result.updatedLocations += transformed.updatedCount;
  } catch (error) {
    result.failures.push(
      MediaReferenceUpdateFailureSchema.parse({
        kind: "design-system",
        refId: "design-system",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

async function updateCmsEntryReferences(
  adapter: StorageAdapter,
  input: UpdateMediaReferencesInput,
  result: MediaReferenceUpdateResult,
): Promise<void> {
  const collections = await adapter.listCollections();

  for (const collection of collections) {
    let page = 1;
    while (true) {
      const listed = await adapter.listEntries({
        collectionId: collection.id,
        page,
        limit: RESOURCE_LIST_PAGE_SIZE,
      });

      for (const listedEntry of listed.items) {
        result.scannedResources += 1;
        const entry =
          (await adapter.getEntry({
            collectionId: collection.id,
            idOrSlug: listedEntry.entry.id,
            includeAllLocales: true,
            includeRelations: true,
          })) ?? listedEntry;
        const transformed = applyResourceTransform(entry, input);
        if (transformed.updatedCount === 0) continue;

        try {
          const nextEntry = transformed.resource as AriaEntryRecord;
          await adapter.saveEntry(nextEntry, {
            expectedVersion: entry.entry.version,
            relations: nextEntry.relations,
            replaceLocales: true,
          });
          result.updatedResources += 1;
          result.updatedLocations += transformed.updatedCount;
        } catch (error) {
          result.failures.push(
            MediaReferenceUpdateFailureSchema.parse({
              kind: "cms-entry",
              refId: entry.entry.id,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      }

      if (page * listed.limit >= listed.total) break;
      page += 1;
    }
  }
}

async function recordLocalizedImmutableReferences(
  adapter: StorageAdapter,
  input: UpdateMediaReferencesInput,
  result: MediaReferenceUpdateResult,
): Promise<void> {
  let offset = 0;
  while (true) {
    const records = await adapter.listPageLocaleRecords({
      limit: RESOURCE_LIST_PAGE_SIZE,
      offset,
    });
    for (const record of records) {
      result.scannedResources += 1;
      const activeVersions = record.versions.filter((version) =>
        [record.meta.currentVersion, record.meta.publishedVersion].includes(
          version.version,
        ),
      );
      const matches = applyResourceTransform(
        { versions: activeVersions },
        input,
      );
      if (matches.updatedCount > 0) {
        result.failures.push(
          MediaReferenceUpdateFailureSchema.parse({
            kind: "page-locale",
            refId: `${record.meta.pageId}:${record.meta.locale}`,
            error:
              "Active localized versions are immutable; save a new translation version before removing the original asset.",
          }),
        );
      }
    }
    if (records.length < RESOURCE_LIST_PAGE_SIZE) break;
    offset += RESOURCE_LIST_PAGE_SIZE;
  }

  offset = 0;
  while (true) {
    const records = await adapter.listLayoutLocaleRecords({
      limit: RESOURCE_LIST_PAGE_SIZE,
      offset,
    });
    for (const record of records) {
      result.scannedResources += 1;
      const activeVersions = record.versions.filter((version) =>
        [record.meta.currentVersion, record.meta.publishedVersion].includes(
          version.version,
        ),
      );
      const matches = applyResourceTransform(
        { versions: activeVersions },
        input,
      );
      if (matches.updatedCount > 0) {
        result.failures.push(
          MediaReferenceUpdateFailureSchema.parse({
            kind: "layout-locale",
            refId: `${record.meta.layoutId}:${record.meta.locale}`,
            error:
              "Active localized versions are immutable; save a new translation version before removing the original asset.",
          }),
        );
      }
    }
    if (records.length < RESOURCE_LIST_PAGE_SIZE) break;
    offset += RESOURCE_LIST_PAGE_SIZE;
  }
}

/**
 * Scan mutable content and configuration for media references matching
 * `logicalPath`, then scrub or migrate them in place. Immutable.
 */
export async function updateMediaReferencesForPath(
  adapter: StorageAdapter,
  context: UpdateMediaReferencesContext,
  rawInput: UpdateMediaReferencesInput,
): Promise<MediaReferenceUpdateResult> {
  const input = UpdateMediaReferencesInputSchema.parse(rawInput);
  const normalizedLogicalPath = normalizeLogicalMediaPath(input.logicalPath);
  const normalizedNewLogicalPath =
    input.mode === "migrate" && input.newLogicalPath
      ? normalizeLogicalMediaPath(input.newLogicalPath)
      : undefined;
  const catalogRows =
    typeof adapter.listMediaCatalogAssetsByLogicalPaths === "function"
      ? await adapter.listMediaCatalogAssetsByLogicalPaths([
          normalizedLogicalPath,
        ])
      : [];
  const mediaId = catalogRows[0]?.id;

  const parsedInput = UpdateMediaReferencesInputSchema.parse({
    ...input,
    logicalPath: normalizedLogicalPath,
    ...(normalizedNewLogicalPath
      ? { newLogicalPath: normalizedNewLogicalPath }
      : {}),
    ...(mediaId ? { mediaId } : {}),
  });

  const result = MediaReferenceUpdateResultSchema.parse({
    mode: parsedInput.mode,
    logicalPath: parsedInput.logicalPath,
    newLogicalPath: parsedInput.newLogicalPath,
    indexedUsageCount: 0,
    scannedResources: 0,
    updatedResources: 0,
    updatedLocations: 0,
    failures: [],
    warnings: [],
  });

  const indexedRefs = await listIndexedContentRefs(
    adapter,
    parsedInput.logicalPath,
  );
  result.indexedUsageCount = indexedRefs.length;

  const [pageIds, layoutIds, componentIds] = await Promise.all([
    listAllPageIds(adapter),
    listAllLayoutIds(adapter),
    listAllComponentIds(adapter),
  ]);

  const refsToScan = new Map<string, ContentResourceRef>();
  for (const ref of indexedRefs) {
    refsToScan.set(resourceKey(ref.kind, ref.refId), ref);
  }
  for (const refId of pageIds) {
    refsToScan.set(resourceKey("page", refId), { kind: "page", refId });
  }
  for (const refId of layoutIds) {
    refsToScan.set(resourceKey("layout", refId), {
      kind: "layout",
      refId,
    });
  }
  for (const refId of componentIds) {
    refsToScan.set(resourceKey("component", refId), {
      kind: "component",
      refId,
    });
  }

  for (const ref of refsToScan.values()) {
    result.scannedResources += 1;

    try {
      const resource = await loadContentResource(adapter, ref.kind, ref.refId);
      if (!resource) {
        continue;
      }

      if (ref.kind === "page") {
        const published = await adapter.getPublishedPageDSL(ref.refId);
        if (published) {
          const publishedMatch = applyResourceTransform(published, parsedInput);
          if (publishedMatch.updatedCount > 0) {
            result.failures.push(
              MediaReferenceUpdateFailureSchema.parse({
                kind: "page",
                refId: ref.refId,
                error:
                  "The published page still references this asset; save and publish the replacement before removing the original.",
              }),
            );
          }
        }
      }

      const { resource: nextResource, updatedCount } = applyResourceTransform(
        resource,
        parsedInput,
      );
      if (updatedCount === 0) {
        continue;
      }

      await saveContentResource(
        adapter,
        context.authorship,
        ref.kind,
        ref.refId,
        nextResource as PageDSL | LayoutDSL | ComponentDSL,
      );

      result.updatedResources += 1;
      result.updatedLocations += updatedCount;
    } catch (error) {
      result.failures.push(
        MediaReferenceUpdateFailureSchema.parse({
          kind: ref.kind,
          refId: ref.refId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  await updateCmsEntryReferences(adapter, parsedInput, result);
  await recordLocalizedImmutableReferences(adapter, parsedInput, result);
  await updateSiteSettingsReferences(adapter, context, parsedInput, result);
  await updateDesignSystemReferences(adapter, context, parsedInput, result);

  if (result.failures.length > 0) {
    result.warnings.push(
      `${result.failures.length} resource(s) failed to update; manual cleanup may be required`,
    );
  }

  return MediaReferenceUpdateResultSchema.parse(result);
}

export {
  MediaReferenceUpdateFailureSchema,
  MediaReferenceUpdateResultSchema,
  UpdateMediaReferencesModeSchema,
} from "../../schemas/mediaReferenceUpdate";

export type {
  MediaReferenceUpdateFailure,
  MediaReferenceUpdateResult,
  UpdateMediaReferencesMode,
} from "../../schemas/mediaReferenceUpdate";
