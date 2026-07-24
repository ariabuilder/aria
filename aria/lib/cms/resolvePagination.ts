import { z } from "zod";
import type { BuilderNode } from "../types/nodes";
import { NodeDataSourceSchema } from "../schemas/nodes";

export const PaginationQueryPageSchema = z
  .object({
    pageParam: z.string().trim().min(1).default("page"),
    rawQueryValue: z.string().optional(),
  })
  .strict();

export const ResolvedPaginationPageSchema = z
  .object({
    page: z.int().positive(),
    pageParam: z.string().trim().min(1),
  })
  .strict();
export type ResolvedPaginationPage = z.infer<
  typeof ResolvedPaginationPageSchema
>;

export function resolvePaginationPageFromQuery(
  input: z.input<typeof PaginationQueryPageSchema>,
): ResolvedPaginationPage {
  const { pageParam, rawQueryValue } = PaginationQueryPageSchema.parse(input);
  if (!rawQueryValue?.trim()) {
    return ResolvedPaginationPageSchema.parse({ page: 1, pageParam });
  }

  const parsed = Number.parseInt(rawQueryValue, 10);
  const page =
    Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

  return ResolvedPaginationPageSchema.parse({ page, pageParam });
}

export const PaginationDataSourceSchema = z
  .object({
    type: z.literal("pagination"),
    targetNodeId: z.string().trim().min(1),
  })
  .strict();
export type PaginationDataSource = z.infer<typeof PaginationDataSourceSchema>;

export const PaginationNodePropsSchema = z
  .object({
    style: z.enum(["numbers", "prevNext", "loadMore"]).default("numbers"),
    maxPageButtons: z.int().positive().max(11).default(5),
    pageParam: z.string().trim().min(1).default("page"),
    labels: z
      .object({
        prev: z.string().default("Previous"),
        next: z.string().default("Next"),
      })
      .strict()
      .optional(),
  })
  .strict();
export type PaginationNodeProps = z.infer<typeof PaginationNodePropsSchema>;

const ListDataSourceSchema = NodeDataSourceSchema.unwrap()
  .extend({
    type: z.enum(["cms", "collection"]),
    mode: z.literal("list"),
    collection: z.string().trim().min(1),
  })
  .strict();

function findNodeById(
  nodes: readonly BuilderNode[],
  nodeId: string,
): BuilderNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    const childMatch = findNodeById(node.children, nodeId);
    if (childMatch) {
      return childMatch;
    }
  }
  return null;
}

export function collectPaginationBindings(
  nodes: readonly BuilderNode[],
): Map<string, PaginationDataSource> {
  const bindings = new Map<string, PaginationDataSource>();

  for (const node of nodes) {
    const dataSource = node.dataSource;
    if (dataSource?.type === "pagination" && dataSource.targetNodeId) {
      bindings.set(
        node.id,
        PaginationDataSourceSchema.parse({
          type: "pagination",
          targetNodeId: dataSource.targetNodeId,
        }),
      );
    }
    for (const [childId, childBinding] of collectPaginationBindings(
      node.children,
    )) {
      bindings.set(childId, childBinding);
    }
  }

  return bindings;
}

export function applyPaginationOffsetsToDataSources(input: {
  nodes: readonly BuilderNode[];
  sources: Record<string, NonNullable<BuilderNode["dataSource"]>>;
  page: number;
}): Record<string, NonNullable<BuilderNode["dataSource"]>> {
  const paginationBindings = collectPaginationBindings(input.nodes);
  if (paginationBindings.size === 0) {
    return input.sources;
  }

  const nextSources = { ...input.sources };

  for (const paginationSource of paginationBindings.values()) {
    const targetNode = findNodeById(
      input.nodes,
      paginationSource.targetNodeId,
    );
    if (!targetNode?.dataSource) {
      continue;
    }

    const listSource = ListDataSourceSchema.safeParse(targetNode.dataSource);
    if (!listSource.success) {
      continue;
    }

    const limit = listSource.data.limit ?? 12;
    const offset = (input.page - 1) * limit;
    nextSources[targetNode.id] = {
      ...listSource.data,
      offset,
    };
  }

  return nextSources;
}
