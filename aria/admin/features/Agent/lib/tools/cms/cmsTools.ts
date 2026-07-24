import { z } from "zod";
import { cms } from "../../../../../../actions/cms";
import { normalizeContentLocalization } from "../../../../../../lib/localization/contentLocale";
import { StructuredTextDocumentSchema } from "../../../../../../lib/cms/structuredText";
import { getEntryTranslationSourceHash } from "../../../../../../lib/localization/entryTranslation";
import { getStorageAdapterAsync } from "../../../../../../lib/storage/getStorageAdapter";
import type {
  BuilderNode,
  NodeDataSource,
} from "../../../../../../lib/types/nodes";
import { NodeDataSourceSchema } from "../../../../../../lib/schemas/nodes";
import { findNodeById } from "../../../../../../lib/blocks/nodeUtils";
import { slugify } from "@/lib/utils/slugify";
import {
  deriveCmsPageUsageIndex,
  type CmsPageUsageIndexPageInput,
} from "../../../../../../lib/cms/pageUsageIndex";
import type {
  AriaCollection,
  AriaEntryRecord,
  FieldSchema,
} from "../../../../../../lib/cms/schemas";
import {
  AriaArchiveEntryInputSchema,
  AriaBindNodeFieldInputSchema,
  AriaClearCollectionTemplateInputSchema,
  AriaCmsBindingOutputSchema,
  AriaCmsSetupOutputSchema,
  AriaCollectionOutputSchema,
  AriaCreateCollectionInputSchema,
  AriaCreateEntryInputSchema,
  AriaDeleteCollectionInputSchema,
  AriaDeleteEntryInputSchema,
  AriaDuplicateEntryInputSchema,
  AriaEntryOutputSchema,
  AriaEntryRevisionOutputSchema,
  AriaGetCmsInventoryInputSchema,
  AriaGetCmsInventoryOutputSchema,
  AriaGetCollectionInputSchema,
  AriaGetEntryInputSchema,
  AriaGetEntryTranslationContextInputSchema,
  AriaGetEntryRevisionInputSchema,
  AriaListCollectionsInputSchema,
  AriaListCollectionsOutputSchema,
  AriaListEntriesInputSchema,
  AriaListEntriesOutputSchema,
  AriaListEntryRevisionsInputSchema,
  AriaListEntryRevisionsOutputSchema,
  AriaPublishEntryInputSchema,
  AriaQueryEntriesInputSchema,
  AriaRestoreEntryRevisionInputSchema,
  AriaSaveEntryTranslationInputSchema,
  AriaSetCollectionTemplateInputSchema,
  AriaSetContainerLoopInputSchema,
  AriaSetupBlogInputSchema,
  AriaSetupConfigCollectionInputSchema,
  AriaSetupNavCollectionInputSchema,
  AriaSetupTagArchiveInputSchema,
  AriaUnpublishEntryInputSchema,
  AriaUpdateCollectionInputSchema,
  AriaUpdateEntryInputSchema,
  type AgentToolResult,
} from "../../schemas";
import { invokeActionForTool } from "../invokeActionForTool";
import { invokeActionHandlerForTool } from "../invokeActionHandlerForTool";
import { callDefinedAction } from "../callDefinedAction";
import { toToolActionContext } from "../toolActionContext";
import {
  toolErrorFromZod,
  toolErrorResult,
  toolSuccessResult,
} from "../toolErrors";
import type { AgentToolActionContext } from "../types";
import { ariaMutateNode } from "../content/nodeWriteTools";
import { readResourceForTool } from "../content/readResource";
import type { ActionAPIContext } from "astro:actions";

const DeleteSuccessSchema = z.object({ success: z.literal(true) }).strict();

const TRANSLATABLE_FIELD_TYPES = new Set([
  "string",
  "text",
  "structuredText",
  "richtext",
]);

function translationFieldManifest(fields: readonly FieldSchema[]) {
  const translatable: Array<Record<string, unknown>> = [];
  const preserved: Array<Record<string, unknown>> = [];
  const visit = (items: readonly FieldSchema[], prefix = "frontmatter") => {
    for (const field of items) {
      const path = `${prefix}.${field.key}`;
      if (TRANSLATABLE_FIELD_TYPES.has(field.type)) {
        translatable.push({
          path,
          type: field.type,
          required: field.required === true,
        });
      } else if (field.type === "object" && field.fields) {
        visit(field.fields, path);
      } else {
        preserved.push({ path, type: field.type });
      }
    }
  };
  visit(fields);
  return { translatable, preserved };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const PLACEHOLDER_PATTERN =
  /\{\{[^{}]+\}\}|\{[A-Za-z_][A-Za-z0-9_.-]*\}|%[sdif]/g;

function collectPlaceholders(
  value: unknown,
  result = new Set<string>(),
): Set<string> {
  if (typeof value === "string") {
    for (const match of value.match(PLACEHOLDER_PATTERN) ?? [])
      result.add(match);
  } else if (Array.isArray(value)) {
    for (const item of value) collectPlaceholders(item, result);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectPlaceholders(item, result);
    }
  }
  return result;
}

