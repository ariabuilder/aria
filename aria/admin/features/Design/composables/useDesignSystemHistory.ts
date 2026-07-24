import { z } from "zod";

import { log } from "@/lib/utils/logger";
import { recordStateSnapshot, useHistory } from "../../History";
import type { OperationType } from "../../History";

const DesignSystemOperationTypeSchema = z.enum([
  "apply-palette-template",
  "add-palette",
  "remove-palette",
  "update-palette",
  "rename-palette",
  "update-semantic-color",
  "import-design-system",
]);

const DesignSystemHistoryMetadataSchema = z
  .object({
    type: DesignSystemOperationTypeSchema,
    description: z.string().trim().min(1),
  })
  .strict();

export interface UseDesignSystemHistoryOptions<
  TSnapshot extends Record<string, unknown>,
> {
  snapshotSchema: z.ZodType<TSnapshot>;
  captureSnapshot: () => TSnapshot;
  applySnapshot: (snapshot: TSnapshot) => void | Promise<void>;
  onSnapshotError?: (message: string) => void;
}

export function useDesignSystemHistory<
  TSnapshot extends Record<string, unknown>,
>(options: UseDesignSystemHistoryOptions<TSnapshot>) {
  const { canUndo, canRedo, undo, redo } = useHistory();

  async function recordDesignSystemChange<T>(
    type: z.input<typeof DesignSystemOperationTypeSchema>,
    description: string,
    action: () => T | Promise<T>,
  ): Promise<T> {
    const parsedMetadata = DesignSystemHistoryMetadataSchema.safeParse({
      type,
      description,
    });
    if (!parsedMetadata.success) {
      const message =
        parsedMetadata.error.issues[0]?.message ??
        "Invalid design system history metadata";
      options.onSnapshotError?.(message);
      throw new Error(message);
    }

    return await recordStateSnapshot({
      type: parsedMetadata.data.type as OperationType,
      description: parsedMetadata.data.description,
      captureState: () =>
        options.snapshotSchema.parse(options.captureSnapshot()),
      applySnapshot: async (snapshot) => {
        const parsedSnapshot = options.snapshotSchema.safeParse(snapshot);
        if (!parsedSnapshot.success) {
          const message = "Failed to restore design system history state";
          options.onSnapshotError?.(message);
          log("warn", "[useDesignSystemHistory] Invalid history snapshot", {
            issues: parsedSnapshot.error.issues,
          });
          return;
        }

        await options.applySnapshot(parsedSnapshot.data);
      },
      action: async () => await action(),
    });
  }

  return {
    canUndo,
    canRedo,
    undo,
    redo,
    recordDesignSystemChange,
  };
}
