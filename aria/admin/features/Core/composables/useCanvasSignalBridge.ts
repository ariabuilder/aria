import { z } from "zod";
import type { $ZodIssue } from "zod/v4/core";
import { JsonObjectSchema } from "../../../../lib/schemas/json";
import { NodeMotionSchema } from "../../../../lib/motion/schemas/nodeMotion.schema";

import { useSignals } from "../../../composables/useSignals";

const CanvasPropsSourceSchema = z.enum(["inspector-live", "stage-inline-live"]);

const CanvasA11yUpdateSchema = z
  .object({
    nodeId: z.string().trim().min(1),
    a11y: z
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
      .strict(),
  })
  .strict();

const CanvasMotionUpdateSchema = z
  .object({
    nodeId: z.string().trim().min(1),
    motion: NodeMotionSchema,
  })
  .strict();

export const CanvasPropsUpdateSchema = z
  .object({
    nodeId: z.string().trim().min(1),
    props: JsonObjectSchema,
    source: CanvasPropsSourceSchema.optional(),
  })
  .strict();

export const CanvasStyleUpdateSchema = z
  .object({
    nodeId: z.string().trim().min(1),
    styles: z.record(z.string(), z.record(z.string(), z.unknown())),
  })
  .strict();

export const CanvasClassUpdateSchema = z
  .object({
    nodeId: z.string().trim().min(1),
    classNames: z.record(z.string(), z.array(z.string())),
    customClasses: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export const CanvasSpacingPreviewSchema = z
  .object({
    nodeId: z.string().trim().min(1),
  })
  .strict();

export const ComponentWrapperResponseSchema = z
  .object({
    wrapperId: z.string().trim().min(1).nullable(),
  })
  .strict();

export type CanvasPropsUpdate = z.infer<typeof CanvasPropsUpdateSchema>;
export type CanvasStyleUpdate = z.infer<typeof CanvasStyleUpdateSchema>;
export type CanvasClassUpdate = z.infer<typeof CanvasClassUpdateSchema>;
export type CanvasSpacingPreview = z.infer<typeof CanvasSpacingPreviewSchema>;
export type CanvasA11yUpdate = z.infer<typeof CanvasA11yUpdateSchema>;
export type CanvasMotionUpdate = z.infer<typeof CanvasMotionUpdateSchema>;
export type ComponentWrapperResponse = z.infer<
  typeof ComponentWrapperResponseSchema
>;

type CanvasSignalEvent =
  | "update-a11y"
  | "update-motion"
  | "update-props"
  | "update-styles"
  | "update-classes"
  | "spacing-preview-start"
  | "spacing-preview-end"
  | "component-wrapper-response";

function warnInvalidPayload(
  eventType: CanvasSignalEvent,
  issues: $ZodIssue[],
): void {
  console.warn(`[useCanvasSignalBridge] Ignored invalid ${eventType} payload`, {
    issues,
  });
}

export function useCanvasSignalBridge() {
  const { signal, broadcast, on } = useSignals();

  function signalA11yUpdate(payload: CanvasA11yUpdate): void {
    const parsed = CanvasA11yUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("update-a11y", parsed.error.issues);
      return;
    }

    signal("update-a11y", parsed.data);
  }

  function signalMotionUpdate(payload: CanvasMotionUpdate): void {
    const parsed = CanvasMotionUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("update-motion", parsed.error.issues);
      return;
    }

    signal("update-motion", parsed.data);
  }

  function signalPropsUpdate(payload: CanvasPropsUpdate): void {
    const parsed = CanvasPropsUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("update-props", parsed.error.issues);
      return;
    }

    signal("update-props", parsed.data);
  }

  function broadcastPropsUpdate(payload: CanvasPropsUpdate): void {
    const parsed = CanvasPropsUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("update-props", parsed.error.issues);
      return;
    }

    broadcast("update-props", parsed.data);
  }

  function signalStyleUpdate(payload: CanvasStyleUpdate): void {
    const parsed = CanvasStyleUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("update-styles", parsed.error.issues);
      return;
    }

    signal("update-styles", parsed.data);
  }

  function broadcastClassUpdate(payload: CanvasClassUpdate): void {
    const parsed = CanvasClassUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("update-classes", parsed.error.issues);
      return;
    }

    broadcast("update-classes", parsed.data);
  }

  function signalSpacingPreviewStart(payload: CanvasSpacingPreview): void {
    const parsed = CanvasSpacingPreviewSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("spacing-preview-start", parsed.error.issues);
      return;
    }

    signal("spacing-preview-start", parsed.data);
  }

  function signalSpacingPreviewEnd(payload: CanvasSpacingPreview): void {
    const parsed = CanvasSpacingPreviewSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("spacing-preview-end", parsed.error.issues);
      return;
    }

    signal("spacing-preview-end", parsed.data);
  }

  function broadcastComponentWrapperResponse(
    payload: ComponentWrapperResponse,
  ): void {
    const parsed = ComponentWrapperResponseSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("component-wrapper-response", parsed.error.issues);
      return;
    }

    broadcast("component-wrapper-response", parsed.data);
  }

  function onPropsUpdate(
    handler: (payload: CanvasPropsUpdate) => void,
  ): (() => void) | void {
    return on("update-props", (payload: unknown) => {
      const parsed = CanvasPropsUpdateSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("update-props", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onA11yUpdate(
    handler: (payload: CanvasA11yUpdate) => void,
  ): (() => void) | void {
    return on("update-a11y", (payload: unknown) => {
      const parsed = CanvasA11yUpdateSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("update-a11y", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onMotionUpdate(
    handler: (payload: CanvasMotionUpdate) => void,
  ): (() => void) | void {
    return on("update-motion", (payload: unknown) => {
      const parsed = CanvasMotionUpdateSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("update-motion", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onStyleUpdate(
    handler: (payload: CanvasStyleUpdate) => void,
  ): (() => void) | void {
    return on("update-styles", (payload: unknown) => {
      const parsed = CanvasStyleUpdateSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("update-styles", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onClassUpdate(
    handler: (payload: CanvasClassUpdate) => void,
  ): (() => void) | void {
    return on("update-classes", (payload: unknown) => {
      const parsed = CanvasClassUpdateSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("update-classes", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onSpacingPreviewStart(
    handler: (payload: CanvasSpacingPreview) => void,
  ): (() => void) | void {
    return on("spacing-preview-start", (payload: unknown) => {
      const parsed = CanvasSpacingPreviewSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("spacing-preview-start", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onSpacingPreviewEnd(
    handler: (payload: CanvasSpacingPreview) => void,
  ): (() => void) | void {
    return on("spacing-preview-end", (payload: unknown) => {
      const parsed = CanvasSpacingPreviewSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("spacing-preview-end", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  function onComponentWrapperResponse(
    handler: (payload: ComponentWrapperResponse) => void,
  ): (() => void) | void {
    return on("component-wrapper-response", (payload: unknown) => {
      const parsed = ComponentWrapperResponseSchema.safeParse(payload);
      if (!parsed.success) {
        warnInvalidPayload("component-wrapper-response", parsed.error.issues);
        return;
      }

      handler(parsed.data);
    });
  }

  return {
    signalA11yUpdate,
    signalMotionUpdate,
    signalPropsUpdate,
    broadcastPropsUpdate,
    signalStyleUpdate,
    broadcastClassUpdate,
    signalSpacingPreviewStart,
    signalSpacingPreviewEnd,
    broadcastComponentWrapperResponse,
    onA11yUpdate,
    onMotionUpdate,
    onPropsUpdate,
    onStyleUpdate,
    onClassUpdate,
    onSpacingPreviewStart,
    onSpacingPreviewEnd,
    onComponentWrapperResponse,
  };
}