export function assertPlaceholdersPreserved(
  source: unknown,
  translated: unknown,
): void {
  const expected = collectPlaceholders(source);
  const actual = collectPlaceholders(translated);
  const missing = [...expected].filter(
    (placeholder) => !actual.has(placeholder),
  );
  if (missing.length > 0) {
    throw Object.assign(
      new Error(`Translation is missing placeholders: ${missing.join(", ")}`),
      { code: "VALIDATION_ERROR" },
    );
  }
}

function structuredTextShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(structuredTextShape);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      key === "text" || key === "alt"
        ? "<translated-text>"
        : structuredTextShape(item),
    ]),
  );
}

export function assertStructuredTextPreserved(
  source: unknown,
  translated: unknown,
): void {
  const sourceParsed = StructuredTextDocumentSchema.safeParse(source);
  if (!sourceParsed.success) return;
  const translatedParsed = StructuredTextDocumentSchema.safeParse(translated);
  if (!translatedParsed.success) {
    throw Object.assign(
      new Error("Translated body is not valid structured text"),
      {
        code: "VALIDATION_ERROR",
      },
    );
  }
  if (
    stableJson(structuredTextShape(sourceParsed.data)) !==
    stableJson(structuredTextShape(translatedParsed.data))
  ) {
    throw Object.assign(
      new Error(
        "Translated body must preserve block keys, types, marks, links, media, and document structure",
      ),
      { code: "VALIDATION_ERROR" },
    );
  }
}

export function protectedFrontmatterMerge(
  fields: readonly FieldSchema[],
  source: Record<string, unknown>,
  translated: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...source };
  for (const field of fields) {
    if (TRANSLATABLE_FIELD_TYPES.has(field.type)) {
      if (Object.prototype.hasOwnProperty.call(translated, field.key)) {
        result[field.key] = translated[field.key];
      }
      continue;
    }
    if (field.type === "object" && field.fields) {
      const sourceObject =
        source[field.key] &&
        typeof source[field.key] === "object" &&
        !Array.isArray(source[field.key])
          ? (source[field.key] as Record<string, unknown>)
          : {};
      const translatedObject =
        translated[field.key] &&
        typeof translated[field.key] === "object" &&
        !Array.isArray(translated[field.key])
          ? (translated[field.key] as Record<string, unknown>)
          : {};
      result[field.key] = protectedFrontmatterMerge(
        field.fields,
        sourceObject,
        translatedObject,
      );
    }
  }
  return result;
}

function collectionByName(
  collections: readonly AriaCollection[],
  name: string,
): AriaCollection | null {
  return (
    collections.find(
      (collection) => collection.name === name || collection.id === name,
    ) ?? null
  );
}

function fieldGraphForCollection(collection: AriaCollection) {
  const rows: Array<Record<string, unknown>> = [];

  function visit(fields: readonly FieldSchema[], prefix = ""): void {
    for (const field of fields) {
      const path = prefix ? `${prefix}.${field.key}` : field.key;
      rows.push({
        collectionId: collection.id,
        collectionName: collection.name,
        key: field.key,
        path,
        label: field.label,
        type: field.type,
        required: field.required === true,
        targetCollection: field.targetCollection,
        searchable: field.searchable === true,
        showInEntryList: field.showInEntryList === true,
      });
      if (
        (field.type === "object" || field.type === "repeater") &&
        field.fields
      ) {
        visit(field.fields, path);
      }
    }
  }

  visit(collection.schema.fields);
  return rows;
}

function relationFieldsForCollection(collection: AriaCollection) {
  return fieldGraphForCollection(collection).filter(
    (field) =>
      (field.type === "relation" || field.type === "reference") &&
      typeof field.targetCollection === "string",
  );
}

function relationGraphForCollection(collection: AriaCollection) {
  return relationFieldsForCollection(collection).map((field) => ({
    sourceCollectionId: collection.id,
    sourceCollectionName: collection.name,
    fieldKey: field.key,
    fieldPath: field.path,
    relationType: field.type,
    targetCollection: field.targetCollection,
  }));
}

async function listCollectionsForAction(
  context: ActionAPIContext,
): Promise<z.infer<typeof AriaListCollectionsOutputSchema>> {
  return AriaListCollectionsOutputSchema.parse(
    await callDefinedAction(cms.collections.list, context, {}),
  );
}

async function createCollectionForAction(
  payload: z.input<typeof AriaCreateCollectionInputSchema>,
  context: ActionAPIContext,
): Promise<AriaCollection> {
  return AriaCollectionOutputSchema.parse(
    await callDefinedAction(cms.collections.create, context, payload),
  );
}

