import { z } from "zod";

import { traverseNodes } from "../../../../lib/blocks/nodeUtils";
import { BuilderNodeSchema } from "../../../../lib/schemas/nodes";
import type { BuilderNode } from "../../../../lib/types/nodes";

export const ClassManagerCollectionSchema = z.enum([
  "pages",
  "layouts",
  "components",
]);

export type ClassManagerCollection = z.infer<
  typeof ClassManagerCollectionSchema
>;

export const ClassManagerUsageLocationSchema = z.object({
  collection: ClassManagerCollectionSchema,
  itemId: z.string().min(1),
  itemLabel: z.string().min(1),
  itemPath: z.string().min(1),
  nodeId: z.string().min(1),
  nodeLabel: z.string().min(1),
});

export type ClassManagerUsageLocation = z.infer<
  typeof ClassManagerUsageLocationSchema
>;

export const ClassManagerScannableItemSchema = z.object({
  collection: ClassManagerCollectionSchema,
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1),
  nodes: z.array(BuilderNodeSchema),
});

export type ClassManagerScannableItem = z.infer<
  typeof ClassManagerScannableItemSchema
>;

export interface ClassManagerUsageSummary {
  className: string;
  references: number;
  locations: ClassManagerUsageLocation[];
  pageCount: number;
  layoutCount: number;
  componentCount: number;
}

export type ClassManagerUsageIndex = Record<string, ClassManagerUsageSummary>;

function getNodeLabel(node: BuilderNode): string {
  const metadataLabel = node.metadata?.label;
  if (typeof metadataLabel === "string" && metadataLabel.trim()) {
    return metadataLabel.trim();
  }

  const text = node.props?.text;
  if (typeof text === "string" && text.trim()) {
    return text.trim();
  }

  return node.type;
}

function getCollectionCount(
  locations: readonly ClassManagerUsageLocation[],
  collection: ClassManagerCollection,
): number {
  return new Set(
    locations
      .filter((location) => location.collection === collection)
      .map((location) => location.itemId),
  ).size;
}

export function buildClassManagerUsageIndex(
  items: readonly ClassManagerScannableItem[],
): ClassManagerUsageIndex {
  const usageByClassName = new Map<string, ClassManagerUsageLocation[]>();

  for (const item of items) {
    for (const rootNode of item.nodes) {
      traverseNodes(rootNode, (node) => {
        const classNames = Array.isArray(node.customClasses)
          ? node.customClasses
          : [];

        for (const rawClassName of classNames) {
          if (typeof rawClassName !== "string") {
            continue;
          }

          const className = rawClassName.trim();
          if (!className) {
            continue;
          }

          const location: ClassManagerUsageLocation = {
            collection: item.collection,
            itemId: item.id,
            itemLabel: item.label,
            itemPath: item.path,
            nodeId: node.id,
            nodeLabel: getNodeLabel(node),
          };

          const currentLocations = usageByClassName.get(className) ?? [];
          currentLocations.push(location);
          usageByClassName.set(className, currentLocations);
        }
      });
    }
  }

  return Object.fromEntries(
    Array.from(usageByClassName.entries()).map(([className, locations]) => [
      className,
      {
        className,
        references: locations.length,
        locations,
        pageCount: getCollectionCount(locations, "pages"),
        layoutCount: getCollectionCount(locations, "layouts"),
        componentCount: getCollectionCount(locations, "components"),
      },
    ]),
  );
}
