import { z } from "zod";
import { NodeDataSourceSchema, PageDSLSchema } from "../schemas/nodes";
import type { BuilderNode, PageDSL } from "../types/nodes";
import type {
  AuthorshipSaveContext,
  StorageAdapter,
} from "../storage/adapter";
import { AriaCollectionSchema, type AriaCollection } from "./schemas";

const CmsCollectionPageBindingImpactPageSchema = z
  .object({
    pageId: z.string().trim().min(1),
    pageSlug: z.string().trim().min(1),
    pageTitle: z.string().trim().min(1).optional(),
    removedPageBindingCount: z.int().nonnegative(),
  })
  .strict();

export const CmsCollectionPageBindingImpactSchema = z
  .object({
    removedPageBindingCount: z.int().nonnegative(),
    affectedPages: z.array(CmsCollectionPageBindingImpactPageSchema),
  })
  .strict();

export type CmsCollectionPageBindingImpact = z.infer<
  typeof CmsCollectionPageBindingImpactSchema
>;

export const CmsCollectionPageBindingCleanupResultSchema = z
  .object({
    removedPageBindingCount: z.int().nonnegative(),
    updatedPageIds: z.array(z.string().trim().min(1)),
    updatedPageSlugs: z.array(z.string().trim().min(1)),
    affectedPages: z.array(CmsCollectionPageBindingImpactPageSchema),
  })
  .strict();

export type CmsCollectionPageBindingCleanupResult = z.infer<
  typeof CmsCollectionPageBindingCleanupResultSchema
>;

const ParsedNodeDataSourceSchema = NodeDataSourceSchema.unwrap();

type ParsedNodeDataSource = z.infer<typeof ParsedNodeDataSourceSchema>;

type NodeCleanupResult = {
  node: BuilderNode;
  removedPageBindingCount: number;
};

function hasBindings(source: ParsedNodeDataSource): boolean {
  return Object.keys(source.bindings ?? {}).length > 0;
}

function isContextOnlySource(source: ParsedNodeDataSource): boolean {
  return (
    !source.collection &&
    (hasBindings(source) ||
      source.entryScope === "context" ||
      source.source === "field")
  );
}

function isLoopSource(source: ParsedNodeDataSource): boolean {
  return source.mode === "list" || source.source === "field";
}

function matchesDeletedCollection(
  source: ParsedNodeDataSource,
  identifiers: ReadonlySet<string>,
): boolean {
  return Boolean(source.collection && identifiers.has(source.collection));
}

function cleanupNode(
  node: BuilderNode,
  identifiers: ReadonlySet<string>,
  inheritedDeletedLoop: boolean,
): NodeCleanupResult {
  const parsed = ParsedNodeDataSourceSchema.safeParse(node.dataSource);
  const source = parsed.success ? parsed.data : undefined;
  const directDeletedSource = source
    ? matchesDeletedCollection(source, identifiers)
    : false;
  const inheritedBinding = Boolean(
    inheritedDeletedLoop && source && isContextOnlySource(source),
  );
  const removeDataSource = directDeletedSource || inheritedBinding;

  let childInheritedDeletedLoop = inheritedDeletedLoop;
  if (source?.collection && isLoopSource(source)) {
    childInheritedDeletedLoop = directDeletedSource;
  } else if (source?.collection) {
    childInheritedDeletedLoop = false;
  } else if (source?.source === "field") {
    childInheritedDeletedLoop = directDeletedSource || inheritedDeletedLoop;
  }

  let childrenChanged = false;
  let removedPageBindingCount = removeDataSource ? 1 : 0;
  const children = node.children.map((child) => {
    const result = cleanupNode(child, identifiers, childInheritedDeletedLoop);
    if (result.node !== child) {
      childrenChanged = true;
    }
    removedPageBindingCount += result.removedPageBindingCount;
    return result.node;
  });

  if (!removeDataSource && !childrenChanged) {
    return { node, removedPageBindingCount };
  }

  const nextNode: BuilderNode = {
    ...node,
    children,
  };
  if (removeDataSource) {
    delete nextNode.dataSource;
  }

  return {
    node: nextNode,
    removedPageBindingCount,
  };
}

