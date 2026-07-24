/**
 * Aria Parallax editor — load, save, dirty, reset Uses a local reactive
 * draft synced with selectedNode via watcher, matching the pattern established by useMotionEditorState.
 */

import { computed, ref, watch, type Ref } from "vue";
import { usePropertySave } from "../../../Core";
import type { BuilderNode } from "../../../../../lib/types/nodes";
import type { NodeMotion } from "../../../../../lib/motion/schemas/nodeMotion.schema";
import type { NodeParallax } from "../../../../../lib/motion/schemas/nodeParallax.schema";
import {
  DEFAULT_NODE_PARALLAX,
  NodeParallaxSchema,
} from "../../../../../lib/motion/schemas/nodeParallax.schema";
import { DEFAULT_NODE_MOTION } from "../../../../../lib/motion/schemas/nodeMotion.schema";
import { PARALLAX_PRESETS } from "../../../../../lib/motion/parallaxPresets";

function readNodeParallax(node: BuilderNode | null | undefined): NodeParallax {
  const raw = node?.motion?.parallax;
  if (!raw) return DEFAULT_NODE_PARALLAX;
  const parsed = NodeParallaxSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_NODE_PARALLAX;
}

export function useMotionParallaxEditor(
  itemType?: "page" | "layout" | "component",
  itemSlug?: string,
  entranceDraft?: Ref<NodeMotion | undefined>,
) {
  const propertySave = usePropertySave();
  const { selectedNode } = propertySave;

  const draft = ref<NodeParallax>(DEFAULT_NODE_PARALLAX);

  watch(
    selectedNode,
    (node) => {
      draft.value = NodeParallaxSchema.parse(readNodeParallax(node));
    },
    { immediate: true },
  );

  const enabled = computed({
    get: () => draft.value.enabled,
    set: async (value: boolean) => {
      draft.value = NodeParallaxSchema.parse({
        ...draft.value,
        enabled: value,
      });
      await saveParallax(draft.value);
    },
  });

  async function saveParallax(parallax: NodeParallax): Promise<boolean> {
    const existingMotion =
      entranceDraft?.value ?? selectedNode.value?.motion ?? DEFAULT_NODE_MOTION;
    const success = await propertySave.saveNodeUpdates(
      {
        motion: {
          ...existingMotion,
          parallax,
        },
      },
      itemType,
      itemSlug,
    );

    return success;
  }

  function applyParallaxPreset(presetId: string): NodeParallax {
    const preset = PARALLAX_PRESETS.find((p) => p.id === presetId);
    if (!preset) {
      return draft.value;
    }

    const updated = NodeParallaxSchema.parse({
      ...draft.value,
      enabled: true,
      speed: preset.speed,
      direction: preset.direction,
      effects: preset.effects.map((effect) => ({ effect })),
      travel: preset.travel,
      easing: preset.easing,
      pin: preset.pin as NodeParallax["pin"],
      velocity: preset.velocity,
    });

    draft.value = updated;
    return updated;
  }

  return {
    draft,
    enabled,
    saveParallax,
    applyParallaxPreset,
  };
}
