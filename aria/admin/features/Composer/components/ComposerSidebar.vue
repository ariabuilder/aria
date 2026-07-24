<script setup lang="ts">
import { ref, watch, computed, inject } from "vue";
import { APP_INJECTION_KEYS } from "../../Core/types/injectionKeys";
import type {
  BuilderNode,
  ComponentDSL,
  PageDSL,
} from "../../../../lib/types/nodes";
import type { AddElementPayload } from "../../../types/app";
import { coerceStageEditingTabForItemType } from "../../Stage/composables/useStageEditingTabState";
import type { StageEditingTab } from "../../Stage/types";
import { useShellSignalBridge } from "../../Core";
import { LayerPanel } from "../../Layers";
import { BlockLibrary } from "../../Blocks";
import {
  AgentChatView,
  useAgentPanel,
  useAgentRuntimeStatus,
} from "../../Agent";
import ComposerQuickSwitch from "./ComposerQuickSwitch.vue";
import ComposerCanvasOptionsMenu from "./ComposerCanvasOptionsMenu.vue";
import ExpandableSearchInput from "@/features/Studio/core/components/ExpandableSearchInput.vue";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import PanelHeader from "../../Core/components/PanelHeader.vue";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import { useComposerSavePublishUiState } from "../composables/useComposerSavePublishUiState";

const editingActiveTab = ref<StageEditingTab>("add-elements");
const { t } = useStudioI18n();
const quickSwitchRef = ref<InstanceType<typeof ComposerQuickSwitch> | null>(
  null,
);

const elementsViewMode = ref<"grid" | "list">("grid");
const activeLayoutSlot = inject(APP_INJECTION_KEYS.activeLayoutSlot, null);
const showLayoutSlotGroups = inject(
  APP_INJECTION_KEYS.showLayoutSlotGroups,
  ref(true),
);

const handleShowSlotGroupsUpdate = (value: boolean): void => {
  showLayoutSlotGroups.value = value;

  if (!value) {
    activeLayoutSlot?.resetToPageScope();
  }
};

const addElementsToolbarLabel = computed(() => {
  if (
    editingActiveTab.value === "add-elements" &&
    showLayoutSlotGroups.value &&
    activeLayoutSlot?.isLayoutSlotEditing.value
  ) {
    return t("composer.sidebar.addToLayoutSlot", {
      slot: activeLayoutSlot.activeSlotLabel.value,
    });
  }
  return t("composer.sidebar.addElements");
});

interface Props {
  variant?: "sidebar" | "floating" | "inset";
  side?: "left" | "right";
  collapsible?: "offcanvas" | "icon" | "none";
  open?: boolean;
  activeBlocks?: BuilderNode[];
  currentItemSlug?: string;
  currentItemType?: "page" | "layout" | "component";
  currentLayout?: {
    name?: string;
    slots?: Array<{
      name: string;
      label?: string;
      description?: string;
      isDefault?: boolean;
    }>;
  } | null;
  currentPage?: PageDSL | null;
  currentComponent?: ComponentDSL | null;
  showOutlines?: boolean;
  wireframeMode?: boolean;
  hasUnsavedChanges?: boolean;
  editingTab?: StageEditingTab;
  availablePages?: ReadonlyArray<{
    id: string;
    title: string;
    slug: string;
    status: "draft" | "published" | "scheduled" | "archived";
    updatedAt?: string | null;
  }>;
  availableLayouts?: ReadonlyArray<{
    id: string;
    name: string;
    title?: string;
    description?: string;
    updatedAt?: string | null;
  }>;
  availableComponents?: ReadonlyArray<{
    id?: string;
    slug?: string;
    name: string;
    description?: string;
    category?: string;
    thumbnailUrl?: string;
    snapshotUrl?: string;
  }>;
}

const props = withDefaults(defineProps<Props>(), {
  variant: "inset",
  side: "left",
  collapsible: "icon",
  open: true,
  activeBlocks: () => [],
  showOutlines: false,
  wireframeMode: false,
  hasUnsavedChanges: false,
  editingTab: "layers",
  availablePages: () => [],
  availableLayouts: () => [],
  availableComponents: () => [],
});