async function updateCollectionForAction(
  payload: z.input<typeof AriaUpdateCollectionInputSchema>,
  context: ActionAPIContext,
): Promise<AriaCollection> {
  return AriaCollectionOutputSchema.parse(
    await callDefinedAction(cms.collections.update, context, payload),
  );
}

async function createEntryForAction(
  payload: z.input<typeof AriaCreateEntryInputSchema>,
  context: ActionAPIContext,
): Promise<AriaEntryRecord> {
  return AriaEntryOutputSchema.parse(
    await callDefinedAction(cms.entries.create, context, payload),
  );
}

async function listEntriesForAction(
  payload: z.input<typeof AriaListEntriesInputSchema>,
  context: ActionAPIContext,
): Promise<z.infer<typeof AriaListEntriesOutputSchema>> {
  return AriaListEntriesOutputSchema.parse(
    await callDefinedAction(cms.entries.list, context, payload),
  );
}

export async function ariaGetCmsInventory(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<z.infer<typeof AriaGetCmsInventoryOutputSchema>>> {
  return invokeActionForTool({
    context,
    operationId: "cms.collections.list",
    inputSchema: AriaGetCmsInventoryInputSchema,
    outputSchema: AriaGetCmsInventoryOutputSchema,
    input,
    call: async (validated) => {
      const actionContext = toToolActionContext(context);
      const collectionsResult = await listCollectionsForAction(actionContext);
      const collections = collectionsResult.collections;
      const adapter = await getStorageAdapterAsync(context.locals);
      const pages = await adapter.listPagesDSL().catch(() => []);
      const pageUsages = deriveCmsPageUsageIndex({
        pages: pages as CmsPageUsageIndexPageInput[],
        collections,
      });

      const collectionRows = await Promise.all(
        collections.map(async (collection) => {
          const entries = validated.includeEntries
            ? (
                await listEntriesForAction(
                  {
                    collectionId: collection.id,
                    limit: validated.entryLimitPerCollection,
                  },
                  actionContext,
                )
              ).items
            : undefined;

          return {
            collection,
            entryCount: collectionsResult.entryCounts[collection.id] ?? 0,
            fields: fieldGraphForCollection(collection),
            relationFields: relationFieldsForCollection(collection),
            routing: {
              urlPattern: collection.urlPattern,
              templatePageId: collection.templatePageId,
              listPageId: collection.listPageId,
              supports: collection.supports,
            },
            ...(entries ? { entries } : {}),
          };
        }),
      );

      return {
        collections: collectionRows,
        fieldGraph: collectionRows.flatMap((row) => row.fields),
        relationGraph: collections.flatMap(relationGraphForCollection),
        pageUsages: pageUsages.usagesByPageId,
      };
    },
  });
}

export async function ariaListCollections(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.collections.list",
    inputSchema: AriaListCollectionsInputSchema,
    outputSchema: AriaListCollectionsOutputSchema,
    payload: input,
    action: cms.collections.list,
  });
}

export async function ariaGetCollection(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.collections.get",
    inputSchema: AriaGetCollectionInputSchema,
    outputSchema: AriaCollectionOutputSchema,
    payload: input,
    action: cms.collections.get,
  });
}

export async function ariaListEntries(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.entries.list",
    inputSchema: AriaListEntriesInputSchema,
    outputSchema: AriaListEntriesOutputSchema,
    payload: input,
    action: cms.entries.list,
  });
}

export async function ariaGetEntry(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.entries.get",
    inputSchema: AriaGetEntryInputSchema,
    outputSchema: AriaEntryOutputSchema,
    payload: input,
    action: cms.entries.get,
  });
}

