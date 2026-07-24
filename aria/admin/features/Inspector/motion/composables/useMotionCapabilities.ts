/**
 * Aria Motion capabilities composable.
 */

import { computed, type Ref } from "vue";
import type { BuilderNode } from "../../../../../lib/types/nodes";
import {
  getVisibleMotionSections,
  nodeSupportsMotion,
} from "../constants/capabilityRules";
import type { MotionSectionId } from "../constants/sections";
import { MOTION_SECTION_ORDER } from "../constants/sections";

export function useMotionCapabilities(
  node: Ref<BuilderNode | null | undefined>,
  enabled: Ref<boolean>,
) {
  const supportsMotion = computed(() => {
    if (!node.value) return false;
    return nodeSupportsMotion(node.value.type);
  });

  const visibleSections = computed<MotionSectionId[]>(() => {
    if (!node.value || !supportsMotion.value) {
      return [];
    }

    const allowed = new Set(
      getVisibleMotionSections(node.value.type, enabled.value),
    );

    return MOTION_SECTION_ORDER.filter((section) => allowed.has(section));
  });

  return {
    supportsMotion,
    visibleSections,
  };
}
