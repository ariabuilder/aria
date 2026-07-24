import type { ComputedRef, InjectionKey, Ref } from "vue";
import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../../../lib/types/nodes";
import type { UseActiveLayoutSlotReturn } from "../composables/useActiveLayoutSlot";
import type { useEditorNodeRegistry } from "../composables/useEditorNodeRegistry";
import type { useNodeEventHandlers } from "../../Nodes/events/useNodeEventHandlers";
import type { CmsPreviewEntryContext } from "../../CMS/composables/useCmsPreviewEntryContext";

export type EditorNodeRegistry = ReturnType<typeof useEditorNodeRegistry>;
export type AppNodeEventHandlers = ReturnType<typeof useNodeEventHandlers>;

export type StageIframeLike =
  | HTMLIFrameElement
  | null
  | undefined
  | { iframeRef?: HTMLIFrameElement | null };

export const APP_INJECTION_KEYS = {
  pageBlocks: Symbol("aria.pageBlocks") as InjectionKey<Ref<BuilderNode[]>>,
  currentLayout: Symbol("aria.currentLayout") as InjectionKey<
    Ref<LayoutDSL | null>
  >,
  currentPage: Symbol("aria.currentPage") as InjectionKey<Ref<PageDSL | null>>,
  currentComponent: Symbol("aria.currentComponent") as InjectionKey<
    Ref<ComponentDSL | null>
  >,
  currentItemType: Symbol("aria.currentItemType") as InjectionKey<
    Ref<"page" | "layout" | "component">
  >,
  hasUnsavedChanges: Symbol("aria.hasUnsavedChanges") as InjectionKey<
    Ref<boolean>
  >,
  stageIframeRef: Symbol("aria.stageIframeRef") as InjectionKey<
    ComputedRef<StageIframeLike>
  >,
  prefetchPageData: Symbol("aria.prefetchPageData") as InjectionKey<
    (slug: string) => Promise<void>
  >,
  prewarmBuilder: Symbol("aria.prewarmBuilder") as InjectionKey<
    () => Promise<void>
  >,
  activeLayoutSlot: Symbol(
    "aria.activeLayoutSlot",
  ) as InjectionKey<UseActiveLayoutSlotReturn>,
  editorNodeRegistry: Symbol(
    "aria.editorNodeRegistry",
  ) as InjectionKey<EditorNodeRegistry>,
  nodeEventHandlers: Symbol(
    "aria.nodeEventHandlers",
  ) as InjectionKey<AppNodeEventHandlers>,
  showLayoutSlotGroups: Symbol(
    "aria.showLayoutSlotGroups",
  ) as InjectionKey<Ref<boolean>>,
  ensureDraftSaved: Symbol("aria.ensureDraftSaved") as InjectionKey<
    () => Promise<boolean>
  >,
  cmsPreviewEntryContext: Symbol(
    "aria.cmsPreviewEntryContext",
  ) as InjectionKey<CmsPreviewEntryContext>,
} as const;