export async function ariaGetEntryTranslationContext(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.entries.get",
    inputSchema: AriaGetEntryTranslationContextInputSchema,
    outputSchema: z.record(z.string(), z.unknown()),
    payload: input,
    handler: async (validated, actionContext) => {
      const adapter = await getStorageAdapterAsync(context.locals);
      const [collectionRaw, entryRaw, siteSettings] = await Promise.all([
        callDefinedAction(cms.collections.get, actionContext, {
          id: validated.collectionId,
        }),
        callDefinedAction(cms.entries.get, actionContext, {
          collectionId: validated.collectionId,
          idOrSlug: validated.entryId,
          include: ["relations"],
        }),
        adapter.getSiteSettings(),
      ]);
      const collection = AriaCollectionOutputSchema.parse(collectionRaw);
      const record = AriaEntryOutputSchema.parse(entryRaw);
      const localization = normalizeContentLocalization(
        siteSettings?.localization?.content,
      );
      const source =
        record.locales.find((locale) => locale.isSource) ?? record.locales[0];
      if (!source) throw new Error("Entry is missing source locale content");
      const currentSourceHash = await getEntryTranslationSourceHash(source);
      const manifest = translationFieldManifest(collection.schema.fields);
      const variants = localization.locales.map((locale) => ({
        locale: locale.code,
        label: locale.label,
        enabled: locale.enabled,
        fallbacks: locale.fallbacks,
        state:
          source.locale === locale.code
            ? "source"
            : (() => {
                const existing = record.locales.find(
                  (item) => item.locale === locale.code,
                );
                if (!existing) return "missing";
                return existing.translationMeta?.sourceContentHash &&
                  existing.translationMeta.sourceContentHash !==
                    currentSourceHash
                  ? "stale"
                  : "translated";
              })(),
      }));
      const target = validated.targetLocale
        ? variants.find((variant) => variant.locale === validated.targetLocale)
        : undefined;
      if (validated.targetLocale && (!target || !target.enabled)) {
        throw Object.assign(
          new Error(
            `Locale ${validated.targetLocale} is not enabled for content editing`,
          ),
          { code: "VALIDATION_ERROR" },
        );
      }
      return {
        collection: {
          id: collection.id,
          name: collection.name,
          label: collection.label,
          supportsBody: collection.supports.includes("body"),
          translatableFields: [
            { path: "title", type: "string", required: true },
            ...(collection.supports.includes("body")
              ? [{ path: "body", type: "structuredText", required: false }]
              : []),
            ...manifest.translatable,
          ],
          preservedFields: [
            { path: "slug", type: "slug", reason: "preserved_by_default" },
            ...manifest.preserved,
            {
              path: "relations",
              type: "relation",
              reason: "shared_entry_data",
            },
          ],
        },
        entry: {
          id: record.entry.id,
          version: record.entry.version,
          status: record.entry.status,
          sourceLocale: source.locale,
          source,
          sourceContentHash: currentSourceHash,
          variants,
          existingLocales: record.locales.map((locale) => locale.locale),
          missingLocales: variants
            .filter((variant) => variant.enabled && variant.state === "missing")
            .map((variant) => variant.locale),
          relations: record.relations ?? [],
        },
        localization,
        ...(target ? { target } : {}),
      };
    },
  });
}

export async function ariaQueryEntries(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.entries.query",
    inputSchema: AriaQueryEntriesInputSchema,
    outputSchema: AriaListEntriesOutputSchema,
    payload: input,
    action: cms.entries.query,
  });
}

export async function ariaListEntryRevisions(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.revisions.list",
    inputSchema: AriaListEntryRevisionsInputSchema,
    outputSchema: AriaListEntryRevisionsOutputSchema,
    payload: input,
    action: cms.revisions.list,
  });
}

export async function ariaGetEntryRevision(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.revisions.get",
    inputSchema: AriaGetEntryRevisionInputSchema,
    outputSchema: AriaEntryRevisionOutputSchema,
    payload: input,
    action: cms.revisions.get,
  });
}

export async function ariaCreateCollection(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.collections.create",
    inputSchema: AriaCreateCollectionInputSchema,
    outputSchema: AriaCollectionOutputSchema,
    payload: input,
    action: cms.collections.create,
  });
}

export async function ariaUpdateCollection(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.collections.update",
    inputSchema: AriaUpdateCollectionInputSchema,
    outputSchema: AriaCollectionOutputSchema,
    payload: input,
    action: cms.collections.update,
  });
}

export async function ariaSetCollectionTemplate(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.collections.setTemplate",
    inputSchema: AriaSetCollectionTemplateInputSchema,
    outputSchema: AriaCollectionOutputSchema,
    payload: input,
    action: cms.collections.setTemplate,
  });
}

export async function ariaClearCollectionTemplate(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.collections.clearTemplate",
    inputSchema: AriaClearCollectionTemplateInputSchema,
    outputSchema: AriaCollectionOutputSchema,
    payload: input,
    action: cms.collections.clearTemplate,
  });
}

export async function ariaDeleteCollection(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.collections.remove",
    inputSchema: AriaDeleteCollectionInputSchema,
    outputSchema: z.record(z.string(), z.unknown()),
    payload: input,
    action: cms.collections.remove,
  });
}

export async function ariaCreateEntry(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.entries.create",
    inputSchema: AriaCreateEntryInputSchema,
    outputSchema: AriaEntryOutputSchema,
    payload: input,
    action: cms.entries.create,
  });
}

export async function ariaUpdateEntry(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.entries.update",
    inputSchema: AriaUpdateEntryInputSchema,
    outputSchema: AriaEntryOutputSchema,
    payload: input,
    action: cms.entries.update,
  });
}

