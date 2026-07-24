import { z } from "zod";

import { JsonValueSchema } from "../../../../lib/schemas/json";
import { NodeMotionSchema } from "../../../../lib/motion/schemas/nodeMotion.schema";
import { NodeMetadataSchema } from "../../../../lib/schemas/nodes";
import { useHistory } from "../../History";
import type { OperationType } from "../../History";

const PropertySaveHistoryTypeSchema = z.enum([
  "update-node-props",
  "update-node-styles",
  "batch-nodes",
]);

const PropertySaveTargetSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    id: z.string().trim().min(1),
    nodeId: z.string().trim().min(1),
  })
  .strict();

const PropertySavePropsSchema = z.record(
  z.string().trim().min(1),
  z.union([JsonValueSchema, z.undefined()]),
);

const PropertySaveStylesSchema = z.record(
  z.string().trim().min(1),
  z.record(z.string().trim().min(1), z.union([z.string(), z.undefined()])),
);

const PropertySaveA11ySchema = z
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

export const PropertySaveMutationUpdatesSchema = z
  .object({
    props: PropertySavePropsSchema.optional(),
    styles: PropertySaveStylesSchema.optional(),
    a11y: PropertySaveA11ySchema.optional(),
    motion: NodeMotionSchema.optional(),
    metadata: NodeMetadataSchema,
  })
  .strict()
  .refine(
    (value) =>
      Boolean(value.props) ||
      Boolean(value.styles) ||
      Boolean(value.a11y) ||
      Boolean(value.motion) ||
      Object.prototype.hasOwnProperty.call(value, "metadata"),
    {
      message: "Property save updates cannot be empty",
    },
  );

const PropertySaveHistoryMetadataSchema = z
  .object({
    type: PropertySaveHistoryTypeSchema,
    description: z.string().trim().min(1),
    affectedNodeIds: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

const PropertySaveExecutionSchema = z
  .object({
    metadata: PropertySaveHistoryMetadataSchema,
    target: PropertySaveTargetSchema,
    updates: PropertySaveMutationUpdatesSchema,
    restoreUpdates: PropertySaveMutationUpdatesSchema,
    breakpoint: z.string().trim().min(1),
  })
  .strict();

const PropertySaveBatchExecutionSchema = z
  .object({
    metadata: PropertySaveHistoryMetadataSchema,
    targets: z
      .array(
        z
          .object({
            target: PropertySaveTargetSchema,
            updates: PropertySaveMutationUpdatesSchema,
            restoreUpdates: PropertySaveMutationUpdatesSchema,
          })
          .strict(),
      )
      .min(1),
    breakpoint: z.string().trim().min(1),
  })
  .strict();

export type PropertySaveMutationUpdates = z.infer<
  typeof PropertySaveMutationUpdatesSchema
>;

type PropertySaveHistoryResult = {
  success: boolean;
  error?: string;
};

interface ExecutePropertySaveMutationInput {
  metadata: z.input<typeof PropertySaveHistoryMetadataSchema>;
  target: z.infer<typeof PropertySaveTargetSchema>;
  updates: PropertySaveMutationUpdates;
  restoreUpdates: PropertySaveMutationUpdates;
  breakpoint: string;
  onRedo?: () => void | Promise<void>;
  onUndo?: () => void | Promise<void>;
}

interface ExecutePropertySaveBatchMutationInput {
  metadata: z.input<typeof PropertySaveHistoryMetadataSchema>;
  targets: Array<{
    target: z.infer<typeof PropertySaveTargetSchema>;
    updates: PropertySaveMutationUpdates;
    restoreUpdates: PropertySaveMutationUpdates;
  }>;
  breakpoint: string;
  onRedo?: () => void | Promise<void>;
  onUndo?: () => void | Promise<void>;
}

export function usePropertySaveHistory() {
  const { execute } = useHistory();

  async function executePropertySaveMutation(
    input: ExecutePropertySaveMutationInput,
  ): Promise<PropertySaveHistoryResult> {
    const parsedInput = PropertySaveExecutionSchema.safeParse({
      metadata: input.metadata,
      target: input.target,
      updates: input.updates,
      restoreUpdates: input.restoreUpdates,
      breakpoint: input.breakpoint,
    });

    if (!parsedInput.success) {
      return {
        success: false,
        error:
          parsedInput.error.issues[0]?.message ??
          "Invalid property save operation",
      };
    }

    const result = await execute({
      type: parsedInput.data.metadata.type as OperationType,
      timestamp: Date.now(),
      description: parsedInput.data.metadata.description,
      affectedNodeIds: parsedInput.data.metadata.affectedNodeIds,
      undo: async () => {
        await input.onUndo?.();
      },
      redo: async () => {
        await input.onRedo?.();
      },
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error?.message ?? "Failed to execute property save",
      };
    }

    return { success: true };
  }

  async function executePropertySaveBatchMutation(
    input: ExecutePropertySaveBatchMutationInput,
  ): Promise<PropertySaveHistoryResult> {
    const parsedInput = PropertySaveBatchExecutionSchema.safeParse({
      metadata: input.metadata,
      targets: input.targets,
      breakpoint: input.breakpoint,
    });

    if (!parsedInput.success) {
      return {
        success: false,
        error:
          parsedInput.error.issues[0]?.message ??
          "Invalid property save batch operation",
      };
    }

    const result = await execute({
      type: parsedInput.data.metadata.type as OperationType,
      timestamp: Date.now(),
      description: parsedInput.data.metadata.description,
      affectedNodeIds: parsedInput.data.metadata.affectedNodeIds,
      undo: async () => {
        await input.onUndo?.();
      },
      redo: async () => {
        await input.onRedo?.();
      },
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error?.message ?? "Failed to execute property save",
      };
    }

    return { success: true };
  }

  return {
    executePropertySaveMutation,
    executePropertySaveBatchMutation,
  };
}
