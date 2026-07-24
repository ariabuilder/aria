import { z } from "zod";
import type { $ZodIssue } from "zod/v4/core";

import {
  DropComponentPayloadSchema,
  ReorderNodePayloadSchema,
} from "../../Nodes/events/shared/nodeEventSchemas";
import { log } from "@/lib/utils/logger";
import { useSignals } from "../../../composables/useSignals";

const OPEN_ADD_ELEMENTS_SIGNAL = "aria:open-add-elements";
const REQUEST_COMPONENT_PICKER_SIGNAL = "aria:request-component-picker";
const AGENT_CANVAS_BUILD_SIGNAL = "aria:agent-canvas-build";

const OpenAddElementsSignalPayloadSchema = z.union([
  z.object({}).strict(),
  z.undefined(),
]);
const RequestComponentPickerSignalPayloadSchema = z
  .object({
    slotName: z.string().trim().min(1),
  })
  .strict();
export const AgentCanvasBuildSignalPayloadSchema = z.discriminatedUnion(
  "phase",
  [
    z
      .object({
        phase: z.literal("started"),
        runId: z.string().trim().min(1),
      })
      .strict(),
    z
      .object({
        phase: z.literal("section-inserted"),
        runId: z.string().trim().min(1),
        nodeIds: z.array(z.string().trim().min(1)).min(1),
        sequence: z.int().positive(),
      })
      .strict(),
    z
      .object({
        phase: z.literal("finished"),
        runId: z.string().trim().min(1),
        outcome: z.enum(["success", "stopped", "error"]),
      })
      .strict(),
  ],
);

export type DropComponentSignalPayload = z.infer<
  typeof DropComponentPayloadSchema
>;
export type ReorderNodeSignalPayload = z.infer<typeof ReorderNodePayloadSchema>;
export type AgentCanvasBuildSignalPayload = z.infer<
  typeof AgentCanvasBuildSignalPayloadSchema
>;

type ShellSignalEvent =
  | "aria:open-add-elements"
  | "aria:request-component-picker"
  | "aria:agent-canvas-build"
  | "drop-component"
  | "reorder-node";

function warnInvalidPayload(
  eventType: ShellSignalEvent,
  issues: $ZodIssue[],
): void {
  log("warn", `[useShellSignalBridge] Ignored invalid ${eventType} payload`, {
    issues,
  });
}

export function useShellSignalBridge() {
  const { broadcast, on } = useSignals();

  function broadcastOpenAddElements(): void {
    broadcast(OPEN_ADD_ELEMENTS_SIGNAL, {});
  }

  function broadcastRequestComponentPicker(slotName: string): void {
    const parsedPayload = RequestComponentPickerSignalPayloadSchema.safeParse({
      slotName,
    });
    if (!parsedPayload.success) {
      warnInvalidPayload(
        REQUEST_COMPONENT_PICKER_SIGNAL,
        parsedPayload.error.issues,
      );
      return;
    }

    broadcast(REQUEST_COMPONENT_PICKER_SIGNAL, parsedPayload.data);
  }

  function broadcastAgentCanvasBuild(
    payload: AgentCanvasBuildSignalPayload,
  ): void {
    const parsedPayload = AgentCanvasBuildSignalPayloadSchema.safeParse(payload);
    if (!parsedPayload.success) {
      warnInvalidPayload(
        AGENT_CANVAS_BUILD_SIGNAL,
        parsedPayload.error.issues,
      );
      return;
    }
    broadcast(AGENT_CANVAS_BUILD_SIGNAL, parsedPayload.data);
  }

  function onOpenAddElements(handler: () => void): (() => void) | void {
    return on(OPEN_ADD_ELEMENTS_SIGNAL, (payload: unknown) => {
      const parsed = OpenAddElementsSignalPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload(OPEN_ADD_ELEMENTS_SIGNAL, parsed.error.issues);
        return;
      }

      handler();
    });
  }

  function onRequestComponentPicker(
    handler: (slotName: string) => void,
  ): (() => void) | void {
    return on(REQUEST_COMPONENT_PICKER_SIGNAL, (payload: unknown) => {
      const parsedPayload =
        RequestComponentPickerSignalPayloadSchema.safeParse(payload);
      if (!parsedPayload.success) {
        warnInvalidPayload(
          REQUEST_COMPONENT_PICKER_SIGNAL,
          parsedPayload.error.issues,
        );
        return;
      }

      handler(parsedPayload.data.slotName);
    });
  }

  function onAgentCanvasBuild(
    handler: (payload: AgentCanvasBuildSignalPayload) => void,
  ): (() => void) | void {
    return on(AGENT_CANVAS_BUILD_SIGNAL, (payload: unknown) => {
      const parsedPayload = AgentCanvasBuildSignalPayloadSchema.safeParse(payload);
      if (!parsedPayload.success) {
        warnInvalidPayload(
          AGENT_CANVAS_BUILD_SIGNAL,
          parsedPayload.error.issues,
        );
        return;
      }
      handler(parsedPayload.data);
    });
  }

  function onDropComponent(
    handler: (payload: DropComponentSignalPayload) => void,
  ): (() => void) | void {
    return on("drop-component", (payload: unknown) => {
      const parsed = DropComponentPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("drop-component", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onReorderNode(
    handler: (payload: ReorderNodeSignalPayload) => void,
  ): (() => void) | void {
    return on("reorder-node", (payload: unknown) => {
      const parsed = ReorderNodePayloadSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("reorder-node", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  return {
    broadcastOpenAddElements,
    broadcastRequestComponentPicker,
    broadcastAgentCanvasBuild,
    onOpenAddElements,
    onRequestComponentPicker,
    onAgentCanvasBuild,
    onDropComponent,
    onReorderNode,
  };
}
