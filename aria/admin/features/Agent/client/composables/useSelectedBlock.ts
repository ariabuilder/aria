import {
  computed,
  inject,
  ref,
  type ComputedRef,
  type InjectionKey,
} from "vue";
import { APP_INJECTION_KEYS } from "@/features/Core/types/injectionKeys";
import { useBeacon } from "@/features/Beacon";
import { findNodeById } from "@/lib/blocks/nodeUtils";
import { getNodeLabel } from "@/features/Layers/utils/nodeHelpers";
import type { BuilderNode } from "../../../../../lib/types/nodes";

export interface SelectedBlockInfo {
  id: string;
  type: string;
  label: string;
}

type PageBlocksValue = { value: BuilderNode[] };

/**
 * Tracks the currently selected block on the canvas and resolves its details.
 */
export function useSelectedBlock(): ComputedRef<SelectedBlockInfo | null> {
  const injectedPageBlocks = inject(
    APP_INJECTION_KEYS.pageBlocks as InjectionKey<unknown>,
    null,
  ) as PageBlocksValue | null;
  const pageBlocks = injectedPageBlocks ?? (ref([]) as PageBlocksValue);
  const { focusedNodeId } = useBeacon();

  return computed(() => {
    const id = focusedNodeId.value;
    if (!id) return null;

    const node = findNodeById(pageBlocks.value, id);
    if (!node) return null;

    return {
      id: node.id,
      type: node.type,
      label: getNodeLabel(node),
    };
  });
}
