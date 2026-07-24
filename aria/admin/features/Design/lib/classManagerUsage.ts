import { z } from "zod";

import { traverseNodes } from "../../../../lib/blocks/nodeUtils";
import { BuilderNodeSchema } from "../../../../lib/schemas/nodes";

export const ClassManagerSourceCollectionSchema = z.enum([
  "pages",
  "layouts",
  "components",
]);

export type ClassManagerSourceCollection = z.infer<
  typeof ClassManagerSourceCollectionSchema
>;

export const ClassManagerUsageLocationSchema = z.object({
  className: z.string().trim().min(1),
  collection: ClassManagerSourceCollectionSchema,
  id: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  title: z.string().trim().min(1),
  nodeId: z.string().trim().min(1),
  itemPath: z.string().trim().min(1),
});

export type ClassManagerUsageLocation = z.infer<
  typeof ClassManagerUsageLocationSchema
>;

export const ClassManagerUsageEntrySchema = z.object({
  className: z.string().trim().min(1),
  totalReferences: z.int().min(0),
  itemCount: z.int().min(0),
  locations: z.array(ClassManagerUsageLocationSchema),
});

export type ClassManagerUsageEntry = z.infer<
  typeof ClassManagerUsageEntrySchema
>;

export const ClassManagerUsageSourceSchema = z.object({
  collection: ClassManagerSourceCollectionSchema,
  id: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  title: z.string().trim().min(1),
  nodes: z.array(BuilderNodeSchema),
});

export type ClassManagerUsageSource = z.infer<
  typeof ClassManagerUsageSourceSchema
>;

export function parseClassManagerUsageSources(
  value: unknown,
): ClassManagerUsageSource[] {
  return z.array(ClassManagerUsageSourceSchema).parse(value);
}

function getItemPath(source: ClassManagerUsageSource): string {
  if (source.collection === "pages") {
    return `/${source.slug}`;
  }

  return source.slug;
}

export function aggregateClassUsage(
  sources: readonly ClassManagerUsageSource[],
): Record<string, ClassManagerUsageEntry> {
  const usageByClassName = new Map<
    string,
    {
      totalReferences: number;
      itemKeys: Set<string>;
      locations: ClassManagerUsageLocation[];
    }
  >();

  for (const source of sources) {
    const itemPath = getItemPath(source);

    for (const node of source.nodes) {
      traverseNodes(node, (visitedNode) => {
        for (const className of visitedNode.customClasses ?? []) {
          const normalizedClassName = className.trim();
          if (!normalizedClassName) {
            continue;
          }

          const existing = usageByClassName.get(normalizedClassName) ?? {
            totalReferences: 0,
            itemKeys: new Set<string>(),
            locations: [],
          };

          existing.totalReferences += 1;
          existing.itemKeys.add(`${source.collection}:${source.id}`);
          existing.locations.push(
            ClassManagerUsageLocationSchema.parse({
              className: normalizedClassName,
              collection: source.collection,
              id: source.id,
              slug: source.slug,
              title: source.title,
              nodeId: visitedNode.id,
              itemPath,
            }),
          );

          usageByClassName.set(normalizedClassName, existing);
        }
      });
    }
  }

  return Object.fromEntries(
    Array.from(usageByClassName.entries()).map(([className, entry]) => [
      className,
      ClassManagerUsageEntrySchema.parse({
        className,
        totalReferences: entry.totalReferences,
        itemCount: entry.itemKeys.size,
        locations: entry.locations,
      }),
    ]),
  );
}