const emit = defineEmits<{
  "update:open": [open: boolean];
  "update:editing-tab": [tab: StageEditingTab];
  "update:activeBlocks": [blocks: BuilderNode[]];
  "update-layout": [layoutSlug: string];
  "add-element": [payload: AddElementPayload];
  "reorder-node": [
    data: {
      nodeId: string;
      targetNodeId: string;
      position: "before" | "after" | "inside";
    },
  ];
  "open-picker": [slotName: string];
  "page-saved": [page: PageDSL];
  "component-saved": [component: ComponentDSL];
  "update:show-outlines": [value: boolean];
  "update:wireframe-mode": [value: boolean];
  unpublish: [];
  "select-page": [slug: string];
  "select-layout": [slug: string];
  "select-component": [slug: string];
  "edit-component": [componentId: string];
}>();

const layersSearchQuery = ref("");
const layersSearchOpen = ref(false);
const agentPanel = useAgentPanel();
const agentRuntime = useAgentRuntimeStatus();
const agentChatRef = ref<InstanceType<typeof AgentChatView> | null>(null);
const agentWorkingInBackground = computed(
  () =>
    agentRuntime.isWorking.value && editingActiveTab.value !== "agent",
);
const agentCompletedSectionsInBackground = computed(() =>
  agentWorkingInBackground.value
    ? agentRuntime.completedSectionCount.value
    : 0,
);

const { isPublished, livePageHref } = useComposerSavePublishUiState({
  currentItemType: () => props.currentItemType ?? "page",
  currentItemSlug: () => props.currentItemSlug,
  currentPage: () => props.currentPage,
});

const allLayersExpanded = ref(true);
const layerPanelRef = ref<InstanceType<typeof LayerPanel>>();

const isEditingMode = computed(() => {
  return !!(props.currentItemSlug && props.currentItemType);
});

// Tab switching for editing mode
const setEditingTab = (tab: StageEditingTab) => {
  const nextTab = coerceStageEditingTabForItemType(tab, props.currentItemType);

  if (nextTab === "agent" && !agentPanel.isOpen.value) {
    agentPanel.open();
  }

  editingActiveTab.value = nextTab;
  emit("update:editing-tab", nextTab);
};

const handleOpenAddElements = (): void => {
  setEditingTab("add-elements");
};

watch(editingActiveTab, (tab) => {
  if (tab !== "layers") {
    layersSearchOpen.value = false;
  }
});

watch(
  () => agentPanel.isOpen.value,
  (isOpen) => {
    if (isOpen && editingActiveTab.value !== "agent") {
      editingActiveTab.value = "agent";
      emit("update:editing-tab", "agent");
      return;
    }

    if (!isOpen && editingActiveTab.value === "agent") {
      editingActiveTab.value = "layers";
      emit("update:editing-tab", "layers");
    }
  },
);

watch(
  () => props.currentItemType,
  (itemType) => {
    if (!itemType) {
      return;
    }

    const coercedTab = coerceStageEditingTabForItemType(
      editingActiveTab.value,
      itemType,
    );

    if (coercedTab !== editingActiveTab.value) {
      setEditingTab(coercedTab);
    }
  },
);

watch(
  () => props.editingTab,
  (nextTab) => {
    if (!nextTab || editingActiveTab.value === nextTab) {
      return;
    }

    const coercedTab = coerceStageEditingTabForItemType(
      nextTab,
      props.currentItemType,
    );

    if (editingActiveTab.value !== coercedTab) {
      setEditingTab(coercedTab);
    }
  },
  { immediate: true },
);

const handleAddElement = (payload: AddElementPayload) => {
  if (import.meta.env.DEV) {
    console.log("Adding element to canvas:", payload);
  }
  emit("add-element", payload);
};

const { onOpenAddElements } = useShellSignalBridge();
onOpenAddElements(handleOpenAddElements);

// Expose LayerPanel methods to parent components
defineExpose({
  expandAncestorsInLayers: (nodeId: string) => {
    layerPanelRef.value?.expandAncestors(nodeId);
  },
  openQuickSwitch: () => {
    quickSwitchRef.value?.open();
  },
});
</script>

