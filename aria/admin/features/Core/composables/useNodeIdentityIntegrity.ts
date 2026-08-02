import { watch, type Ref } from "vue";
import { toast } from "vue-sonner";
import {
  createNodeIdentityFingerprint,
  ensureUniqueNodeIdentities,
  type NodeIdentityRepair,
} from "../../../../lib/blocks/nodeIdentity";
import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../../../lib/types/nodes";
import { log } from "@/lib/utils/logger";

export interface UseNodeIdentityIntegrityOptions {
  pageBlocks: Ref<BuilderNode[]>;
  currentPage: Ref<PageDSL | null>;
  currentLayout: Ref<LayoutDSL | null>;
  currentComponent: Ref<ComponentDSL | null>;
  currentItemType: Ref<"page" | "layout" | "component">;
  hasUnsavedChanges: Ref<boolean>;
  clearSelection: () => void;
}

interface SurfaceIdentityRepair {
  pageNodes: BuilderNode[];
  layoutSlots: LayoutDSL["slots"] | null;
  repairs: readonly NodeIdentityRepair[];
}

export function repairSurfaceNodeIdentities(
  pageNodes: readonly BuilderNode[],
  layout: LayoutDSL | null,
): SurfaceIdentityRepair {
  const pageResult = ensureUniqueNodeIdentities(pageNodes);
  let usedIds = pageResult.usedIds;
  const repairs: NodeIdentityRepair[] = [...pageResult.repairs];
  let layoutChanged = false;

  const layoutSlots =
    layout?.slots.map((slot) => {
      const slotResult = ensureUniqueNodeIdentities(slot.defaultContent ?? [], {
        reservedIds: usedIds,
      });
      usedIds = slotResult.usedIds;
      repairs.push(...slotResult.repairs);
      layoutChanged ||= slotResult.repairs.length > 0;

      return slotResult.repairs.length > 0
        ? {
            ...slot,
            defaultContent: slotResult.nodes,
          }
        : slot;
    }) ?? null;

  return {
    pageNodes: pageResult.nodes,
    layoutSlots: layoutChanged ? layoutSlots : null,
    repairs,
  };
}

export function useNodeIdentityIntegrity(
  options: UseNodeIdentityIntegrityOptions,
): void {
  const {
    pageBlocks,
    currentPage,
    currentLayout,
    currentComponent,
    currentItemType,
    hasUnsavedChanges,
    clearSelection,
  } = options;

  watch(
    () =>
      createNodeIdentityFingerprint([
        pageBlocks.value,
        ...(currentLayout.value?.slots.map(
          (slot) => slot.defaultContent ?? [],
        ) ?? []),
      ]),
    () => {
      const result = repairSurfaceNodeIdentities(
        pageBlocks.value,
        currentLayout.value,
      );
      if (result.repairs.length === 0) {
        return;
      }

      pageBlocks.value = result.pageNodes;

      if (currentPage.value) {
        currentPage.value = {
          ...currentPage.value,
          nodes: result.pageNodes,
        };
      }

      if (currentItemType.value === "component" && currentComponent.value) {
        currentComponent.value = {
          ...currentComponent.value,
          nodes: result.pageNodes,
        };
      }

      if (currentLayout.value) {
        currentLayout.value = {
          ...currentLayout.value,
          ...(currentItemType.value === "layout"
            ? { nodes: result.pageNodes }
            : {}),
          ...(result.layoutSlots ? { slots: result.layoutSlots } : {}),
        };
      }

      clearSelection();
      hasUnsavedChanges.value = true;
      log("warn", "[NodeIdentity] Repaired duplicate Composer node IDs", {
        repairCount: result.repairs.length,
        repairedIds: result.repairs.map((repair) => repair.previousId),
      });
      toast.warning(
        `Repaired ${result.repairs.length} duplicate element ${
          result.repairs.length === 1 ? "identity" : "identities"
        }. Save to keep the repair.`,
      );
    },
    { flush: "post", immediate: true },
  );
}
