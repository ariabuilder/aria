import type { ComputedRef } from "vue";

import type { BuilderNode } from "../../../../lib/types/nodes";
import type { UsePropertySaveReturn } from "../../Core";
import { useInspectorGlobalStyleDefaults } from "./useInspectorGlobalStyleDefaults";
import { useInspectorStyleTarget } from "./useInspectorStyleTarget";

interface UseInspectorStyleTargetWithGlobalDefaultsOptions {
  propertySave: Pick<
    UsePropertySaveReturn,
    | "selectedNode"
    | "selectedNodeId"
    | "selectedNodes"
    | "breakpointName"
    | "isLoading"
    | "error"
    | "previewStyleProperties"
    | "previewResponsiveStyleUpdates"
    | "getComputedStyleValue"
    | "saveProperty"
    | "saveProperties"
  >;
  targetNode?: ComputedRef<BuilderNode | null>;
  targetNodeId?: ComputedRef<string | null>;
}

export function useInspectorStyleTargetWithGlobalDefaults(
  options: UseInspectorStyleTargetWithGlobalDefaultsOptions,
) {
  const globalDefaults = useInspectorGlobalStyleDefaults({
    targetNode: options.targetNode,
    targetNodeId: options.targetNodeId,
  });

  const styleTarget = useInspectorStyleTarget({
    propertySave: options.propertySave,
    targetNode: options.targetNode,
    targetNodeId: options.targetNodeId,
    globalDefaults: {
      isActive: globalDefaults.isGlobalDefaultsActive,
      primaryDefaults: globalDefaults.globalStyleDefaults,
      compareAcrossSelection: globalDefaults.compareGlobalDefaultAcrossSelection,
      coalesceSaveValue: globalDefaults.coalesceSaveStyleValue,
    },
  });

  return {
    styleTarget,
    globalDefaults,
  };
}
