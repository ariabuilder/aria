import { z } from "zod";
import {
  NodeClassNamesSchema,
  createEmptyClassNames,
} from "../schemas/classEditor";
import type { BuilderNode } from "../types/nodes";
import { BuilderNodeSchema } from "../schemas/nodes";

export const NormalizeClassResultSchema = z
  .object({
    node: BuilderNodeSchema,
    utilitiesMigrated: z.number().nonnegative(),
    customClassesMigrated: z.number().nonnegative(),
    legacyFieldsCleared: z.number().nonnegative(),
  })
  .strict();

export type NormalizeClassResult = z.infer<typeof NormalizeClassResultSchema>;

/**
 * Normalise a single BuilderNode: recursively process children. Legacy field
 * handling has been removed; this function now validates.
 */
export function normalizeBuilderNodeClassFields(
  node: BuilderNode,
): NormalizeClassResult {
  const children = (node.children ?? []).map((child) =>
    normalizeBuilderNodeClassFields(child),
  );
  const normalizedChildren = children.map((r) => r.node);

  // Validate/ensure classNames structure exists
  const classNames = node.classNames
    ? NodeClassNamesSchema.parse(node.classNames)
    : createEmptyClassNames();

  return NormalizeClassResultSchema.parse({
    node: {
      ...node,
      classNames,
      children: normalizedChildren,
    },
    utilitiesMigrated: 0,
    customClassesMigrated: 0,
    legacyFieldsCleared: 0,
  });
}

/**
 * Convenience wrapper for arrays of nodes.
 */
export function normalizeBuilderNodeClassFieldsTree(
  nodes: readonly BuilderNode[],
): NormalizeClassResult[] {
  return nodes.map((n) => normalizeBuilderNodeClassFields(n));
}