export async function ariaSaveEntryTranslation(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.entries.update",
    inputSchema: AriaSaveEntryTranslationInputSchema,
    outputSchema: AriaEntryOutputSchema,
    payload: input,
    handler: async (validated, actionContext) => {
      const adapter = await getStorageAdapterAsync(context.locals);
      const [currentRaw, collectionRaw, siteSettings] = await Promise.all([
        callDefinedAction(cms.entries.get, actionContext, {
          collectionId: validated.collectionId,
          idOrSlug: validated.entryId,
          include: ["relations"],
        }),
        callDefinedAction(cms.collections.get, actionContext, {
          id: validated.collectionId,
        }),
        adapter.getSiteSettings(),
      ]);
      const current = AriaEntryOutputSchema.parse(currentRaw);
      const collection = AriaCollectionOutputSchema.parse(collectionRaw);
      const localization = normalizeContentLocalization(
        siteSettings?.localization?.content,
      );
      const targetDefinition = localization.locales.find(
        (locale) => locale.code === validated.targetLocale && locale.enabled,
      );
      if (!targetDefinition) {
        throw Object.assign(
          new Error(
            `Locale ${validated.targetLocale} is not enabled for content editing`,
          ),
          { code: "VALIDATION_ERROR" },
        );
      }
      const source = current.locales.find(
        (locale) => locale.locale === validated.sourceLocale && locale.isSource,
      );
      if (!source) {
        throw Object.assign(
          new Error(
            `Locale ${validated.sourceLocale} is not the source locale for this entry`,
          ),
          { code: "VALIDATION_ERROR" },
        );
      }
      const existing = current.locales.some(
        (locale) => locale.locale === validated.targetLocale,
      );
      if (validated.mode === "create_missing" && existing) {
        throw Object.assign(
          new Error(
            `A ${validated.targetLocale} translation already exists; use update_existing only when the user explicitly requests an overwrite`,
          ),
          { code: "CONFLICT" },
        );
      }
      if (validated.mode === "update_existing" && !existing) {
        throw Object.assign(
          new Error(
            `No ${validated.targetLocale} translation exists; use create_missing`,
          ),
          { code: "VALIDATION_ERROR" },
        );
      }
      const currentSourceHash = await getEntryTranslationSourceHash(source);
      const protectedFrontmatter = protectedFrontmatterMerge(
        collection.schema.fields,
        source.frontmatter,
        validated.translation.frontmatter,
      );
      assertPlaceholdersPreserved(
        {
          title: source.title,
          frontmatter: source.frontmatter,
          body: source.body,
        },
        {
          title: validated.translation.title,
          frontmatter: protectedFrontmatter,
          body: validated.translation.body ?? source.body,
        },
      );
      if (validated.translation.body !== undefined) {
        assertStructuredTextPreserved(source.body, validated.translation.body);
      }
      return callDefinedAction(cms.entries.update, actionContext, {
        collectionId: validated.collectionId,
        id: validated.entryId,
        version: validated.expectedEntryVersion,
        patch: {
          locale: validated.targetLocale,
          title: validated.translation.title,
          slug: validated.translation.slug ?? source.slug,
          frontmatter: protectedFrontmatter,
          translationMeta: {
            method: "ai",
            sourceLocale: validated.sourceLocale,
            sourceContentHash: currentSourceHash,
            generatedAt: new Date().toISOString(),
            translatedFieldPaths: validated.translatedFieldPaths,
          },
          ...(validated.translation.body !== undefined
            ? { body: validated.translation.body }
            : {}),
        },
      });
    },
  });
}

export async function ariaDuplicateEntry(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.entries.create",
    inputSchema: AriaDuplicateEntryInputSchema,
    outputSchema: AriaEntryOutputSchema,
    payload: input,
    action: cms.entries.duplicate,
  });
}

export async function ariaDeleteEntry(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.entries.remove",
    inputSchema: AriaDeleteEntryInputSchema,
    outputSchema: DeleteSuccessSchema,
    payload: input,
    action: cms.entries.remove,
  });
}

export async function ariaPublishEntry(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.entries.publish",
    inputSchema: AriaPublishEntryInputSchema,
    outputSchema: AriaEntryOutputSchema,
    payload: input,
    action: cms.entries.publish,
  });
}

export async function ariaUnpublishEntry(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.entries.unpublish",
    inputSchema: AriaUnpublishEntryInputSchema,
    outputSchema: AriaEntryOutputSchema,
    payload: input,
    action: cms.entries.unpublish,
  });
}

export async function ariaArchiveEntry(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.entries.archive",
    inputSchema: AriaArchiveEntryInputSchema,
    outputSchema: AriaEntryOutputSchema,
    payload: input,
    action: cms.entries.archive,
  });
}

export async function ariaRestoreEntryRevision(
  context: AgentToolActionContext,
  input: unknown,
) {
  return invokeActionHandlerForTool({
    context,
    operationId: "cms.revisions.restore",
    inputSchema: AriaRestoreEntryRevisionInputSchema,
    outputSchema: AriaEntryOutputSchema,
    payload: input,
    action: cms.revisions.restore,
  });
}

function walkNodePath(
  nodes: readonly BuilderNode[],
  nodeId: string,
  ancestors: BuilderNode[] = [],
): { node: BuilderNode; ancestors: BuilderNode[] } | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return { node, ancestors };
    }
    const found = walkNodePath(node.children ?? [], nodeId, [
      ...ancestors,
      node,
    ]);
    if (found) return found;
  }
  return null;
}

