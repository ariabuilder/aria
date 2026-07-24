import { z } from "zod";
import { NodeDataSourceSchema } from "../schemas/nodes";
import { AriaCollectionSchema, type AriaCollection } from "./schemas";
import { StoredPageSystemRoleSchema } from "../storage/adapter";
import {
  CmsPageUsageSchema,
  CmsPageReferenceSchema,
  deriveCmsPageUsages,
  type CmsPageUsage,
} from "./pageUsage";

type CmsUsageScannableNode = {
  id: string;
  dataSource?: unknown;
  children: CmsUsageScannableNode[];
};

const CmsUsageScannableNodeSchema: z.ZodType<CmsUsageScannableNode> = z.lazy(
  () =>
    z
      .object({
        id: z.string().trim().min(1),
        dataSource: z.unknown().optional(),
        children: z.array(CmsUsageScannableNodeSchema).default([]),
      })
      .strip(),
);

export const CmsPageUsageIndexSchema = z
  .object({
    usagesByPageId: z.record(z.string(), z.array(CmsPageUsageSchema)),
  })
  .strict();
export type CmsPageUsageIndex = z.infer<typeof CmsPageUsageIndexSchema>;

const ScannablePageSchema = z
  .object({
    id: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    title: z.string().trim().min(1),
    systemRole: StoredPageSystemRoleSchema.optional(),
    nodes: z
      .array(CmsUsageScannableNodeSchema)
      .default([]),
  })
  .strict();

type ScannablePage = z.infer<typeof ScannablePageSchema>;
export type CmsPageUsageIndexPageInput = z.input<typeof ScannablePageSchema>;

function collectionLabelByName(
  collections: readonly AriaCollection[],
): Map<string, AriaCollection> {
  const map = new Map<string, AriaCollection>();
  for (const collection of collections) {
    map.set(collection.name, collection);
    map.set(collection.id, collection);
  }
  return map;
}

function isCmsDataSource(value: unknown): boolean {
  const parsed = NodeDataSourceSchema.unwrap().safeParse(value);
  if (!parsed.success) return false;
  const source = parsed.data;
  if (source.type !== "cms" && source.type !== "collection") return false;
  return Boolean(
    source.collection ||
      source.entryScope === "context" ||
      source.mode === "list" ||
      source.source === "field" ||
      source.field ||
      Object.keys(source.bindings ?? {}).length > 0,
  );
}

function cmsUsageForNode(
  node: CmsUsageScannableNode,
  collectionsByName: Map<string, AriaCollection>,
): CmsPageUsage | null {
  const parsed = NodeDataSourceSchema.unwrap().safeParse(node.dataSource);
  if (!parsed.success) return null;
  const source = parsed.data;
  if (!isCmsDataSource(source)) return null;

  const collection = source.collection
    ? collectionsByName.get(source.collection)
    : undefined;
  const bindingCount = Object.keys(source.bindings ?? {}).length;
  return CmsPageUsageSchema.parse({
    kind: "cms-bound",
    collectionId: collection?.id,
    collectionName: collection?.name ?? source.collection,
    collectionLabel: collection?.label,
    nodeId: node.id,
    bindingCount,
    loop: source.mode === "list" || source.source === "field",
  });
}

export function collectCmsDataSourceUsagesFromNodes(
  nodes: readonly unknown[],
  collections: readonly AriaCollection[],
): CmsPageUsage[] {
  const parsedCollections = z.array(AriaCollectionSchema).parse(collections);
  const parsedNodes = z.array(CmsUsageScannableNodeSchema).safeParse(nodes);
  if (!parsedNodes.success) return [];
  const collectionsByName = collectionLabelByName(parsedCollections);
  const usages: CmsPageUsage[] = [];

  function walk(nodeList: readonly CmsUsageScannableNode[]): void {
    for (const node of nodeList) {
      const usage = cmsUsageForNode(node, collectionsByName);
      if (usage) {
        usages.push(usage);
      }
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  }

  walk(parsedNodes.data);
  return z.array(CmsPageUsageSchema).parse(usages);
}

export function deriveCmsPageUsageIndex(input: {
  pages: readonly CmsPageUsageIndexPageInput[];
  collections: readonly AriaCollection[];
}): CmsPageUsageIndex {
  const pages: ScannablePage[] = z.array(ScannablePageSchema).parse(
    input.pages.map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      systemRole: page.systemRole,
      nodes: page.nodes ?? [],
    })),
  );
  const collections = z.array(AriaCollectionSchema).parse(input.collections);
  const references = z.array(CmsPageReferenceSchema).parse(
    pages.map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      systemRole: page.systemRole,
    })),
  );
  const usageMap = deriveCmsPageUsages({
    pages: references,
    collections,
  });

  return CmsPageUsageIndexSchema.parse({
    usagesByPageId: Object.fromEntries(usageMap.entries()),
  });
}
