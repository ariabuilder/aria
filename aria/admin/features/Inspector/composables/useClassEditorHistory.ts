import { actions } from "astro:actions";
import { z } from "zod";

import { log } from "@/lib/utils/logger";
import { recordStateSnapshot, useHistory } from "../../History";
import type { OperationType } from "../../History";
import type {
  AuthoringMode,
  CreateClassInput,
  CustomClass,
  DeleteClassInput,
  DeleteClassesInput,
  DuplicateClassInput,
  ReplaceClassStylesInput,
  RenameClassInput,
} from "../../../../lib/schemas/classEditor";
import {
  AuthoringModeSchema,
  BreakpointSchema,
  BreakpointVariantSchema,
  CreateClassInputSchema,
  CSS_CLASS_NAME_REGEX,
  CSSRuleValueSchema,
  CustomClassSchema,
  DeleteClassInputSchema,
  DeleteClassesInputSchema,
  DuplicateClassInputSchema,
  PseudoVariantSchema,
  RenameClassInputSchema,
} from "../../../../lib/schemas/classEditor";
import { InspectorPseudoStateSchema } from "../../../../lib/styles/pseudoSelectors";

const NonEmptyStringSchema = z.string().trim().min(1);

const ReplaceClassStylesInputSchema = z
  .object({
    targetName: NonEmptyStringSchema,
    sourceName: NonEmptyStringSchema.optional(),
    variants: z.array(BreakpointVariantSchema).optional(),
    pseudoVariants: z.array(PseudoVariantSchema).optional(),
  })
  .refine(
    (value) =>
      Boolean(value.sourceName) ||
      (Array.isArray(value.variants) && Array.isArray(value.pseudoVariants)),
    "Provide sourceName or replacement style rules",
  );

const ReplaceClassVariantRulesInputSchema = z.object({
  className: NonEmptyStringSchema,
  breakpoint: BreakpointSchema,
  pseudoState: InspectorPseudoStateSchema.default("default"),
  rules: z.array(CSSRuleValueSchema),
});
type ReplaceClassVariantRulesInput = z.infer<
  typeof ReplaceClassVariantRulesInputSchema
>;

const ClassEditorActionErrorSchema = z.looseObject({
  message: NonEmptyStringSchema.optional(),
});

const ClassEditorActionFailureSchema = z.looseObject({
  success: z.literal(false),
  error: ClassEditorActionErrorSchema.optional(),
});

const ClassEditorClassActionSuccessSchema = z.looseObject({
  success: z.literal(true),
  data: z.looseObject({
    class: CustomClassSchema,
    css: z.string().optional(),
  }),
});

const ClassEditorDeleteActionSuccessSchema = z.looseObject({
  success: z.literal(true),
  data: z
    .looseObject({
      css: z.string().optional(),
    })
    .optional(),
});

const ClassEditorAuthoringModeActionSuccessSchema = z.looseObject({
  success: z.literal(true),
  data: z.looseObject({
    mode: AuthoringModeSchema,
  }),
});

const ClassEditorDeleteClassesActionSuccessSchema = z.looseObject({
  success: z.literal(true),
  data: z
    .looseObject({
      css: z.string(),
      deleted: z.array(z.string()),
      notFound: z.array(z.string()),
    })
    .optional(),
});

const NodeCustomClassActionSuccessSchema = z.looseObject({
  version: NonEmptyStringSchema,
});

const ClassEditorHistoryOperationTypeSchema = z.enum([
  "create-custom-class",
  "delete-custom-class",
  "delete-custom-classes",
  "rename-custom-class",
  "duplicate-custom-class",
  "replace-class-styles",
  "replace-class-variant-rules",
  "set-authoring-mode",
  "add-custom-class",
  "remove-custom-class",
]);

