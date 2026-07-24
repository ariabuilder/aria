/**
 * Zod schemas for Studio ↔ Composer shell mode transitions.
 */

import { z } from "zod";
import { editorSlugsMatch } from "@/lib/editor/slugs";
import { EditableItemTypeSchema } from "../types/router";

export const STAGE_IDLE_KEY = "stage-idle" as const;

export const ShellTransitionDirectionSchema = z.enum([
  "to-composer",
  "to-studio",
]);

export type ShellTransitionDirection = z.infer<
  typeof ShellTransitionDirectionSchema
>;

const ActiveStageKeyPattern = /^stage-(page|layout|component)-(.+)$/;

export const ActiveStageKeySchema = z
  .string()
  .regex(ActiveStageKeyPattern, "Invalid active stage key");

export const StageKeySchema = z.union([
  z.literal(STAGE_IDLE_KEY),
  ActiveStageKeySchema,
]);

export type StageKey = z.infer<typeof StageKeySchema>;

export const ShellTransitionTargetSchema = z.object({
  itemType: EditableItemTypeSchema,
  itemSlug: z.string().trim().min(1),
});

export type ShellTransitionTarget = z.infer<typeof ShellTransitionTargetSchema>;

export const BeginShellTransitionInputSchema = z.object({
  direction: ShellTransitionDirectionSchema,
  pendingStageKey: ActiveStageKeySchema,
  generation: z.int().nonnegative(),
});

export type BeginShellTransitionInput = z.infer<
  typeof BeginShellTransitionInputSchema
>;

export const MarkStageReadyInputSchema = z.object({
  stageKey: ActiveStageKeySchema,
  generation: z.int().nonnegative(),
});

export type MarkStageReadyInput = z.infer<typeof MarkStageReadyInputSchema>;

export const ShellTransitionGateSnapshotSchema = z.object({
  isActive: z.boolean(),
  direction: ShellTransitionDirectionSchema.nullable(),
  pendingStageKey: StageKeySchema.nullable(),
  transitionGeneration: z.int().nonnegative(),
  stageReadyForKey: StageKeySchema.nullable(),
  stageReadyGeneration: z.int().nonnegative().nullable(),
  studioShellMounted: z.boolean(),
  studioPaintReady: z.boolean(),
  isLoading: z.boolean(),
  loadError: z.string().nullable(),
  isEditing: z.boolean(),
  showCanvas: z.boolean(),
  editingItemType: EditableItemTypeSchema.nullable(),
  editingItemSlug: z.string().nullable(),
  bootComplete: z.boolean(),
  minDisplayElapsed: z.boolean(),
  editorContentAligned: z.boolean(),
});

export type ShellTransitionGateSnapshot = z.infer<
  typeof ShellTransitionGateSnapshotSchema
>;

export function buildStageKeyFromTarget(target: ShellTransitionTarget): StageKey {
  const parsed = ShellTransitionTargetSchema.parse(target);
  return `stage-${parsed.itemType}-${parsed.itemSlug}`;
}

export function parseStageKeyToTarget(stageKey: string): ShellTransitionTarget | null {
  if (stageKey === STAGE_IDLE_KEY) {
    return null;
  }

  const keyParsed = ActiveStageKeySchema.safeParse(stageKey);
  if (!keyParsed.success) {
    return null;
  }

  const match = ActiveStageKeyPattern.exec(stageKey);
  if (!match) {
    return null;
  }

  const itemTypeParsed = EditableItemTypeSchema.safeParse(match[1]);
  const itemSlug = match[2];
  if (!itemTypeParsed.success || !itemSlug) {
    return null;
  }

  const targetParsed = ShellTransitionTargetSchema.safeParse({
    itemType: itemTypeParsed.data,
    itemSlug,
  });

  return targetParsed.success ? targetParsed.data : null;
}

export function editingModeMatchesStageKey(
  stageKey: StageKey,
  itemType: ShellTransitionTarget["itemType"] | null,
  itemSlug: string | null,
): boolean {
  const target = parseStageKeyToTarget(stageKey);
  if (!target || !itemType || !itemSlug) {
    return false;
  }
  return target.itemType === itemType && target.itemSlug === itemSlug;
}

export interface EditorContentAlignmentInput {
  editingItemType: ShellTransitionTarget["itemType"] | null;
  editingItemSlug: string | null;
  currentPageSlug: string | null;
  currentLayoutSlug: string | null;
  currentComponentSlug: string | null;
}

/**
 * True when loaded editor DSL matches the active editing target (slug-normalized).
 */
export function editorContentMatchesTarget(
  input: EditorContentAlignmentInput,
): boolean {
  const { editingItemType, editingItemSlug } = input;
  if (!editingItemType || !editingItemSlug) {
    return false;
  }

  if (editingItemType === "page") {
    return editorSlugsMatch(input.currentPageSlug, editingItemSlug);
  }

  if (editingItemType === "layout") {
    return editorSlugsMatch(input.currentLayoutSlug, editingItemSlug);
  }

  return editorSlugsMatch(input.currentComponentSlug, editingItemSlug);
}
