import { computed, type Ref } from "vue";

import type { BuilderNode, ComponentDSL, LayoutDSL, PageDSL } from "../../../../lib/types/nodes";
import { useSessionState, type SessionStateRefs } from "../session/useSessionState";
import type { UseAppRouterReturn } from "./useAppRouter";

export interface UseAppSessionStateDeps {
  currentPage: Ref<PageDSL | null>;
  currentLayout: Ref<LayoutDSL | null>;
  currentComponent: Ref<ComponentDSL | null>;
  currentItemType: Ref<"page" | "layout" | "component">;
  focusedNodeId: Ref<string | null>;
  pageBlocks: Ref<BuilderNode[]>;
  appRouter: UseAppRouterReturn;
}

export function useAppSessionState(deps: UseAppSessionStateDeps) {
  const sessionStateRefs: SessionStateRefs = {
    currentPage: deps.currentPage,
    currentLayout: deps.currentLayout,
    currentComponent: deps.currentComponent,
    currentItemType: deps.currentItemType,
    selectedBlockId: deps.focusedNodeId,
    leftSidebarOpen: computed(() => deps.appRouter.leftSidebarOpen.value),
    rightSidebarOpen: computed(() => deps.appRouter.rightSidebarOpen.value),
    studioSection: computed(() => deps.appRouter.studioSection.value),
    pageBlocks: deps.pageBlocks,
  };

  return useSessionState(sessionStateRefs);
}