const ClassEditorHistoryMetadataSchema = z
  .object({
    type: ClassEditorHistoryOperationTypeSchema,
    description: z.string().trim().min(1),
    affectedNodeIds: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

const NodeCustomClassInputSchema = z
  .object({
    collection: z.enum(["pages", "layouts", "components"]),
    id: z.string().trim().min(1),
    nodeId: z.string().trim().min(1),
    className: z
      .string()
      .min(1)
      .max(64)
      .regex(CSS_CLASS_NAME_REGEX, "Invalid CSS class name"),
  })
  .strict();

const AuthoringModeTransitionSchema = z
  .object({
    previousMode: AuthoringModeSchema,
    nextMode: AuthoringModeSchema,
  })
  .strict();

type NodeCustomClassInput = z.infer<typeof NodeCustomClassInputSchema>;

interface ClassEditorHistoryResult {
  success: boolean;
  error?: string;
}

interface ClassEditorHistoryCallbacks {
  redo: () => Promise<void>;
  undo: () => Promise<void>;
}

interface RenameClassCallbacks {
  onRedo: (result: {
    previousName: string;
    nextName: string;
    updatedClass: CustomClass;
    css: string;
  }) => void;
  onUndo: (result: {
    previousName: string;
    nextName: string;
    updatedClass: CustomClass;
    css: string;
  }) => void;
}

interface DuplicateClassCallbacks {
  onRedo: (result: {
    className: string;
    duplicatedClass: CustomClass;
    css: string;
  }) => void;
  onUndo: (result: { className: string; css: string }) => void;
}

interface ReplaceClassStylesCallbacks {
  onRedo: (result: {
    targetName: string;
    updatedClass: CustomClass;
    css: string;
  }) => void;
  onUndo: (result: {
    targetName: string;
    updatedClass: CustomClass;
    css: string;
  }) => void;
}

interface AuthoringModeCallbacks {
  onRedo: (mode: AuthoringMode) => void;
  onUndo: (mode: AuthoringMode) => void;
}

interface SnapshotHistoryOptions<TSnapshot extends Record<string, unknown>> {
  snapshotSchema: z.ZodType<TSnapshot>;
  captureSnapshot: () => TSnapshot;
  applySnapshot: (snapshot: TSnapshot) => void | Promise<void>;
  onSnapshotError?: (message: string) => void;
}

interface CreateClassCallbacks<
  TSnapshot extends Record<string, unknown>,
> extends SnapshotHistoryOptions<TSnapshot> {
  onApplied: (result: {
    className: string;
    createdClass: CustomClass;
    css: string;
  }) => void;
}

interface DeleteClassCallbacks<
  TSnapshot extends Record<string, unknown>,
> extends SnapshotHistoryOptions<TSnapshot> {
  onApplied: (result: { className: string; css: string }) => void;
}

interface DeleteClassesCallbacks<
  TSnapshot extends Record<string, unknown>,
> extends SnapshotHistoryOptions<TSnapshot> {
  onApplied: (result: { names: string[]; css: string }) => void;
}

interface NodeCustomClassCallbacks {
  onRedo: (payload: NodeCustomClassInput) => void;
  onUndo: (payload: NodeCustomClassInput) => void;
}

interface ActionTransportErrorLike {
  message?: string;
}

interface ActionTransportResult {
  data?: unknown;
  error?: ActionTransportErrorLike | null;
}

function createFailureResult(error: string): ClassEditorHistoryResult {
  return { success: false, error };
}

function getActionErrorMessage(
  error: z.infer<typeof ClassEditorActionErrorSchema> | undefined,
  fallback: string,
): string {
  return error?.message ?? fallback;
}

function getUnknownErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function validateSnapshotApply<TSnapshot extends Record<string, unknown>>(
  callbacks: SnapshotHistoryOptions<TSnapshot>,
  snapshot: Record<string, unknown>,
): TSnapshot | null {
  const parsedSnapshot = callbacks.snapshotSchema.safeParse(snapshot);
  if (!parsedSnapshot.success) {
    const message =
      parsedSnapshot.error.issues[0]?.message ??
      "Failed to restore class editor history state";
    callbacks.onSnapshotError?.(message);
    log("warn", "[useClassEditorHistory] Invalid class-editor snapshot", {
      issues: parsedSnapshot.error.issues,
    });
    return null;
  }

  return parsedSnapshot.data;
}

function unwrapClassEditorStyleActionResult<
  TSuccessSchema extends z.ZodTypeAny,
>(
  result: ActionTransportResult,
  successSchema: TSuccessSchema,
  fallback: string,
  context: Record<string, unknown>,
):
  | { success: true; data: z.infer<TSuccessSchema> }
  | { success: false; error: string } {
  if (result.error) {
    return {
      success: false,
      error: result.error.message ?? fallback,
    };
  }

  const parsedResult = z
    .union([successSchema, ClassEditorActionFailureSchema])
    .safeParse(result.data);
  if (!parsedResult.success) {
    log("warn", "[useClassEditorHistory] Invalid style action response", {
      issues: parsedResult.error.issues,
      ...context,
    });
    return {
      success: false,
      error: fallback,
    };
  }

  const data = parsedResult.data;
  const failureParsed = ClassEditorActionFailureSchema.safeParse(data);
  if (failureParsed.success) {
    return {
      success: false,
      error: getActionErrorMessage(failureParsed.data.error, fallback),
    };
  }

  const successParsed = successSchema.safeParse(data);
  if (!successParsed.success) {
    log("warn", "[useClassEditorHistory] Invalid style action response", {
      issues: successParsed.error.issues,
      ...context,
    });
    return {
      success: false,
      error: fallback,
    };
  }

  return {
    success: true,
    data: successParsed.data,
  };
}

function unwrapNodeCustomClassActionResult(
  result: ActionTransportResult,
  fallback: string,
  context: Record<string, unknown>,
): { success: true; version: string } | { success: false; error: string } {
  if (result.error) {
    return {
      success: false,
      error: result.error.message ?? fallback,
    };
  }

  const parsedResult = NodeCustomClassActionSuccessSchema.safeParse(
    result.data,
  );
  if (!parsedResult.success) {
    log("warn", "[useClassEditorHistory] Invalid node class action response", {
      issues: parsedResult.error.issues,
      ...context,
    });
    return {
      success: false,
      error: fallback,
    };
  }

  return {
    success: true,
    version: parsedResult.data.version,
  };
}

export function useClassEditorHistory() {
  const { execute } = useHistory();

  async function recordCreateClass<TSnapshot extends Record<string, unknown>>(
    payload: CreateClassInput,
    callbacks: CreateClassCallbacks<TSnapshot>,
  ): Promise<ClassEditorHistoryResult> {
    const parsedPayload = CreateClassInputSchema.safeParse(payload);
    if (!parsedPayload.success) {
      return createFailureResult(
        parsedPayload.error.issues[0]?.message ?? "Invalid create input",
      );
    }

    try {
      await recordStateSnapshot({
        type: "create-custom-class",
        description: `Create class: ${parsedPayload.data.name}`,
        captureState: () =>
          callbacks.snapshotSchema.parse(callbacks.captureSnapshot()),
        action: async () => {
          const result = unwrapClassEditorStyleActionResult(
            await actions.styles.createClass(parsedPayload.data),
            ClassEditorClassActionSuccessSchema,
            "Failed to create class",
            {
              name: parsedPayload.data.name,
              source: "useClassEditorHistory.recordCreateClass",
            },
          );
          if (!result.success) {
            throw new Error(result.error);
          }

          callbacks.onApplied({
            className: parsedPayload.data.name,
            createdClass: result.data.data.class,
            css: result.data.data.css ?? "",
          });

          return true;
        },
        applySnapshot: async (snapshot) => {
          const parsedSnapshot = validateSnapshotApply(callbacks, snapshot);
          if (!parsedSnapshot) {
            return;
          }

          await callbacks.applySnapshot(parsedSnapshot);
        },
      });

      return { success: true };
    } catch (error) {
      return createFailureResult(
        getUnknownErrorMessage(error, "Failed to create class"),
      );
    }
  }

  async function recordDeleteClass<TSnapshot extends Record<string, unknown>>(
    payload: DeleteClassInput,
    callbacks: DeleteClassCallbacks<TSnapshot>,
  ): Promise<ClassEditorHistoryResult> {
    const parsedPayload = DeleteClassInputSchema.safeParse(payload);
    if (!parsedPayload.success) {
      return createFailureResult(
        parsedPayload.error.issues[0]?.message ?? "Invalid delete input",
      );
    }

    try {
      await recordStateSnapshot({
        type: "delete-custom-class",
        description: `Delete class: ${parsedPayload.data.name}`,
        captureState: () =>
          callbacks.snapshotSchema.parse(callbacks.captureSnapshot()),
        action: async () => {
          const result = unwrapClassEditorStyleActionResult(
            await actions.styles.deleteClass(parsedPayload.data),
            ClassEditorDeleteActionSuccessSchema,
            "Failed to delete class",
            {
              name: parsedPayload.data.name,
              source: "useClassEditorHistory.recordDeleteClass",
            },
          );
          if (!result.success) {
            throw new Error(result.error);
          }

          callbacks.onApplied({
            className: parsedPayload.data.name,
            css: result.data.data?.css ?? "",
          });

          return true;
        },
        applySnapshot: async (snapshot) => {
          const parsedSnapshot = validateSnapshotApply(callbacks, snapshot);
          if (!parsedSnapshot) {
            return;
          }

          await callbacks.applySnapshot(parsedSnapshot);
        },
      });

      return { success: true };
    } catch (error) {
      return createFailureResult(
        getUnknownErrorMessage(error, "Failed to delete class"),
      );
    }
  }

  async function recordDeleteClasses<TSnapshot extends Record<string, unknown>>(
    payload: DeleteClassesInput,
    callbacks: DeleteClassesCallbacks<TSnapshot>,
  ): Promise<ClassEditorHistoryResult> {
    const parsedPayload = DeleteClassesInputSchema.safeParse(payload);
    if (!parsedPayload.success) {
      return createFailureResult(
        parsedPayload.error.issues[0]?.message ??
          "Invalid delete classes input",
      );
    }

    const { names } = parsedPayload.data;

    try {
      await recordStateSnapshot({
        type: "delete-custom-classes",
        description: `Delete ${names.length} class${names.length === 1 ? "" : "es"}: ${names.join(", ")}`,
        captureState: () =>
          callbacks.snapshotSchema.parse(callbacks.captureSnapshot()),
        action: async () => {
          const result = unwrapClassEditorStyleActionResult(
            await actions.styles.deleteClasses(parsedPayload.data),
            ClassEditorDeleteClassesActionSuccessSchema,
            "Failed to delete classes",
            {
              names,
              source: "useClassEditorHistory.recordDeleteClasses",
            },
          );
          if (!result.success) {
            throw new Error(result.error);
          }

          callbacks.onApplied({
            names: result.data.data?.deleted ?? names,
            css: result.data.data?.css ?? "",
          });

          return true;
        },
        applySnapshot: async (snapshot) => {
          const parsedSnapshot = validateSnapshotApply(callbacks, snapshot);
          if (!parsedSnapshot) {
            return;
          }

          await callbacks.applySnapshot(parsedSnapshot);
        },
      });

      return { success: true };
    } catch (error) {
      return createFailureResult(
        getUnknownErrorMessage(error, "Failed to delete classes"),
      );
    }
  }

  async function executeClassEditorOperation(
    metadata: z.input<typeof ClassEditorHistoryMetadataSchema>,
    callbacks: ClassEditorHistoryCallbacks,
  ): Promise<ClassEditorHistoryResult> {
    const parsedMetadata = ClassEditorHistoryMetadataSchema.safeParse(metadata);
    if (!parsedMetadata.success) {
      const message =
        parsedMetadata.error.issues[0]?.message ??
        "Invalid class editor history metadata";
      log("warn", "[useClassEditorHistory] Invalid metadata", {
        issues: parsedMetadata.error.issues,
      });
      return createFailureResult(message);
    }

    const result = await execute({
      type: parsedMetadata.data.type as OperationType,
      timestamp: Date.now(),
      description: parsedMetadata.data.description,
      affectedNodeIds: parsedMetadata.data.affectedNodeIds,
      redo: callbacks.redo,
      undo: callbacks.undo,
    });

    if (!result.success) {
      return createFailureResult(
        result.error?.message ??
          `Failed to execute ${parsedMetadata.data.type} operation`,
      );
    }

    return { success: true };
  }

  async function recordRenameClass(
    payload: RenameClassInput,
    callbacks: RenameClassCallbacks,
  ): Promise<ClassEditorHistoryResult> {
    const parsedPayload = RenameClassInputSchema.safeParse(payload);
    if (!parsedPayload.success) {
      return createFailureResult(
        parsedPayload.error.issues[0]?.message ?? "Invalid rename input",
      );
    }

    const forwardPayload = parsedPayload.data;
    const reversePayload: RenameClassInput = {
      oldName: forwardPayload.newName,
      newName: forwardPayload.oldName,
    };

    return await executeClassEditorOperation(
      {
        type: "rename-custom-class",
        description: `Rename class ${forwardPayload.oldName} → ${forwardPayload.newName}`,
      },
      {
        redo: async () => {
          const result = unwrapClassEditorStyleActionResult(
            await actions.styles.renameClass(forwardPayload),
            ClassEditorClassActionSuccessSchema,
            "Failed to rename class",
            {
              oldName: forwardPayload.oldName,
              newName: forwardPayload.newName,
              source: "useClassEditorHistory.recordRenameClass.redo",
            },
          );
          if (!result.success) {
            throw new Error(result.error);
          }

          callbacks.onRedo({
            previousName: forwardPayload.oldName,
            nextName: forwardPayload.newName,
            updatedClass: result.data.data.class,
            css: result.data.data.css ?? "",
          });
        },
        undo: async () => {
          const result = unwrapClassEditorStyleActionResult(
            await actions.styles.renameClass(reversePayload),
            ClassEditorClassActionSuccessSchema,
            "Failed to undo class rename",
            {
              oldName: reversePayload.oldName,
              newName: reversePayload.newName,
              source: "useClassEditorHistory.recordRenameClass.undo",
            },
          );
          if (!result.success) {
            throw new Error(result.error);
          }

          callbacks.onUndo({
            previousName: reversePayload.oldName,
            nextName: reversePayload.newName,
            updatedClass: result.data.data.class,
            css: result.data.data.css ?? "",
          });
        },
      },
    );
  }

  async function recordDuplicateClass(
    payload: DuplicateClassInput,
    callbacks: DuplicateClassCallbacks,
  ): Promise<ClassEditorHistoryResult> {
    const parsedPayload = DuplicateClassInputSchema.safeParse(payload);
    if (!parsedPayload.success) {
      return createFailureResult(
        parsedPayload.error.issues[0]?.message ?? "Invalid duplicate input",
      );
    }

    return await executeClassEditorOperation(
      {
        type: "duplicate-custom-class",
        description: `Duplicate class ${parsedPayload.data.sourceName} → ${parsedPayload.data.newName}`,
      },
      {
        redo: async () => {
          const result = unwrapClassEditorStyleActionResult(
            await actions.styles.duplicateClass(parsedPayload.data),
            ClassEditorClassActionSuccessSchema,
            "Failed to duplicate class",
            {
              sourceName: parsedPayload.data.sourceName,
              newName: parsedPayload.data.newName,
              source: "useClassEditorHistory.recordDuplicateClass.redo",
            },
          );
          if (!result.success) {
            throw new Error(result.error);
          }

          callbacks.onRedo({
            className: parsedPayload.data.newName,
            duplicatedClass: result.data.data.class,
            css: result.data.data.css ?? "",
          });
        },
        undo: async () => {
          const deletePayload: DeleteClassInput = {
            name: parsedPayload.data.newName,
          };
          const result = unwrapClassEditorStyleActionResult(
            await actions.styles.deleteClass(deletePayload),
            ClassEditorDeleteActionSuccessSchema,
            "Failed to undo class duplicate",
            {
              name: deletePayload.name,
              source: "useClassEditorHistory.recordDuplicateClass.undo",
            },
          );
          if (!result.success) {
            throw new Error(result.error);
          }

          callbacks.onUndo({
            className: parsedPayload.data.newName,
            css: result.data.data?.css ?? "",
          });
        },
      },
    );
  }

  async function recordReplaceClassStyles(
    payload: ReplaceClassStylesInput,
    previousTargetClass: CustomClass,
    callbacks: ReplaceClassStylesCallbacks,
  ): Promise<ClassEditorHistoryResult> {
    const parsedPayload = ReplaceClassStylesInputSchema.safeParse(payload);
    if (!parsedPayload.success) {
      return createFailureResult(
        parsedPayload.error.issues[0]?.message ??
          "Invalid replace class styles input",
      );
    }

    const targetName = parsedPayload.data.targetName;
    const undoPayload: ReplaceClassStylesInput = {
      targetName,
      variants: previousTargetClass.variants,
      pseudoVariants: previousTargetClass.pseudoVariants,
    };

    return await executeClassEditorOperation(
      {
        type: "replace-class-styles",
        description: parsedPayload.data.sourceName
          ? `Copy class styles ${parsedPayload.data.sourceName} → ${targetName}`
          : `Restore class styles ${targetName}`,
      },
      {
        redo: async () => {
          const result = unwrapClassEditorStyleActionResult(
            await actions.styles.replaceClassStyles(parsedPayload.data),
            ClassEditorClassActionSuccessSchema,
            "Failed to replace class styles",
            {
              targetName,
              sourceName: parsedPayload.data.sourceName,
              source: "useClassEditorHistory.recordReplaceClassStyles.redo",
            },
          );
          if (!result.success) {
            throw new Error(result.error);
          }

          callbacks.onRedo({
            targetName,
            updatedClass: result.data.data.class,
            css: result.data.data.css ?? "",
          });
        },
        undo: async () => {
          const result = unwrapClassEditorStyleActionResult(
            await actions.styles.replaceClassStyles(undoPayload),
            ClassEditorClassActionSuccessSchema,
            "Failed to restore class styles",
            {
              targetName,
              source: "useClassEditorHistory.recordReplaceClassStyles.undo",
            },
          );
          if (!result.success) {
            throw new Error(result.error);
          }

          callbacks.onUndo({
            targetName,
            updatedClass: result.data.data.class,
            css: result.data.data.css ?? "",
          });
        },
      },
    );
  }

  async function recordAuthoringModeChange(
    input: z.input<typeof AuthoringModeTransitionSchema>,
    callbacks: AuthoringModeCallbacks,
  ): Promise<ClassEditorHistoryResult> {
    const parsedInput = AuthoringModeTransitionSchema.safeParse(input);
    if (!parsedInput.success) {
      return createFailureResult(
        parsedInput.error.issues[0]?.message ??
          "Invalid authoring mode transition",
      );
    }

    return await executeClassEditorOperation(
      {
        type: "set-authoring-mode",
        description: `Set authoring mode: ${parsedInput.data.nextMode}`,
      },
      {
        redo: async () => {
          const result = unwrapClassEditorStyleActionResult(
            await actions.styles.setAuthoringMode({
              mode: parsedInput.data.nextMode,
            }),
            ClassEditorAuthoringModeActionSuccessSchema,
            "Failed to set authoring mode",
            {
              mode: parsedInput.data.nextMode,
              source: "useClassEditorHistory.recordAuthoringModeChange.redo",
            },
          );
          if (!result.success) {
            throw new Error(result.error);
          }

          callbacks.onRedo(result.data.data.mode);
        },
        undo: async () => {
          const result = unwrapClassEditorStyleActionResult(
            await actions.styles.setAuthoringMode({
              mode: parsedInput.data.previousMode,
            }),
            ClassEditorAuthoringModeActionSuccessSchema,
            "Failed to restore authoring mode",
            {
              mode: parsedInput.data.previousMode,
              source: "useClassEditorHistory.recordAuthoringModeChange.undo",
            },
          );
          if (!result.success) {
            throw new Error(result.error);
          }

          callbacks.onUndo(result.data.data.mode);
        },
      },
    );
  }

  async function recordNodeCustomClassChange(
    operation: "add-custom-class" | "remove-custom-class",
    payload: NodeCustomClassInput,
    callbacks: NodeCustomClassCallbacks,
  ): Promise<ClassEditorHistoryResult> {
    const parsedPayload = NodeCustomClassInputSchema.safeParse(payload);
    if (!parsedPayload.success) {
      return createFailureResult(
        parsedPayload.error.issues[0]?.message ??
          "Invalid node custom class input",
      );
    }

    const redoAction =
      operation === "add-custom-class"
        ? actions.nodes.addCustomClass
        : actions.nodes.removeCustomClass;
    const undoAction =
      operation === "add-custom-class"
        ? actions.nodes.removeCustomClass
        : actions.nodes.addCustomClass;

    return await executeClassEditorOperation(
      {
        type: operation,
        description: `${operation === "add-custom-class" ? "Add" : "Remove"} custom class: ${parsedPayload.data.className}`,
        affectedNodeIds: [parsedPayload.data.nodeId],
      },
      {
        redo: async () => {
          const result = unwrapNodeCustomClassActionResult(
            await redoAction(parsedPayload.data),
            `Failed to ${operation === "add-custom-class" ? "add" : "remove"} custom class`,
            {
              operation,
              payload: parsedPayload.data,
              source: "useClassEditorHistory.recordNodeCustomClassChange.redo",
            },
          );
          if (!result.success) {
            throw new Error(result.error);
          }

          callbacks.onRedo(parsedPayload.data);
        },
        undo: async () => {
          const result = unwrapNodeCustomClassActionResult(
            await undoAction(parsedPayload.data),
            `Failed to ${operation === "add-custom-class" ? "remove" : "add"} custom class`,
            {
              operation,
              payload: parsedPayload.data,
              source: "useClassEditorHistory.recordNodeCustomClassChange.undo",
            },
          );
          if (!result.success) {
            throw new Error(result.error);
          }

          callbacks.onUndo(parsedPayload.data);
        },
      },
    );
  }

  async function recordReplaceClassVariantRules(
    payload: ReplaceClassVariantRulesInput,
    previousClass: CustomClass,
    callbacks: ReplaceClassStylesCallbacks,
  ): Promise<ClassEditorHistoryResult> {
    const parsedPayload =
      ReplaceClassVariantRulesInputSchema.safeParse(payload);
    if (!parsedPayload.success) {
      return createFailureResult(
        parsedPayload.error.issues[0]?.message ??
          "Invalid replace class variant rules input",
      );
    }

    const { className, breakpoint, pseudoState } = parsedPayload.data;
    const undoPayload: ReplaceClassVariantRulesInput = {
      className,
      breakpoint,
      pseudoState,
      rules:
        pseudoState === "default"
          ? (previousClass.variants.find(
              (variant) => variant.breakpoint === breakpoint,
            )?.rules ?? [])
          : (previousClass.pseudoVariants.find(
              (variant) =>
                variant.state === pseudoState &&
                variant.breakpoint === breakpoint,
            )?.rules ?? []),
    };

    return await executeClassEditorOperation(
      {
        type: "replace-class-variant-rules",
        description: `Update ${className} variant CSS`,
      },
      {
        redo: async () => {
          const result = unwrapClassEditorStyleActionResult(
            await actions.styles.replaceClassVariantRules(parsedPayload.data),
            ClassEditorClassActionSuccessSchema,
            "Failed to replace class variant rules",
            {
              className,
              breakpoint,
              pseudoState,
              source:
                "useClassEditorHistory.recordReplaceClassVariantRules.redo",
            },
          );
          if (!result.success) {
            throw new Error(result.error);
          }

          callbacks.onRedo({
            targetName: className,
            updatedClass: result.data.data.class,
            css: result.data.data.css ?? "",
          });
        },
        undo: async () => {
          const result = unwrapClassEditorStyleActionResult(
            await actions.styles.replaceClassVariantRules(undoPayload),
            ClassEditorClassActionSuccessSchema,
            "Failed to restore class variant rules",
            {
              className,
              breakpoint,
              pseudoState,
              source:
                "useClassEditorHistory.recordReplaceClassVariantRules.undo",
            },
          );
          if (!result.success) {
            throw new Error(result.error);
          }

          callbacks.onUndo({
            targetName: className,
            updatedClass: result.data.data.class,
            css: result.data.data.css ?? "",
          });
        },
      },
    );
  }

  return {
    recordCreateClass,
    recordDeleteClass,
    recordDeleteClasses,
    executeClassEditorOperation,
    recordRenameClass,
    recordDuplicateClass,
    recordReplaceClassStyles,
    recordReplaceClassVariantRules,
    recordAuthoringModeChange,
    recordNodeCustomClassChange,
  };
}
