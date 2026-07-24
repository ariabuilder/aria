/**
 * Aria Motion editor — load, save, dirty, reset
 */

import { computed } from "vue";
import { usePropertySave } from "../../../Core";
import type { NodeMotion } from "../../../../../lib/motion/schemas/nodeMotion.schema";
import {
  DEFAULT_NODE_MOTION,
  NodeMotionSchema,
} from "../../../../../lib/motion/schemas/nodeMotion.schema";
import { applyPreset } from "../presets/catalog";
import type { MotionPresetId } from "../../../../../lib/motion/schemas/tokens.schema";
import { useMotionEditorState } from "./useMotionEditorState";
import { useMotionValidation } from "./useMotionValidation";

export function useMotionEditor(
  itemType?: "page" | "layout" | "component",
  itemSlug?: string,
) {
  const propertySave = usePropertySave();
  const { selectedNode } = propertySave;
  const { validateMotion } = useMotionValidation();
  const editorState = useMotionEditorState(selectedNode);

  const enabled = computed({
    get: () => editorState.draft.value.enabled,
    set: (value: boolean) => {
      if (value && !editorState.draft.value.enabled) {
        editorState.setDraft(
          applyPreset("fade-in", editorState.draft.value ?? DEFAULT_NODE_MOTION),
        );
        return;
      }

      editorState.setDraft({
        ...editorState.draft.value,
        enabled: value,
        effects: value ? editorState.draft.value.effects : [],
        preset: value ? editorState.draft.value.preset : undefined,
      });
    },
  });

  async function saveMotion(): Promise<boolean> {
    const validation = validateMotion(editorState.draft.value);
    if (!validation.success || !validation.data) {
      return false;
    }
    const motion = NodeMotionSchema.parse(validation.data);

    const success = await propertySave.saveNodeUpdates(
      { motion },
      itemType,
      itemSlug,
    );

    if (success) {
      editorState.commitDraft();
    }

    return success;
  }

  async function resetMotion(): Promise<boolean> {
    editorState.resetDraft();
    return saveMotion();
  }

  function applyMotionPreset(presetId: MotionPresetId) {
    editorState.setDraft(
      applyPreset(presetId, editorState.draft.value ?? DEFAULT_NODE_MOTION),
    );
  }

  function patchDraft(patch: Partial<NodeMotion>) {
    editorState.setDraft({
      ...editorState.draft.value,
      ...patch,
    });
  }

  function toggleEffect(effectId: NodeMotion["effects"][number]) {
    const current = new Set(editorState.draft.value.effects);
    if (current.has(effectId)) {
      current.delete(effectId);
    } else {
      current.add(effectId);
    }

    editorState.setDraft({
      ...editorState.draft.value,
      enabled: true,
      effects: Array.from(current),
      preset: undefined,
    });
  }

  return {
    draft: editorState.draft,
    persisted: editorState.persisted,
    enabled,
    isDirty: editorState.isDirty,
    saveMotion,
    resetMotion,
    applyMotionPreset,
    patchDraft,
    toggleEffect,
    resetDraft: editorState.resetDraft,
  };
}
