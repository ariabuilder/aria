import { z } from "zod";
import type { $ZodIssue } from "zod/v4/core";

import { useSignals } from "../../../composables/useSignals";
import {
  AuthoringModeSchema,
  BreakpointSchema,
  CSS_CLASS_NAME_REGEX,
  CSSRuleValueSchema,
} from "../../../../lib/schemas/classEditor";

const ClassEditorCollectionSchema = z.enum(["pages", "layouts", "components"]);

const EditingModeSchema = z.enum(["element", "class"]);

export const ClassEditorCssUpdatedSchema = z
  .object({
    css: z.string(),
    authoringMode: AuthoringModeSchema,
  })
  .strict();

export const ClassEditorActiveChangedSchema = z
  .object({
    className: z.string().min(1).nullable(),
    rules: z.array(CSSRuleValueSchema),
    breakpoint: BreakpointSchema,
  })
  .strict();

export const ClassEditorClassRenamedSchema = z
  .object({
    oldName: z
      .string()
      .min(1)
      .max(64)
      .regex(CSS_CLASS_NAME_REGEX, "Invalid CSS class name"),
    newName: z
      .string()
      .min(1)
      .max(64)
      .regex(CSS_CLASS_NAME_REGEX, "Invalid CSS class name"),
  })
  .strict();

export const ClassEditorModeChangedSchema = z
  .object({
    mode: EditingModeSchema,
    className: z.string().min(1).nullable(),
  })
  .strict();

export const ClassEditorAuthoringModeChangedSchema = z
  .object({
    mode: AuthoringModeSchema,
  })
  .strict();

export const ClassEditorNodeClassAddedSchema = z
  .object({
    collection: ClassEditorCollectionSchema,
    id: z.string().trim().min(1),
    nodeId: z.string().trim().min(1),
    className: z.string().trim().min(1),
    key: z.string().trim().min(1),
  })
  .strict();

export const ClassEditorNodeClassRemovedSchema = z
  .object({
    collection: ClassEditorCollectionSchema,
    id: z.string().trim().min(1),
    nodeId: z.string().trim().min(1),
    className: z.string().trim().min(1),
    breakpoint: BreakpointSchema,
  })
  .strict();

export const ClassEditorNodeCustomClassChangeSchema = z
  .object({
    collection: ClassEditorCollectionSchema,
    id: z.string().trim().min(1),
    nodeId: z.string().trim().min(1),
    className: z
      .string()
      .min(1)
      .max(64)
      .regex(CSS_CLASS_NAME_REGEX, "Invalid CSS class name"),
  })
  .strict();

export type ClassEditorCssUpdated = z.infer<typeof ClassEditorCssUpdatedSchema>;
export type ClassEditorActiveChanged = z.infer<
  typeof ClassEditorActiveChangedSchema
>;
export type ClassEditorClassRenamed = z.infer<
  typeof ClassEditorClassRenamedSchema
>;
export type ClassEditorModeChanged = z.infer<
  typeof ClassEditorModeChangedSchema
>;
export type ClassEditorAuthoringModeChanged = z.infer<
  typeof ClassEditorAuthoringModeChangedSchema
>;
export type ClassEditorNodeClassAdded = z.infer<
  typeof ClassEditorNodeClassAddedSchema
>;
export type ClassEditorNodeClassRemoved = z.infer<
  typeof ClassEditorNodeClassRemovedSchema
>;
export type ClassEditorNodeCustomClassChange = z.infer<
  typeof ClassEditorNodeCustomClassChangeSchema
>;

type ClassEditorSignalEvent =
  | "class-editor:css-updated"
  | "class-editor:active-changed"
  | "class-editor:class-renamed"
  | "class-editor:mode-changed"
  | "class-editor:authoring-mode-changed"
  | "class-editor:node-class-added"
  | "class-editor:node-class-removed"
  | "class-editor:node-custom-class-added"
  | "class-editor:node-custom-class-removed";

function warnInvalidPayload(
  eventType: ClassEditorSignalEvent,
  issues: $ZodIssue[],
): void {
  console.warn(`[useClassEditorSignals] Ignored invalid ${eventType} payload`, {
    issues,
  });
}

export function useClassEditorSignals() {
  const { broadcast } = useSignals();

  function broadcastCssUpdated(payload: ClassEditorCssUpdated): void {
    const parsed = ClassEditorCssUpdatedSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("class-editor:css-updated", parsed.error.issues);
      return;
    }

    broadcast("class-editor:css-updated", parsed.data);
  }

  function broadcastActiveChanged(payload: ClassEditorActiveChanged): void {
    const parsed = ClassEditorActiveChangedSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("class-editor:active-changed", parsed.error.issues);
      return;
    }

    broadcast("class-editor:active-changed", parsed.data);
  }

  function broadcastClassRenamed(payload: ClassEditorClassRenamed): void {
    const parsed = ClassEditorClassRenamedSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("class-editor:class-renamed", parsed.error.issues);
      return;
    }

    broadcast("class-editor:class-renamed", parsed.data);
  }

  function broadcastModeChanged(payload: ClassEditorModeChanged): void {
    const parsed = ClassEditorModeChangedSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("class-editor:mode-changed", parsed.error.issues);
      return;
    }

    broadcast("class-editor:mode-changed", parsed.data);
  }

  function broadcastAuthoringModeChanged(
    payload: ClassEditorAuthoringModeChanged,
  ): void {
    const parsed = ClassEditorAuthoringModeChangedSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload(
        "class-editor:authoring-mode-changed",
        parsed.error.issues,
      );
      return;
    }

    broadcast("class-editor:authoring-mode-changed", parsed.data);
  }

  function broadcastNodeClassAdded(payload: ClassEditorNodeClassAdded): void {
    const parsed = ClassEditorNodeClassAddedSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload("class-editor:node-class-added", parsed.error.issues);
      return;
    }

    broadcast("class-editor:node-class-added", parsed.data);
  }

  function broadcastNodeClassRemoved(
    payload: ClassEditorNodeClassRemoved,
  ): void {
    const parsed = ClassEditorNodeClassRemovedSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload(
        "class-editor:node-class-removed",
        parsed.error.issues,
      );
      return;
    }

    broadcast("class-editor:node-class-removed", parsed.data);
  }

  function broadcastNodeCustomClassAdded(
    payload: ClassEditorNodeCustomClassChange,
  ): void {
    const parsed = ClassEditorNodeCustomClassChangeSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload(
        "class-editor:node-custom-class-added",
        parsed.error.issues,
      );
      return;
    }

    broadcast("class-editor:node-custom-class-added", parsed.data);
  }

  function broadcastNodeCustomClassRemoved(
    payload: ClassEditorNodeCustomClassChange,
  ): void {
    const parsed = ClassEditorNodeCustomClassChangeSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPayload(
        "class-editor:node-custom-class-removed",
        parsed.error.issues,
      );
      return;
    }

    broadcast("class-editor:node-custom-class-removed", parsed.data);
  }

  return {
    broadcastCssUpdated,
    broadcastActiveChanged,
    broadcastClassRenamed,
    broadcastModeChanged,
    broadcastAuthoringModeChanged,
    broadcastNodeClassAdded,
    broadcastNodeClassRemoved,
    broadcastNodeCustomClassAdded,
    broadcastNodeCustomClassRemoved,
  };
}
