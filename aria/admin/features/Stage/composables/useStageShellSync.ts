import { watch, type Ref } from "vue";
import { useBeacon } from "../../Beacon";

interface LayersSidebarLike {
  expandAncestorsInLayers: (nodeId: string) => void;
}

export interface UseStageShellSyncDeps {
  rightSidebarOpen: Ref<boolean>;
  appSidebarRef: Ref<LayersSidebarLike | null>;
}

export function useStageShellSync(deps: UseStageShellSyncDeps): void {
  const { focusedNodeId } = useBeacon();
  const { rightSidebarOpen, appSidebarRef } = deps;

  watch(focusedNodeId, (newId) => {
    if (newId) {
      rightSidebarOpen.value = true;
      appSidebarRef.value?.expandAncestorsInLayers(newId);
    }
  });
}
