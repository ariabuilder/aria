import { z } from "zod";
import {
  BuilderNodeSchema,
  NodeIdSchema,
} from "../../../../lib/schemas/nodes";

export const NodeSwapStrategyIdSchema = z.enum(["svg-to-icon", "icon-to-svg"]);

export type NodeSwapStrategyId = z.infer<typeof NodeSwapStrategyIdSchema>;

export const NodeSwapRequestSchema = z
  .object({
    nodeId: NodeIdSchema,
    strategyId: NodeSwapStrategyIdSchema,
  })
  .strict();

export const NodeSwapOptionSchema = z
  .object({
    id: NodeSwapStrategyIdSchema,
    label: z.string().trim().min(1),
  })
  .strict();

export type NodeSwapOption = z.infer<typeof NodeSwapOptionSchema>;

export const ReplaceNodeActionInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    id: z.string().trim().min(1),
    nodeId: NodeIdSchema,
    node: BuilderNodeSchema,
  })
  .strict()
  .refine((value) => value.node.id === value.nodeId, {
    message: "Replacement node id must match nodeId",
    path: ["node", "id"],
  });

export const ReplaceNodeActionResultSchema = z
  .object({
    version: z.string().trim().min(1),
  })
  .strict();

export type ReplaceNodeActionResult = z.infer<
  typeof ReplaceNodeActionResultSchema
>;