function collectionIdentifiers(collection: AriaCollection): Set<string> {
  const parsed = AriaCollectionSchema.parse(collection);
  return new Set([parsed.id, parsed.name]);
}

function cleanupPageDsl(
  page: PageDSL,
  collection: AriaCollection,
): { page: PageDSL; removedPageBindingCount: number } {
  const identifiers = collectionIdentifiers(collection);
  let removedPageBindingCount = 0;
  const nodes = page.nodes.map((node) => {
    const result = cleanupNode(node, identifiers, false);
    removedPageBindingCount += result.removedPageBindingCount;
    return result.node;
  });

  if (removedPageBindingCount === 0) {
    return { page, removedPageBindingCount };
  }

  return {
    page: PageDSLSchema.parse({
      ...page,
      nodes,
    }),
    removedPageBindingCount,
  };
}

async function listFullPageDsls(adapter: StorageAdapter): Promise<PageDSL[]> {
  const pages = await adapter.listPagesDSL({ limit: 1000, offset: 0 });
  const fullPages = await Promise.all(
    pages.map((page) => adapter.getPageDSL(page.id)),
  );
  return fullPages.filter((page): page is PageDSL => page !== null);
}

function impactPageFromCleanup(input: {
  page: PageDSL;
  removedPageBindingCount: number;
}): z.infer<typeof CmsCollectionPageBindingImpactPageSchema> {
  return CmsCollectionPageBindingImpactPageSchema.parse({
    pageId: input.page.id,
    pageSlug: input.page.slug,
    pageTitle: input.page.title,
    removedPageBindingCount: input.removedPageBindingCount,
  });
}

export async function getCollectionPageBindingImpactOnAdapter(
  adapter: StorageAdapter,
  collections: readonly AriaCollection[],
): Promise<CmsCollectionPageBindingImpact> {
  const parsedCollections = z.array(AriaCollectionSchema).parse(collections);
  const pages = await listFullPageDsls(adapter);
  const affectedPages = new Map<
    string,
    z.infer<typeof CmsCollectionPageBindingImpactPageSchema>
  >();

  for (const collection of parsedCollections) {
    for (const page of pages) {
      const result = cleanupPageDsl(page, collection);
      if (result.removedPageBindingCount === 0) continue;
      const existing = affectedPages.get(page.id);
      if (existing) {
        affectedPages.set(
          page.id,
          CmsCollectionPageBindingImpactPageSchema.parse({
            ...existing,
            removedPageBindingCount:
              existing.removedPageBindingCount +
              result.removedPageBindingCount,
          }),
        );
        continue;
      }
      affectedPages.set(
        page.id,
        impactPageFromCleanup({
          page,
          removedPageBindingCount: result.removedPageBindingCount,
        }),
      );
    }
  }

  const pagesList = Array.from(affectedPages.values());
  return CmsCollectionPageBindingImpactSchema.parse({
    removedPageBindingCount: pagesList.reduce(
      (total, page) => total + page.removedPageBindingCount,
      0,
    ),
    affectedPages: pagesList,
  });
}

export async function cleanupCollectionPageBindingsOnAdapter(
  adapter: StorageAdapter,
  collection: AriaCollection,
  authorship?: AuthorshipSaveContext,
): Promise<CmsCollectionPageBindingCleanupResult> {
  const parsedCollection = AriaCollectionSchema.parse(collection);
  const pages = await listFullPageDsls(adapter);
  const affectedPages: z.infer<
    typeof CmsCollectionPageBindingImpactPageSchema
  >[] = [];

  for (const page of pages) {
    const result = cleanupPageDsl(page, parsedCollection);
    if (result.removedPageBindingCount === 0) continue;
    await adapter.savePageDSL(result.page.id, result.page, undefined, authorship);
    affectedPages.push(
      impactPageFromCleanup({
        page: result.page,
        removedPageBindingCount: result.removedPageBindingCount,
      }),
    );
  }

  return CmsCollectionPageBindingCleanupResultSchema.parse({
    removedPageBindingCount: affectedPages.reduce(
      (total, page) => total + page.removedPageBindingCount,
      0,
    ),
    updatedPageIds: affectedPages.map((page) => page.pageId),
    updatedPageSlugs: affectedPages.map((page) => page.pageSlug),
    affectedPages,
  });
}
