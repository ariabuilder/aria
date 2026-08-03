import { computed, type ComputedRef, type Ref } from "vue";

import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../../../lib/types/nodes";
import type {
  AppChromeShellListeners,
  AppChromeShellProps,
  AppLeftSidebarShellListeners,
  AppLeftSidebarShellProps,
  AppMode,
  EditableItemType,
  SelectableLayout,
  SelectablePage,
  SelectableComponent,
} from "../../Core";
import type { StageEditingTab } from "../types";

export interface UseStageShellBindingsDeps {
  appMode: ComputedRef<AppMode>;
  isPreview: Ref<boolean>;
  isItemTransitioning: Ref<boolean>;
  pickerOpen: Ref<boolean>;
  components: Readonly<Ref<readonly SelectableComponent[]>>;
  pages: Readonly<Ref<readonly SelectablePage[]>>;
  layouts: Readonly<Ref<readonly SelectableLayout[]>>;
  openSettings: () => void;
  setPickerOpen: (value: boolean) => void;
  handleComponentSelect: (
    component: SelectableComponent,
  ) => void | Promise<void>;
  leftSidebarOpen: Ref<boolean>;
  setLeftSidebarOpen: (value: boolean) => void;
  pageBlocks: Ref<BuilderNode[]>;
  hasUnsavedChanges: Ref<boolean>;
  showOutlines: Ref<boolean>;
  showSelectionSizing: Ref<boolean>;
  showSelectionToolbar: Ref<boolean>;
  wireframeMode: Ref<boolean>;
  currentItemSlug: ComputedRef<string>;
  currentItemType: Ref<EditableItemType>;
  currentLayout: Ref<LayoutDSL | null>;
  currentPage: Ref<PageDSL | null>;
  currentComponent: Ref<ComponentDSL | null>;
  editingTab: Ref<StageEditingTab>;
  setEditingTab: (value: StageEditingTab) => void;
  setShowOutlines: (value: boolean) => void;
  setShowSelectionSizing: (value: boolean) => void;
  setShowSelectionToolbar: (value: boolean) => void;
  setWireframeMode: (value: boolean) => void;
  handleSidebarUnpublish: () => void | Promise<void>;
  handleSidebarComponentSaved: (component: ComponentDSL) => void;
  handleSidebarSelectPage: (slug: string) => void;
  handleSidebarCreatePage: (slug: string) => void;
  handleSidebarSelectLayout: (slug: string) => void;
  handleSidebarCreateLayout: (slug: string) => void;
  handleSidebarSelectComponent: (slug: string) => void;
  handleSidebarCreateComponent: (slug: string) => void;
  handleEditComponent: (componentId: string) => void | Promise<void>;
  handleActiveBlocksUpdate: (blocks: BuilderNode[]) => void;
  handleLayoutUpdate: (layoutSlug: string) => void;
  handleSidebarAddElement: AppLeftSidebarShellListeners["add-element"];
  handleLayersReorderNode: AppLeftSidebarShellListeners["reorder-node"];
  handleOpenPicker: (slotName: string) => void;
  handleSidebarPageSaved: (page: PageDSL) => void;
}

export interface UseStageShellBindingsReturn {
  stageChromeShellProps: ComputedRef<AppChromeShellProps>;
  stageChromeShellListeners: AppChromeShellListeners;
  stageSidebarShellProps: ComputedRef<AppLeftSidebarShellProps>;
  stageSidebarShellListeners: AppLeftSidebarShellListeners;
}

export function useStageShellBindings(
  deps: UseStageShellBindingsDeps,
): UseStageShellBindingsReturn {
  const {
    appMode,
    isPreview,
    isItemTransitioning,
    pickerOpen,
    components,
    pages,
    layouts,
    openSettings,
    setPickerOpen,
    handleComponentSelect,
    leftSidebarOpen,
    setLeftSidebarOpen,
    pageBlocks,
    hasUnsavedChanges,
    showOutlines,
    showSelectionSizing,
    showSelectionToolbar,
    wireframeMode,
    currentItemSlug,
    currentItemType,
    currentLayout,
    currentPage,
    currentComponent,
    editingTab,
    setEditingTab,
    setShowOutlines,
    setShowSelectionSizing,
    setShowSelectionToolbar,
    setWireframeMode,
    handleSidebarUnpublish,
    handleSidebarComponentSaved,
    handleSidebarSelectPage,
    handleSidebarCreatePage,
    handleSidebarSelectLayout,
    handleSidebarCreateLayout,
    handleSidebarSelectComponent,
    handleSidebarCreateComponent,
    handleEditComponent,
    handleActiveBlocksUpdate,
    handleLayoutUpdate,
    handleSidebarAddElement,
    handleLayersReorderNode,
    handleOpenPicker,
    handleSidebarPageSaved,
  } = deps;

  const stageChromeShellProps = computed<AppChromeShellProps>(() => ({
    isPreview: isPreview.value,
    pickerOpen: pickerOpen.value,
    components: [...components.value],
  }));

  const stageChromeShellListeners: AppChromeShellListeners = {
    "open-settings": openSettings,
    "update:picker-open": setPickerOpen,
    "select-component": handleComponentSelect,
  };

  const stageSidebarShellProps = computed<AppLeftSidebarShellProps>(() => ({
    hasUnsavedChanges: hasUnsavedChanges.value,
    show: appMode.value === "stage" && leftSidebarOpen.value,
    isPreview: isPreview.value,
    isItemTransitioning: isItemTransitioning.value,
    open: leftSidebarOpen.value,
    activeBlocks: pageBlocks.value,
    showOutlines: showOutlines.value,
    showSelectionSizing: showSelectionSizing.value,
    showSelectionToolbar: showSelectionToolbar.value,
    wireframeMode: wireframeMode.value,
    currentItemSlug: currentItemSlug.value,
    currentItemType: currentItemType.value,
    currentLayout: currentLayout.value,
    currentPage: currentPage.value,
    currentComponent: currentComponent.value,
    availablePages: [...pages.value],
    availableLayouts: [...layouts.value],
    availableComponents: [...components.value],
    editingTab: editingTab.value,
  }));

  const stageSidebarShellListeners: AppLeftSidebarShellListeners = {
    "update:open": setLeftSidebarOpen,
    "update:editing-tab": setEditingTab,
    "update:show-outlines": setShowOutlines,
    "update:show-selection-sizing": setShowSelectionSizing,
    "update:show-selection-toolbar": setShowSelectionToolbar,
    "update:wireframe-mode": setWireframeMode,
    unpublish: handleSidebarUnpublish,
    "select-page": handleSidebarSelectPage,
    "create-page": handleSidebarCreatePage,
    "select-layout": handleSidebarSelectLayout,
    "create-layout": handleSidebarCreateLayout,
    "select-component": handleSidebarSelectComponent,
    "create-component": handleSidebarCreateComponent,
    "edit-component": handleEditComponent,
    "update:activeBlocks": handleActiveBlocksUpdate,
    "update-layout": handleLayoutUpdate,
    "add-element": handleSidebarAddElement,
    "reorder-node": handleLayersReorderNode,
    "open-picker": handleOpenPicker,
    "page-saved": handleSidebarPageSaved,
    "component-saved": handleSidebarComponentSaved,
  };

  return {
    stageChromeShellProps,
    stageChromeShellListeners,
    stageSidebarShellProps,
    stageSidebarShellListeners,
  };
}
