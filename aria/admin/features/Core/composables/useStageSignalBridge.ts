import { z } from "zod";
import type { $ZodIssue } from "zod/v4/core";

import { BuilderNodeSchema } from "../../../../lib/schemas/nodes";
import { log } from "@/lib/utils/logger";
import { useSignals } from "../../../composables/useSignals";

export const StageNodeSelectedSignalPayloadSchema = z
  .object({
    nodeId: z.string().trim().min(1),
  })
  .strict();

export const StageDeleteBlockSignalPayloadSchema = z
  .object({
    nodeId: z.string().trim().min(1),
  })
  .strict();

export const StageAddBlockSignalPayloadSchema = z
  .object({
    block: BuilderNodeSchema,
    parentId: z.string().trim().min(1).nullable(),
  })
  .strict();

export const StageConvertComponentSignalPayloadSchema = z
  .string()
  .trim()
  .min(1);

export const StageUnoConfigChangedSignalPayloadSchema = z
  .object({
    configJSON: z.string().trim().min(1),
    timestamp: z.number(),
  })
  .strict();

export type StageNodeSelectedSignalPayload = z.infer<
  typeof StageNodeSelectedSignalPayloadSchema
>;
export type StageDeleteBlockSignalPayload = z.infer<
  typeof StageDeleteBlockSignalPayloadSchema
>;
export type StageAddBlockSignalPayload = z.infer<
  typeof StageAddBlockSignalPayloadSchema
>;
export type StageConvertComponentSignalPayload = z.infer<
  typeof StageConvertComponentSignalPayloadSchema
>;
export type StageUnoConfigChangedSignalPayload = z.infer<
  typeof StageUnoConfigChangedSignalPayloadSchema
>;

type StageSignalEvent =
  | "node-selected"
  | "delete-block"
  | "add-block"
  | "convert-component"
  | "uno-config-changed";

function warnInvalidPayload(
  eventType: StageSignalEvent,
  issues: $ZodIssue[],
): void {
  log("warn", `[useStageSignalBridge] Ignored invalid ${eventType} payload`, {
    issues,
  });
}

export function useStageSignalBridge() {
  const { signal, on } = useSignals();

  function signalAddBlock(payload: StageAddBlockSignalPayload): void {
    const parsed = StageAddBlockSignalPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("add-block", parsed.error.issues);
      return;
    }

    signal("add-block", parsed.data);
  }

  function signalConvertComponent(nodeId: string): void {
    const parsed = StageConvertComponentSignalPayloadSchema.safeParse(nodeId);
    if (!parsed.success) {
      warnInvalidPayload("convert-component", parsed.error.issues);
      return;
    }

    signal("convert-component", parsed.data);
  }

  function signalUnoConfigChanged(
    payload: StageUnoConfigChangedSignalPayload,
  ): void {
    const parsed = StageUnoConfigChangedSignalPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("uno-config-changed", parsed.error.issues);
      return;
    }

    signal("uno-config-changed", parsed.data);
  }

  function onNodeSelected(
    handler: (payload: StageNodeSelectedSignalPayload) => void,
  ): (() => void) | void {
    return on("node-selected", (payload: unknown) => {
      const parsed = StageNodeSelectedSignalPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("node-selected", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onDeleteBlock(
    handler: (payload: StageDeleteBlockSignalPayload) => void,
  ): (() => void) | void {
    return on("delete-block", (payload: unknown) => {
      const parsed = StageDeleteBlockSignalPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("delete-block", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onAddBlock(
    handler: (payload: StageAddBlockSignalPayload) => void,
  ): (() => void) | void {
    return on("add-block", (payload: unknown) => {
      const parsed = StageAddBlockSignalPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("add-block", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onConvertComponent(
    handler: (payload: StageConvertComponentSignalPayload) => void,
  ): (() => void) | void {
    return on("convert-component", (payload: unknown) => {
      const parsed =
        StageConvertComponentSignalPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("convert-component", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onUnoConfigChanged(
    handler: (payload: StageUnoConfigChangedSignalPayload) => void,
  ): (() => void) | void {
    return on("uno-config-changed", (payload: unknown) => {
      const parsed =
        StageUnoConfigChangedSignalPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("uno-config-changed", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  return {
    signalAddBlock,
    signalConvertComponent,
    signalUnoConfigChanged,
    onNodeSelected,
    onDeleteBlock,
    onAddBlock,
    onConvertComponent,
    onUnoConfigChanged,
  };
}
