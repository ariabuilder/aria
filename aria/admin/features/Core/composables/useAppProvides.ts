import { provide, ref, shallowRef, type ComputedRef, type Ref } from "vue";
import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../../../lib/types/nodes";
import {
  APP_INJECTION_KEYS,
  type EditorNodeRegistry,
  type StageIframeLike,
} from "../types/injectionKeys";
import type { UseActiveLayoutSlotReturn } from "./useActiveLayoutSlot";
import type { AppNodeEventHandlers } from "../types/injectionKeys";

export interface UseAppProvidesOptions {
  pageBlocks: Ref<BuilderNode[]>;
  currentPage?: Ref<PageDSL | null>;
  currentLayout: Ref<LayoutDSL | null>;
  currentComponent?: Ref<ComponentDSL | null>;
  currentItemType?: Ref<"page" | "layout" | "component">;
  hasUnsavedChanges?: Ref<boolean>;
  stageIframeRef: ComputedRef<StageIframeLike>;
  prefetchPageData: (slug: string) => Promise<void>;
  prewarmBuilder: () => Promise<void>;
  activeLayoutSlot?: UseActiveLayoutSlotReturn;
  editorNodeRegistry?: EditorNodeRegistry;
  nodeEventHandlers?: AppNodeEventHandlers;
  ensureDraftSaved?: () => Promise<boolean>;
  showLayoutSlotGroups?: Ref<boolean>;
}

export function useAppProvides(options: UseAppProvidesOptions): void {
  const {
    pageBlocks,
    currentLayout,
    stageIframeRef,
    prefetchPageData,
    prewarmBuilder,
  } = options;
  const currentPage =
    options.currentPage ?? (shallowRef(null) as Ref<PageDSL | null>);
  const currentComponent =
    options.currentComponent ??
    (shallowRef(null) as Ref<ComponentDSL | null>);
  const currentItemType =
    options.currentItemType ?? ref<"page" | "layout" | "component">("page");
  const hasUnsavedChanges = options.hasUnsavedChanges ?? ref(false);

  provide(APP_INJECTION_KEYS.pageBlocks, pageBlocks);
  provide(APP_INJECTION_KEYS.currentPage, currentPage);
  provide(APP_INJECTION_KEYS.currentLayout, currentLayout);
  provide(APP_INJECTION_KEYS.currentComponent, currentComponent);
  provide(APP_INJECTION_KEYS.currentItemType, currentItemType);
  provide(APP_INJECTION_KEYS.hasUnsavedChanges, hasUnsavedChanges);

  provide(APP_INJECTION_KEYS.stageIframeRef, stageIframeRef);

  provide(APP_INJECTION_KEYS.prefetchPageData, prefetchPageData);

  provide(APP_INJECTION_KEYS.prewarmBuilder, prewarmBuilder);

  if (options.activeLayoutSlot) {
    provide(APP_INJECTION_KEYS.activeLayoutSlot, options.activeLayoutSlot);
  }

  if (options.editorNodeRegistry) {
    provide(APP_INJECTION_KEYS.editorNodeRegistry, options.editorNodeRegistry);
  }

  if (options.nodeEventHandlers) {
    provide(APP_INJECTION_KEYS.nodeEventHandlers, options.nodeEventHandlers);
  }

  if (options.ensureDraftSaved) {
    provide(APP_INJECTION_KEYS.ensureDraftSaved, options.ensureDraftSaved);
  }

  if (options.showLayoutSlotGroups) {
    provide(
      APP_INJECTION_KEYS.showLayoutSlotGroups,
      options.showLayoutSlotGroups,
    );
  }
}