function cmsCollectionFromSource(
  source: NodeDataSource | null | undefined,
): string | null {
  if (
    source &&
    (source.type === "cms" || source.type === "collection") &&
    typeof source.collection === "string"
  ) {
    return source.collection;
  }
  return null;
}

async function resolveCmsCollectionName(input: {
  context: AgentToolActionContext;
  requested?: string;
  existing?: NodeDataSource | null;
  pageId?: string;
}): Promise<string | null> {
  if (input.requested) return input.requested;
  const existing = cmsCollectionFromSource(input.existing);
  if (existing) return existing;
  if (!input.pageId) return null;

  const { collections } = await listCollectionsForAction(
    toToolActionContext(input.context),
  );
  const assigned = collections.find(
    (collection) =>
      collection.templatePageId === input.pageId ||
      collection.listPageId === input.pageId,
  );
  return assigned?.name ?? null;
}

function inheritedLoopSource(
  ancestors: readonly BuilderNode[],
): NodeDataSource | null {
  for (const ancestor of [...ancestors].reverse()) {
    const parsed = NodeDataSourceSchema.safeParse(ancestor.dataSource);
    const source = parsed.success ? parsed.data : undefined;
    if (
      source &&
      (source.type === "cms" || source.type === "collection") &&
      source.mode === "list" &&
      source.collection
    ) {
      return source;
    }
  }
  return null;
}

function readEntryFilterFromDataSource(
  source: NodeDataSource | null | undefined,
): { slug?: string; id?: string } | undefined {
  if (!source?.filter || typeof source.filter !== "object") {
    return undefined;
  }
  const filter = source.filter as Record<string, unknown>;
  if (typeof filter.slug === "string" && filter.slug.length > 0) {
    return { slug: filter.slug };
  }
  if (typeof filter.id === "string" && filter.id.length > 0) {
    return { id: filter.id };
  }
  return undefined;
}

async function resolveSingleEntryFilterForBind(input: {
  context: AgentToolActionContext;
  collectionName: string | null;
  entrySlug?: string;
  current?: NodeDataSource;
  mode: "single" | "list";
}): Promise<{ slug?: string; id?: string } | undefined> {
  if (input.mode !== "single" || !input.collectionName) {
    return undefined;
  }
  if (input.entrySlug) {
    return { slug: input.entrySlug };
  }
  const existing = readEntryFilterFromDataSource(input.current);
  if (existing) {
    return existing;
  }
  const { collections } = await listCollectionsForAction(
    toToolActionContext(input.context),
  );
  const collection = collectionByName(collections, input.collectionName);
  if (collection?.kind === "config") {
    return { slug: "default" };
  }
  return undefined;
}

export async function ariaBindNodeField(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<z.infer<typeof AriaCmsBindingOutputSchema>>> {
  const parsed = AriaBindNodeFieldInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const read = await readResourceForTool(context, {
    collection: parsed.data.collection,
    slug: parsed.data.slug,
    target: "draft",
  });
  if (!read.ok) return read as AgentToolResult<never>;

  const document = read.data as { id?: string; nodes?: BuilderNode[] };
  const found = walkNodePath(document.nodes ?? [], parsed.data.nodeId);
  if (!found) {
    return toolErrorResult({
      code: "NOT_FOUND",
      message: `Node ${parsed.data.nodeId} was not found.`,
    });
  }

  const current = NodeDataSourceSchema.safeParse(found.node.dataSource).success
    ? NodeDataSourceSchema.parse(found.node.dataSource)
    : undefined;
  const loopSource = inheritedLoopSource(found.ancestors);
  const collectionName = await resolveCmsCollectionName({
    context,
    requested: parsed.data.cmsCollection,
    existing: current ?? loopSource,
    pageId: typeof document.id === "string" ? document.id : parsed.data.slug,
  });

  if (!collectionName && !loopSource) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message: "A CMS collection is required to bind this node.",
      suggestedFix:
        "Pass cmsCollection, bind on an assigned CMS template page, or bind inside a CMS loop.",
    });
  }

  const mode = current?.mode ?? "single";
  const entryFilter = await resolveSingleEntryFilterForBind({
    context,
    collectionName,
    entrySlug: parsed.data.entrySlug,
    current,
    mode,
  });

  const nextSource = NodeDataSourceSchema.unwrap().parse({
    ...(current ?? {}),
    type: loopSource && !current?.collection ? "static" : "collection",
    ...(loopSource && !current?.collection
      ? {}
      : { collection: collectionName }),
    mode,
    ...(entryFilter ? { filter: entryFilter } : {}),
    bindings: {
      ...(current?.bindings ?? {}),
      [parsed.data.propName]: parsed.data.fieldPath,
    },
  });

  const result = await ariaMutateNode(context, {
    collection: parsed.data.collection,
    slug: parsed.data.slug,
    nodeId: parsed.data.nodeId,
    updates: { dataSource: nextSource },
  });

  if (!result.ok) return result as AgentToolResult<never>;

  return toolSuccessResult({
    success: true as const,
    nodeId: parsed.data.nodeId,
    dataSource: nextSource,
  });
}

