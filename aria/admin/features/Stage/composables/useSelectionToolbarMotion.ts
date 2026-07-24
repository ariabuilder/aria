import { computed, ref } from "vue";
import { useInspector } from "../../Inspector/composables/useInspector";
import { nodeSupportsMotion } from "../../Inspector/motion/constants/capabilityRules";
import { applyPreset } from "../../Inspector/motion/presets/catalog";
import { usePropertySave } from "../../Core";
import { useSelectedNodeState } from "../../Core/composables/useSelectedNodeState";
import {
  DEFAULT_NODE_MOTION,
  NodeMotionSchema,
  type NodeMotion,
} from "../../../../lib/motion/schemas/nodeMotion.schema";
import type { MotionPresetId } from "../../../../lib/motion/schemas/tokens.schema";

type ItemType = "page" | "layout" | "component";
type CollectionName = "pages" | "layouts" | "components";

const COLLECTION_ITEM_TYPE: Record<CollectionName, ItemType> = {
  pages: "page",
  layouts: "layout",
  components: "component",
};

export function shouldShowToolbarMotionButton(input: {
  nodeType?: string | null;
}): boolean {
  const nodeType = input.nodeType?.trim();
  return Boolean(nodeType && nodeSupportsMotion(nodeType));
}

export function applyToolbarMotionPreset(
  current: NodeMotion | null | undefined,
  presetId: MotionPresetId,
): NodeMotion {
  if (presetId === "none") {
    return NodeMotionSchema.parse(DEFAULT_NODE_MOTION);
  }

  const parsed = NodeMotionSchema.safeParse(current ?? DEFAULT_NODE_MOTION);
  return NodeMotionSchema.parse(
    applyPreset(presetId, parsed.success ? parsed.data : DEFAULT_NODE_MOTION),
  );
}

function itemTypeForCollection(collection: string): ItemType | null {
  return (COLLECTION_ITEM_TYPE as Record<string, ItemType | undefined>)[
    collection
  ] ?? null;
}

export function useSelectionToolbarMotion() {
  const inspector = useInspector();
  const propertySave = usePropertySave();
  const { selectedNode } = useSelectedNodeState();
  const pendingError = ref("");

  const showMotionButton = computed(() =>
    shouldShowToolbarMotionButton({
      nodeType: selectedNode.value?.type,
    }),
  );

  const isMotionActive = computed(
    () => selectedNode.value?.motion?.enabled === true,
  );

  const selectedPresetId = computed<MotionPresetId | null>(() => {
    if (!isMotionActive.value) {
      return "none";
    }

    const preset = selectedNode.value?.motion?.preset;
    return preset ?? null;
  });

  async function selectMotionPreset(
    presetId: MotionPresetId,
  ): Promise<{ success: boolean; error?: string }> {
    pendingError.value = "";

    const node = selectedNode.value;
    if (!node) {
      pendingError.value = "No node selected.";
      return { success: false, error: pendingError.value };
    }

    if (!shouldShowToolbarMotionButton({ nodeType: node.type })) {
      pendingError.value = "Aria Motion is not available for this element.";
      return { success: false, error: pendingError.value };
    }

    const target = inspector.getNodeTarget();
    if (!target) {
      pendingError.value = "No target selected.";
      return { success: false, error: pendingError.value };
    }

    const itemType = itemTypeForCollection(target.path.collection);
    if (!itemType) {
      pendingError.value = "Unsupported motion target.";
      return { success: false, error: pendingError.value };
    }

    const motion = applyToolbarMotionPreset(node.motion, presetId);
    const success = await propertySave.saveNodeUpdates(
      { motion },
      itemType,
      target.path.id,
      target.nodeId,
    );

    if (!success) {
      pendingError.value =
        propertySave.error.value ?? "Could not apply Aria Motion.";
      return { success: false, error: pendingError.value };
    }

    return { success: true };
  }

  return {
    pendingError,
    showMotionButton,
    isMotionActive,
    selectedPresetId,
    selectMotionPreset,
  };
}
