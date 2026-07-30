import { z } from "zod";

import { JsonValueSchema } from "../../../../lib/schemas/json";
import {
  NodeDataSourceSchema,
  NodeMetadataSchema,
  StyleMapSchema,
} from "../../../../lib/schemas/nodes";
import { useHistory } from "../../History";
import type { OperationType } from "../../History";
import type { NodeTarget } from "../types/inspector";

const NodePathSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    id: z.string().trim().min(1),
    version: z.string().trim().min(1).optional(),
  })
  .strict();

const NodeTargetSchema = z
  .object({
    path: NodePathSchema,
    nodeId: z.string().trim().min(1),
  })
  .strict();

const MutationPropsSchema = z.record(
  z.string(),
  z.union([JsonValueSchema, z.undefined()]),
);

const MutationA11ySchema = z
  .object({
    role: z.string().optional(),
    ariaLabel: z.string().optional(),
    ariaDescribedBy: z.string().optional(),
    ariaLabelledBy: z.string().optional(),
    ariaHidden: z.boolean().optional(),
    ariaExpanded: z.boolean().optional(),
    ariaControls: z.string().optional(),
    tabIndex: z.number().optional(),
  })
  .strict();

export const NodeMutationUpdatesSchema = z
  .object({
    props: MutationPropsSchema.optional(),
    styles: StyleMapSchema.optional(),
    a11y: MutationA11ySchema.optional(),
    dataSource: z.union([NodeDataSourceSchema.unwrap(), z.null()]).optional(),
    metadata: NodeMetadataSchema,
  })
  .strict()
  .refine(
    (value) =>
      Boolean(value.props) ||
      Boolean(value.styles) ||
      Boolean(value.a11y) ||
      value.dataSource !== undefined ||
      Object.prototype.hasOwnProperty.call(value, "metadata"),
    {
      message: "Mutation updates cannot be empty",
    },
  );

const NodeMutationHistoryTypeSchema = z.enum([
  "update-node-props",
  "update-node-styles",
  "batch-nodes",
]);

const NodeMutationActionUpdatesSchema = z
  .object({
    props: z.record(z.string(), z.unknown()).optional(),
    styles: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
    a11y: MutationA11ySchema.optional(),
    dataSource: z.union([NodeDataSourceSchema.unwrap(), z.null()]).optional(),
    metadata: NodeMetadataSchema,
  })
  .strict()
  .refine(
    (value) =>
      Boolean(value.props) ||
      Boolean(value.styles) ||
      Boolean(value.a11y) ||
      value.dataSource !== undefined ||
      Object.prototype.hasOwnProperty.call(value, "metadata"),
    {
      message: "Mutation action updates cannot be empty",
    },
  );

const NodeMutationHistoryMetadataSchema = z
  .object({
    type: NodeMutationHistoryTypeSchema,
    description: z.string().trim().min(1),
    affectedNodeIds: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

const NodeMutationExecutionSchema = z
  .object({
    metadata: NodeMutationHistoryMetadataSchema,
    target: NodeTargetSchema,
    updates: NodeMutationUpdatesSchema,
    restoreUpdates: NodeMutationUpdatesSchema,
    breakpoint: z.string().trim().min(1),
  })
  .strict();

export type NodeMutationUpdates = z.infer<typeof NodeMutationUpdatesSchema>;

type NodeMutationHistoryResult = {
  success: boolean;
  error?: string;
  version?: string;
};

interface NodeMutationHistoryCallbacks {
  onUndo?: () => void;
  onRedo?: () => void;
}

interface ExecuteNodeMutationInput {
  metadata: z.input<typeof NodeMutationHistoryMetadataSchema>;
  target: NodeTarget;
  updates: NodeMutationUpdates;
  restoreUpdates: NodeMutationUpdates;
  breakpoint: string;
  callbacks?: NodeMutationHistoryCallbacks;
}

export function useNodeMutationHistory() {
  const { execute } = useHistory();

  async function executeNodeMutation(
    input: ExecuteNodeMutationInput,
  ): Promise<NodeMutationHistoryResult> {
    const { callbacks, ...executionInput } = input;
    const parsedInput = NodeMutationExecutionSchema.safeParse(executionInput);
    if (!parsedInput.success) {
      return {
        success: false,
        error:
          parsedInput.error.issues[0]?.message ??
          "Invalid node mutation operation",
      };
    }

    NodeMutationActionUpdatesSchema.parse(parsedInput.data.updates);
    NodeMutationActionUpdatesSchema.parse(parsedInput.data.restoreUpdates);
    const result = await execute({
      type: parsedInput.data.metadata.type as OperationType,
      timestamp: Date.now(),
      description: parsedInput.data.metadata.description,
      affectedNodeIds: parsedInput.data.metadata.affectedNodeIds,
      undo: async () => {
        callbacks?.onUndo?.();
      },
      redo: async () => {
        callbacks?.onRedo?.();
      },
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error?.message ?? "Failed to execute node mutation",
      };
    }

    return {
      success: true,
    };
  }

  return {
    executeNodeMutation,
  };
}