export async function ariaSetContainerLoop(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<z.infer<typeof AriaCmsBindingOutputSchema>>> {
  const parsed = AriaSetContainerLoopInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const read = await readResourceForTool(context, {
    collection: parsed.data.collection,
    slug: parsed.data.slug,
    target: "draft",
  });
  if (!read.ok) return read as AgentToolResult<never>;

  const document = read.data as { nodes?: BuilderNode[] };
  const node = findNodeById(document.nodes ?? [], parsed.data.nodeId);
  if (!node) {
    return toolErrorResult({
      code: "NOT_FOUND",
      message: `Node ${parsed.data.nodeId} was not found.`,
    });
  }
  if (!Array.isArray(node.children) || node.children.length === 0) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message: "CMS loops require a container node with child template nodes.",
    });
  }

  const current = NodeDataSourceSchema.safeParse(node.dataSource).success
    ? NodeDataSourceSchema.parse(node.dataSource)
    : undefined;
  const nextSource = NodeDataSourceSchema.unwrap().parse({
    ...(current ?? {}),
    type: "collection",
    collection: parsed.data.cmsCollection,
    mode: "list",
    ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
    ...(parsed.data.sort ? { sort: parsed.data.sort } : {}),
    ...(parsed.data.offset !== undefined ? { offset: parsed.data.offset } : {}),
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.locale ? { locale: parsed.data.locale } : {}),
    ...(parsed.data.filter ? { filter: parsed.data.filter } : {}),
  });

  const result = await ariaMutateNode(context, {
    collection: parsed.data.collection,
    slug: parsed.data.slug,
    nodeId: parsed.data.nodeId,
    updates: { dataSource: nextSource },
  });

  if (!result.ok) return result as AgentToolResult<never>;

  return toolSuccessResult({
    success: true as const,
    nodeId: parsed.data.nodeId,
    dataSource: nextSource,
  });
}