<template>
  <aside
    class="h-full min-h-0 w-full flex flex-col overflow-hidden hide-scrollbars bg-background"
  >
    <!-- Editing Mode Header & Tabs (show when editing) -->
    <template v-if="isEditingMode">
      <!-- Breadcrumb: what are we editing? -->
      <PanelHeader>
        <ComposerQuickSwitch
          ref="quickSwitchRef"
          class="min-w-0 flex-1"
          :available-pages="availablePages"
          :available-layouts="availableLayouts"
          :available-components="availableComponents"
          :current-item-slug="currentItemSlug"
          :current-item-type="currentItemType"
          :current-page-title="currentPage?.title"
          :current-layout-name="currentLayout?.name"
          :has-unsaved-changes="hasUnsavedChanges"
          @select-page="(slug) => emit('select-page', slug)"
          @select-layout="(slug) => emit('select-layout', slug)"
          @select-component="(slug) => emit('select-component', slug)"
        />

        <template #trailing>
          <HeaderActionTooltip :label="t('composer.options.label')">
            <ComposerCanvasOptionsMenu
              :show-outlines="props.showOutlines"
              :wireframe-mode="props.wireframeMode"
              :is-published="isPublished"
              :live-page-href="livePageHref"
              :show-slot-groups="showLayoutSlotGroups"
              @update:show-outlines="emit('update:show-outlines', $event)"
              @update:wireframe-mode="emit('update:wireframe-mode', $event)"
              @update:show-slot-groups="handleShowSlotGroupsUpdate"
              @unpublish="emit('unpublish')"
            />
          </HeaderActionTooltip>
        </template>
      </PanelHeader>

      <!-- Tabs -->
      <div
        class="relative h-12 flex border-b border-border border-dashed shrink-0"
      >
        <TooltipProvider :delay-duration="0">
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                data-testid="composer-layers-tab"
                @click="setEditingTab('layers')"
                :class="[
                  'relative flex-1 overflow-hidden text-sm font-serif font-medium transition-colors flex items-center justify-center',
                  editingActiveTab === 'layers'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                ]"
              >
                <div
                  :class="[studioIcons.layers, 'relative z-10 w-4.5 h-4.5']"
                />
                <span
                  aria-hidden="true"
                  :class="[
                    'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 z-20 origin-left bg-primary transition-transform duration-150 ease-out',
                    editingActiveTab === 'layers' ? 'scale-x-100' : 'scale-x-0',
                  ]"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" class="text-xs"
              >{{ t("composer.sidebar.layers") }}</TooltipContent
            >
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider :delay-duration="0">
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                @click="setEditingTab('add-elements')"
                :class="[
                  'relative flex-1 overflow-hidden text-sm font-serif font-medium transition-colors flex items-center justify-center',
                  editingActiveTab === 'add-elements'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                ]"
              >
                <div
                  :class="[studioIcons.addCircle, 'relative z-10 w-4.5 h-4.5']"
                />
                <span
                  aria-hidden="true"
                  :class="[
                    'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 z-20 origin-left bg-primary transition-transform duration-150 ease-out',
                    editingActiveTab === 'add-elements'
                      ? 'scale-x-100'
                      : 'scale-x-0',
                  ]"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" class="text-xs"
              >{{ t("composer.sidebar.addElements") }}</TooltipContent
            >
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider :delay-duration="0">
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                data-testid="composer-agent-tab"
                @click="setEditingTab('agent')"
                :class="[
                  'relative flex-1 overflow-hidden text-sm font-serif font-medium transition-colors flex items-center justify-center',
                  editingActiveTab === 'agent'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                ]"
              >
                <div
                  :class="[
                    studioIcons.sparkles,
                    'relative z-10 w-4.5 h-4.5',
                    agentWorkingInBackground
                      ? 'text-primary animate-pulse motion-reduce:animate-none'
                      : '',
                  ]"
                />
                <span
                  v-if="agentCompletedSectionsInBackground > 0"
                  data-testid="composer-agent-build-count"
                  class="pointer-events-none absolute right-[calc(50%-1.1rem)] top-1.5 z-20 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-semibold leading-4 text-primary-foreground"
                >
                  {{ agentCompletedSectionsInBackground }}
                </span>
                <span
                  aria-hidden="true"
                  :class="[
                    'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 z-20 origin-left bg-primary transition-transform duration-150 ease-out',
                    editingActiveTab === 'agent'
                      ? 'scale-x-100'
                      : 'scale-x-0',
                  ]"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" class="text-xs">{{
              t("agent.title")
            }}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <!-- Toolbar -->
      <PanelHeader :class="editingActiveTab === 'layers' ? 'relative' : undefined">
        <span
          v-if="!(editingActiveTab === 'layers' && layersSearchOpen)"
          class="text-xs font-serif text-muted-foreground select-none truncate"
        >
          {{
            editingActiveTab === "add-elements"
              ? addElementsToolbarLabel
              : editingActiveTab === "layers"
                ? t("composer.sidebar.layers")
                : t("agent.title")
          }}
        </span>

        <template #trailing>
          <div class="flex items-center gap-1">
            <!-- View toggle for add elements tab -->
            <Button
              v-if="editingActiveTab === 'add-elements'"
              @click="
                elementsViewMode = elementsViewMode === 'grid' ? 'list' : 'grid'
              "
              variant="ghost"
              size="icon"
              class="h-4 w-4"
            >
              <div
                v-if="elementsViewMode === 'grid'"
                :class="[studioIcons.grid, 'w-4 h-4']"
              />
              <div v-else :class="[studioIcons.list, 'w-4 h-4']" />
            </Button>

            <template v-else-if="editingActiveTab === 'layers'">
              <ExpandableSearchInput
                v-model="layersSearchQuery"
                :placeholder="t('composer.sidebar.searchLayers')"
                compact
                :class="
                  layersSearchOpen
                    ? 'absolute right-[3.125rem] top-1/2 z-10 -translate-y-1/2'
                    : undefined
                "
                @update:open="layersSearchOpen = $event"
              />
              <HeaderActionTooltip
                :label="
                  allLayersExpanded
                    ? t('composer.sidebar.collapseAll')
                    : t('composer.sidebar.expandAll')
                "
              >
                <Button
                  @click="layerPanelRef?.toggleAll()"
                  variant="headerAction"
                  size="icon-header"
                  class="relative z-20"
                  :aria-label="
                    allLayersExpanded
                      ? t('composer.sidebar.collapseAll')
                      : t('composer.sidebar.expandAll')
                  "
                >
                  <div
                    v-if="allLayersExpanded"
                    :class="[studioIcons.chevronDown, 'w-4 h-4']"
                  />
                  <div v-else :class="[studioIcons.chevronUp, 'w-4 h-4']" />
                </Button>
              </HeaderActionTooltip>
            </template>

            <template v-else-if="editingActiveTab === 'agent'">
              <Button
                variant="headerAction"
                size="icon-header"
                :title="t('agent.newConversation')"
                @click="agentChatRef?.clearChat()"
              >
                <span :class="[studioIcons.add, 'size-3.5']" />
              </Button>
              <Button
                variant="headerAction"
                size="icon-header"
                :title="t('agent.close')"
                @click="agentPanel.close()"
              >
                <span :class="[studioIcons.close, 'size-3.5']" />
              </Button>
            </template>
          </div>
        </template>
      </PanelHeader>
    </template>

    <!-- Content Area -->
    <div
      class="relative flex-1 overflow-y-auto overflow-x-hidden no-scrollbar py-0 -m-px"
    >
      <!-- LayerPanel always mounted — Beacon + canvas signal listeners -->
      <Transition name="tab-panel">
        <div v-show="editingActiveTab === 'layers'" class="h-full">
          <LayerPanel
            ref="layerPanelRef"
            :all-layers-expanded="allLayersExpanded"
            :blocks="props.activeBlocks"
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :current-layout="props.currentLayout ?? undefined"
            :show-slot-groups="showLayoutSlotGroups"
            :search-query="layersSearchQuery"
            @update:blocks="emit('update:activeBlocks', $event)"
            @update:all-layers-expanded="allLayersExpanded = $event"
            @update-layout="emit('update-layout', $event)"
            @open-picker="(payload: string) => emit('open-picker', payload)"
            @edit-component="(componentId: string) => emit('edit-component', componentId)"
          />
        </div>
      </Transition>

      <Transition name="tab-panel">
        <div
          v-if="editingActiveTab === 'add-elements'"
          key="editing-add-elements"
          class="flex flex-col"
        >
          <BlockLibrary
            :view-mode="elementsViewMode"
            @add-element="handleAddElement"
          />
        </div>
      </Transition>

      <!-- Agent stays mounted like Layers so background work and its socket
           survive tab/Inspector changes. -->
      <Transition name="tab-panel">
        <AgentChatView
          v-show="editingActiveTab === 'agent'"
          ref="agentChatRef"
          key="editing-agent"
          compact
          class="h-full min-h-0"
        />
      </Transition>
    </div>
  </aside>
</template>