export async function ariaSetupBlog(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<z.infer<typeof AriaCmsSetupOutputSchema>>> {
  return invokeActionForTool({
    context,
    operationId: "cms.collections.create",
    inputSchema: AriaSetupBlogInputSchema,
    outputSchema: AriaCmsSetupOutputSchema,
    input,
    call: async (validated, actionContext) => {
      const created: string[] = [];
      const reused: string[] = [];
      const entries: string[] = [];
      const list = await listCollectionsForAction(actionContext);
      let topics = collectionByName(list.collections, validated.topicsName);
      let posts = collectionByName(list.collections, validated.postsName);

      if (!topics) {
        topics = await createCollectionForAction(
          {
            name: validated.topicsName,
            label: "Topics",
            kind: "tags",
            fields: [
              { key: "description", label: "Description", type: "text" },
            ],
            supports: ["drafts", "revisions", "search"],
            urlPattern: `/${validated.topicsName}/{slug}`,
          },
          actionContext,
        );
        created.push(topics.name);
      } else {
        reused.push(topics.name);
      }

      if (!posts) {
        posts = await createCollectionForAction(
          {
            name: validated.postsName,
            label: "Posts",
            kind: "content",
            fields: [
              {
                key: "excerpt",
                label: "Excerpt",
                type: "text",
                searchable: true,
              },
              { key: "featured_image", label: "Featured Image", type: "image" },
              { key: "publishedDate", label: "Published Date", type: "date" },
              {
                key: "topics",
                label: "Topics",
                type: "relation",
                targetCollection: topics.name,
              },
            ],
            supports: [
              "body",
              "cover",
              "drafts",
              "revisions",
              "scheduling",
              "search",
              "seo",
            ],
            urlPattern: `/${validated.postsName}/{slug}`,
          },
          actionContext,
        );
        created.push(posts.name);
      } else {
        reused.push(posts.name);
      }

      if (validated.seedSampleEntry && posts) {
        const existing = await listEntriesForAction(
          { collectionId: posts.id, query: "hello-world", limit: 1 },
          actionContext,
        );
        if (existing.items.length === 0) {
          const entry = await createEntryForAction(
            {
              collectionId: posts.id,
              title: "Hello World",
              slug: "hello-world",
              frontmatter: {
                excerpt: "Your first CMS-powered post.",
                publishedDate: new Date().toISOString().slice(0, 10),
              },
              body: null,
            },
            actionContext,
          );
          entries.push(entry.entry.id);
        }
      }

      return { created, reused, updated: [], entries };
    },
  });
}

export async function ariaSetupTagArchive(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<z.infer<typeof AriaCmsSetupOutputSchema>>> {
  return invokeActionForTool({
    context,
    operationId: "cms.collections.update",
    inputSchema: AriaSetupTagArchiveInputSchema,
    outputSchema: AriaCmsSetupOutputSchema,
    input,
    call: async (validated, actionContext) => {
      const created: string[] = [];
      const reused: string[] = [];
      const updated: string[] = [];
      const list = await listCollectionsForAction(actionContext);
      let tags = collectionByName(list.collections, validated.tagsName);
      let content = collectionByName(list.collections, validated.contentName);

      if (!tags) {
        tags = await createCollectionForAction(
          {
            name: validated.tagsName,
            label: "Topics",
            kind: "tags",
            fields: [
              { key: "description", label: "Description", type: "text" },
            ],
            urlPattern: `/${validated.tagsName}/{slug}`,
            supports: ["drafts", "revisions", "search"],
          },
          actionContext,
        );
        created.push(tags.name);
      } else {
        reused.push(tags.name);
      }

      if (content) {
        const hasBridge = content.schema.fields.some(
          (field) =>
            field.key === validated.tagsName ||
            (field.type === "relation" &&
              field.targetCollection === tags!.name),
        );
        if (!hasBridge) {
          content = await updateCollectionForAction(
            {
              id: content.id,
              expectedUpdatedAt: content.updatedAt,
              patch: {
                fields: [
                  ...content.schema.fields,
                  {
                    key: validated.tagsName,
                    label: "Topics",
                    type: "relation",
                    targetCollection: tags.name,
                  },
                ],
              },
            },
            actionContext,
          );
          updated.push(content.name);
        } else {
          reused.push(content.name);
        }
      }

      return { created, reused, updated, entries: [] };
    },
  });
}

export async function ariaSetupNavCollection(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<z.infer<typeof AriaCmsSetupOutputSchema>>> {
  return invokeActionForTool({
    context,
    operationId: "cms.collections.create",
    inputSchema: AriaSetupNavCollectionInputSchema,
    outputSchema: AriaCmsSetupOutputSchema,
    input,
    call: async (validated, actionContext) => {
      const created: string[] = [];
      const reused: string[] = [];
      const entries: string[] = [];
      const list = await listCollectionsForAction(actionContext);
      let nav = collectionByName(list.collections, validated.name);

      if (!nav) {
        nav = await createCollectionForAction(
          {
            name: validated.name,
            label: "Main Nav",
            kind: "data",
            fields: [
              { key: "label", label: "Label", type: "string", required: true },
              { key: "link", label: "Link", type: "link", required: true },
              { key: "order", label: "Order", type: "integer" },
              {
                key: "parent",
                label: "Parent",
                type: "reference",
                targetCollection: validated.name,
              },
            ],
            supports: ["drafts", "revisions"],
          },
          actionContext,
        );
        created.push(nav.name);
      } else {
        reused.push(nav.name);
      }

      if (validated.seedHomeLink && nav) {
        const existing = await listEntriesForAction(
          { collectionId: nav.id, query: "Home", limit: 1 },
          actionContext,
        );
        if (existing.items.length === 0) {
          const entry = await createEntryForAction(
            {
              collectionId: nav.id,
              title: "Home",
              slug: "home",
              frontmatter: {
                label: "Home",
                link: { type: "url", href: "/" },
                order: 0,
              },
            },
            actionContext,
          );
          entries.push(entry.entry.id);
        }
      }

      return { created, reused, updated: [], entries };
    },
  });
}

export async function ariaSetupConfigCollection(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<z.infer<typeof AriaCmsSetupOutputSchema>>> {
  return invokeActionForTool({
    context,
    operationId: "cms.collections.create",
    inputSchema: AriaSetupConfigCollectionInputSchema,
    outputSchema: AriaCmsSetupOutputSchema,
    input,
    call: async (validated, actionContext) => {
      const created: string[] = [];
      const reused: string[] = [];
      const entries: string[] = [];
      const collectionName = slugify(validated.name);
      const list = await listCollectionsForAction(actionContext);
      let config = collectionByName(list.collections, collectionName);

      if (!config) {
        config = await createCollectionForAction(
          {
            name: collectionName,
            label: validated.label,
            kind: "config",
            fields: [
              { key: "hero_title", label: "Hero Title", type: "string" },
              { key: "hero_image", label: "Hero Image", type: "image" },
              { key: "hero_cta", label: "Hero CTA", type: "link" },
            ],
            supports: ["drafts", "revisions"],
          },
          actionContext,
        );
        created.push(config.name);
      } else {
        reused.push(config.name);
      }

      const existing = await listEntriesForAction(
        { collectionId: config.id, query: "default", limit: 1 },
        actionContext,
      );
      if (existing.items.length === 0) {
        const entry = await createEntryForAction(
          {
            collectionId: config.id,
            title: "Default",
            slug: "default",
            frontmatter: {
              hero_title: "Build with Aria",
            },
          },
          actionContext,
        );
        entries.push(entry.entry.id);
      }

      return { created, reused, updated: [], entries };
    },
  });
}
