<!-- One row in the layer tree (context menu, rename, drag). -->
<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <div
        ref="layerItemRef"
        data-layer-item
        :class="[
          'group relative mx-1 flex h-7 items-center border border-transparent transition-colors',
          selected
            ? 'rounded-sm border-primary/20 bg-primary/10 text-foreground shadow-none'
            : 'text-foreground hover:bg-primary/4',
          hovered && !selected ? 'bg-primary/6 text-foreground' : '',
          dropIndicatorClass === 'drop-inside' ? 'layer-item--drop-inside' : '',
        ]"
        @click.stop="!isEditing && $emit('select', $event)"
        @mouseenter="!isEditing && $emit('hover')"
        @mouseleave="!isEditing && $emit('leave')"
        @dragover.stop="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <div
          v-if="dropIndicatorClass === 'drop-before'"
          class="layer-drop-indicator layer-drop-indicator--before"
        />
        <div
          v-if="dropIndicatorClass === 'drop-after'"
          class="layer-drop-indicator layer-drop-indicator--after"
        />
        <!-- Expander (hidden for component instances since they can't expand until detached) -->
        <button
          v-if="hasChildren && !isComponentInstance"
          type="button"
          class="flex size-5 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-primary/8"
          :aria-expanded="expanded"
          :aria-busy="expanding || undefined"
          :aria-label="
            expanding
              ? `Expanding ${getNodeLabel(node)} layers`
              : expanded
                ? `Collapse ${getNodeLabel(node)} layers`
                : `Expand ${getNodeLabel(node)} layers`
          "
          @click.stop="(evt) => $emit('toggle-expand', evt)"
        >
          <div
            v-if="expanding"
            :class="[
              studioIcons.loading,
              'size-3 text-primary motion-safe:animate-spin motion-reduce:opacity-70',
            ]"
            aria-hidden="true"
            style="will-change: transform"
          />
          <div
            v-else
            :class="[
              studioIcons.chevronRight,
              'h-3 w-3 text-muted-foreground transition-transform',
              expanded ? 'rotate-90' : '',
            ]"
            aria-hidden="true"
          />
        </button>
        <div v-else class="w-5 shrink-0"></div>

        <!-- Icon -->
        <div
          :class="[getNodeIconClass(node), 'mx-1.5 size-3.5 shrink-0']"
          :style="{
            color: isComponentInstance
              ? 'var(--color-muted-foreground)'
              : selected
                ? 'var(--primary)'
                : 'var(--muted-foreground)',
          }"
        />

        <!-- Label -->
        <div class="flex-1 flex items-center gap-1 min-w-0">
          <span
            v-if="!isEditing"
            :class="[
              'flex-1 cursor-pointer truncate overflow-hidden text-ellipsis whitespace-nowrap text-xs transition-colors hover:text-foreground',
              selected ? 'font-medium' : '',
            ]"
            @pointerdown="captureRenameIntent"
            @dblclick.stop="enterEditMode"
          >
            {{ getNodeLabel(node) }}
          </span>
          <input
            v-else
            ref="editInputRef"
            v-model="editValue"
            type="text"
            class="flex-1 min-w-0 text-xs px-1.5 py-1.51 mr-1.5 text-foreground rounded-md border border-border/50 focus:outline-none bg-background/80"
            @keydown.enter.stop="confirmRename"
            @keydown.escape.stop="cancelRename"
            @click.stop
          />
        </div>

        <MotionLayerBadge
          v-if="!isEditing && hasMotionEnabled"
          compact
          class="mr-1 shrink-0 cursor-pointer hover:text-primary-foreground"
          @click.stop="focusMotionInDesign()"
        />
        <button
          v-if="!isEditing && hasDynamicContent"
          type="button"
          class="mr-1 inline-flex shrink-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[#f97316] transition-colors hover:text-foreground"
          :title="dynamicContentTitle"
          @click.stop="setTab('props')"
        >
          <span :class="[studioIcons.inspectorTabProps, 'size-3']" />
        </button>

        <!-- Indicators / Edit Actions -->
        <div
          v-if="!isEditing"
          class="flex items-center gap-1 pr-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div
            v-if="isBrokenComponent"
            class="text-red-500 flex items-center gap-1"
            title="Broken Component: Missing ID. Please delete and re-add."
          >
            <div :class="[studioIcons.warning, 'w-2.5 h-2.5']" />
          </div>
          <div
            v-if="node.componentRef"
            :class="[studioIcons.lock, 'text-purple-500/70 w-2.5 h-2.5']"
            title="Component Instance (collapsed in layer tree)"
          />
          <div
            v-if="getHydrationMode(node)"
            class="text-[9px] px-1 rounded bg-cyan-500/10 text-cyan-400 font-mono leading-none"
          >
            {{ getHydrationMode(node)?.substring(0, 3) }}
          </div>
          <div
            v-if="
              typeof node.styles?.display === 'object' &&
              Object.values(node.styles.display).includes('none')
            "
            :class="[studioIcons.eyeOff, 'text-neutral-500 w-2.25 h-2.25']"
          />
        </div>
        <div v-else class="flex items-center gap-1 pr-1.5">
          <button
            class="flex items-center justify-center hover:bg-green-500/20 rounded p-0.5 transition-colors"
            @click.stop="confirmRename"
            title="Accept"
          >
            <div
              :class="[studioIcons.checkCircleLinear, 'w-3 h-3 text-green-400']"
            />
          </button>
          <button
            class="flex items-center justify-center hover:bg-red-500/20 rounded p-0.5 transition-colors"
            @click.stop="cancelRename"
            title="Cancel"
          >
            <div
              :class="[studioIcons.closeCircleBold, 'w-3 h-3 text-red-400']"
            />
          </button>
        </div>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent class="w-48">
      <ContextMenuItem @select="handleCopy" class="text-xs">
        <div :class="[studioIcons.copy, 'mr-2 h-3.5 w-3.5']" />
        Copy
      </ContextMenuItem>
      <ContextMenuItem @select="handlePaste" class="text-xs">
        <div :class="[studioIcons.clipboard, 'mr-2 h-3.5 w-3.5']" />
        Paste
      </ContextMenuItem>
      <ContextMenuSeparator class="bg-border" />
      <ContextMenuItem @select="handleRename" class="text-xs">
        <div :class="[studioIcons.rename, 'mr-2 h-3.5 w-3.5']" />
        {{ t("common.rename") }}
      </ContextMenuItem>
      <ContextMenuItem @select="handleDuplicate" class="text-xs">
        <div :class="[studioIcons.copy, 'mr-2 h-3.5 w-3.5']" />
        Duplicate
      </ContextMenuItem>
      <ContextMenuItem
        v-if="!isComponentInstance"
        @select="handleCreateComponent"
        class="text-xs"
      >
        <div :class="[studioIcons.createComponent, 'mr-2 h-3.5 w-3.5']" />
        {{ t("composer.toolbar.createComponent") }}
      </ContextMenuItem>
      <ContextMenuSeparator class="bg-border" />
      <ContextMenuLabel class="text-2xs! text-muted-foreground px-2 py-1.5">
        WRAP IN:
      </ContextMenuLabel>
      <ContextMenuItem @select="handleWrapInContainer" class="text-xs">
        <div :class="[studioIcons.grid, 'mr-2 h-3.5 w-3.5']" />
        Container
      </ContextMenuItem>
      <ContextMenuItem @select="handleWrapInSection" class="text-xs">
        <div :class="[studioIcons.galleryWide, 'mr-2 h-3.5 w-3.5']" />
        Section
      </ContextMenuItem>
      <template v-if="replaceWithOptions.length > 0">
        <ContextMenuSeparator class="bg-border" />
        <ContextMenuLabel class="text-2xs! text-muted-foreground px-2 py-1.5">
          REPLACE WITH:
        </ContextMenuLabel>
        <ContextMenuItem
          v-for="option in replaceWithOptions"
          :key="option.id"
          class="text-xs"
          @select="handleSwap(option.id)"
        >
          {{ option.label }}
        </ContextMenuItem>
      </template>
      <ContextMenuSeparator v-if="isComponentInstance" class="bg-border" />
      <ContextMenuItem
        v-if="isComponentInstance"
        @select="handleEditComponent"
        class="text-xs"
      >
        <div :class="[studioIcons.penLine, 'mr-2 h-3.5 w-3.5']" />
        Edit Component
      </ContextMenuItem>
      <ContextMenuItem
        v-if="isComponentInstance"
        @select="handleDetachInstance"
        class="text-xs"
      >
        <div :class="[studioIcons.unlink, 'mr-2 h-3.5 w-3.5']" />
        Detach Instance
      </ContextMenuItem>
      <ContextMenuSeparator class="bg-border" />
      <ContextMenuItem
        @select="handleDelete"
        class="text-red-500 focus:text-red-500 text-xs"
      >
        <div :class="[studioIcons.trashBin, 'mr-2 h-3.5 w-3.5']" />
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>

<script setup lang="ts">
import {
  computed,
  ref,
  nextTick,
  onBeforeUnmount,
  onMounted,
  watch,
} from "vue";
import { z } from "zod";
import { normalizeContainerNodeType } from "../../../../lib/blocks/containerTypes";
import { NodeDataSourceSchema } from "../../../../lib/schemas/nodes";
import {
  getCanonicalIconIdFromValue,
  parseCanonicalIconId,
} from "../../../../lib/icons/reference";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
} from "../../../components/ui/context-menu";
import { layerNodeTypeIcons, studioIcons } from "@/lib/icons";
import type { NodeEventHandlers } from "../composables/useLayerNodeActions";
import { log } from "@/lib/utils/logger";
import {
  didDragLeaveElement,
  resolveLayerDropPosition,
} from "../utils/dropTargeting";
import MotionLayerBadge from "../../Inspector/motion/components/MotionLayerBadge.vue";
import { useInspectorState } from "../../Inspector/composables/useInspectorState";
import { useBeacon } from "../../Beacon";
import { useStageSignalBridge } from "../../Core";
import { useStudioI18n } from "@/i18n";

import type { BuilderNode, HydrationMode } from "../../../../lib/types/nodes";
import type { DropIndicatorClass, DropPosition } from "../types";

const RenameLabelSchema = z.string().trim().min(1).max(100);
const MasterIdSchema = z.string().trim().min(1);
const RENAME_DBLCLICK_SELECTION_DELAY_MS = 250;
const LayerNodeReferenceSchema = z
  .object({
    type: z.enum(["instance", "master"]),
    id: z.string().optional(),
    masterId: z.string().optional(),
  })
  .strict();

type LayerNodeReference = z.infer<typeof LayerNodeReferenceSchema>;

// Props & Emits

const props = defineProps<{
  node: BuilderNode;
  selected: boolean;
  expanded: boolean;
  expanding?: boolean;
  hasChildren: boolean;
  canAcceptChildren?: boolean;
  depth: number;
  editingNodeId: string | null;
  hovered: boolean;
  nodeActions: NodeEventHandlers;
  dropIndicatorClass?: DropIndicatorClass;
}>();

const emit = defineEmits<{
  select: [event: MouseEvent];
  hover: [];
  leave: [];
  "toggle-expand": [evt: Event];
  rename: [newLabel: string];
  "edit-start": [nodeId: string];
  "edit-cancel": [];
  "drop-target-change": [
    payload: { targetNode: BuilderNode; position: DropPosition },
  ];
  "drop-target-leave": [];
  "drop-node": [payload: { targetNode: BuilderNode; position: DropPosition }];
  "edit-component": [masterId: string];
}>();

const { setTab, focusMotionInDesign } = useInspectorState();
const { selectedNodeIds } = useBeacon();
const { signalConvertComponent } = useStageSignalBridge();
const { t } = useStudioI18n();

const acceptsInsideDrop = computed(
  () => props.canAcceptChildren ?? props.hasChildren,
);

const hasMotionEnabled = computed(() => props.node.motion?.enabled === true);
const nodeDataSource = computed(() => {
  const parsed = NodeDataSourceSchema.safeParse(props.node.dataSource);
  return parsed.success ? parsed.data : undefined;
});
const hasDynamicContent = computed(() => {
  const dataSource = nodeDataSource.value;
  if (!dataSource) {
    return false;
  }

  const isCmsSource =
    dataSource.type === "cms" || dataSource.type === "collection";
  if (!isCmsSource || !dataSource.collection) {
    return false;
  }

  const hasBindings =
    dataSource.bindings !== undefined &&
    Object.keys(dataSource.bindings).length > 0;
  return dataSource.mode === "list" || hasBindings;
});
const dynamicContentTitle = computed(() => "Dynamic");

const handleCopy = (): void => {
  props.nodeActions.handleCopyBlock(props.node.id);
};

const handlePaste = (): void => {
  void props.nodeActions.handlePasteBlock(props.node.id);
};

const handleDuplicate = (): void => {
  props.nodeActions.handleDuplicateBlock(props.node.id);
};

const handleCreateComponent = (): void => {
  signalConvertComponent(props.node.id);
};

const handleRename = (): void => {
  startRename();
};

const handleDelete = (): void => {
  const selected = selectedNodeIds.value;
  if (selected.length > 1 && selected.includes(props.node.id)) {
    props.nodeActions.handleDeleteBlocks(selected);
  } else {
    props.nodeActions.handleDeleteBlock(props.node.id);
  }
};

const handleWrapInContainer = (): void => {
  props.nodeActions.handleWrapInContainer(props.node.id);
};

const handleWrapInSection = (): void => {
  props.nodeActions.handleWrapInSection(props.node.id);
};

const replaceWithOptions = computed(() => {
  const selected = selectedNodeIds.value;
  if (selected.length > 1 && selected.includes(props.node.id)) {
    return props.nodeActions.getSwapOptionsForNodes(selected);
  }
  return props.nodeActions.getSwapOptionsForNode(props.node);
});

const handleSwap = (strategyId: string): void => {
  const selected = selectedNodeIds.value;
  // Batch convert when multiselect is active and this node is among the selected
  if (selected.length > 1 && selected.includes(props.node.id)) {
    const swapSequentially = async () => {
      for (const id of selected) {
        await props.nodeActions.swapNode(id, strategyId);
      }
    };
    void swapSequentially();
  } else {
    void props.nodeActions.swapNode(props.node.id, strategyId);
  }
};

const handleEditComponent = (): void => {
  const masterId =
    getNodeReference(props.node)?.masterId ||
    props.node.props?.componentId ||
    props.node.componentRef ||
    props.node.props?.["data-component-ref"];

  log("debug", "[LayerItem] Edit component action triggered", {
    nodeId: props.node.id,
    masterId,
  });

  const parsedMasterId = MasterIdSchema.safeParse(masterId);
  if (parsedMasterId.success) {
    log("debug", "[LayerItem] Emitting edit-component", {
      masterId: parsedMasterId.data,
      nodeId: props.node.id,
    });
    emit("edit-component", parsedMasterId.data);
  } else {
    log("warn", "[LayerItem] No masterId found for component", {
      nodeId: props.node.id,
      nodeType: props.node.type,
    });
  }
};

const handleDetachInstance = (): void => {
  props.nodeActions.handleDetachComponent(props.node.id);
};

// Ref to the layer item element
const layerItemRef = ref<HTMLElement | null>(null);

const scrollSelectedItemIntoView = (): void => {
  nextTick(() => {
    if (!props.selected) return;

    layerItemRef.value?.scrollIntoView({
      behavior: "auto",
      block: "nearest",
    });
  });
};

// Scroll selected items into view, including freshly inserted rows that mount
// already selected and therefore do not trigger the selection watcher.
watch(
  () => props.selected,
  (newSelected) => {
    if (newSelected) scrollSelectedItemIntoView();
  },
);

onMounted(scrollSelectedItemIntoView);

/**
 * Check if node is a component instance (should be collapsed in layer tree).
 * Component instances have type === "Component" and optional componentRef.
 */
const isComponentInstance = computed<boolean>(
  () => props.node?.type === "Component" || !!props.node?.componentRef,
);

const isBrokenComponent = computed<boolean>(() => {
  if (!isComponentInstance.value) return false;
  return !(
    getNodeReference(props.node)?.masterId ||
    props.node.props?.componentId ||
    props.node.componentRef ||
    props.node.props?.["data-component-ref"]
  );
});

// Check if this specific node is in edit mode
const isEditing = computed<boolean>(
  () => props.editingNodeId === props.node.id,
);

const editValue = ref("");
const editInputRef = ref<HTMLInputElement | null>(null);
const selectedAtMs = ref(0);
const renameIntentSelectedAtPointerDown = ref(false);

watch(
  () => props.selected,
  (isSelected) => {
    selectedAtMs.value = isSelected ? Date.now() : 0;
    if (!isSelected) {
      renameIntentSelectedAtPointerDown.value = false;
    }
  },
  { immediate: true },
);

const captureRenameIntent = (): void => {
  renameIntentSelectedAtPointerDown.value = props.selected;
};

const enterEditMode = (): void => {
  const selectionHasSettled =
    props.selected &&
    selectedAtMs.value > 0 &&
    Date.now() - selectedAtMs.value >= RENAME_DBLCLICK_SELECTION_DELAY_MS;

  if (!renameIntentSelectedAtPointerDown.value || !selectionHasSettled) {
    return;
  }

  startRename();
};

const startRename = (): void => {
  emit("edit-start", props.node.id);
  // Use custom label if set, otherwise use the computed label
  editValue.value = props.node.metadata?.label || getNodeLabel(props.node);
  nextTick(() => {
    editInputRef.value?.focus();
    editInputRef.value?.select();
  });
};

const confirmRename = (): void => {
  const parsedLabel = RenameLabelSchema.safeParse(editValue.value);
  if (parsedLabel.success) {
    emit("rename", parsedLabel.data);
    editValue.value = "";
  }
};

const cancelRename = (): void => {
  emit("edit-cancel");
  editValue.value = "";
  renameIntentSelectedAtPointerDown.value = false;
};

function getNodeLabel(node: BuilderNode): string {
  // Use custom label if set in metadata
  if (node.metadata?.label) {
    return node.metadata.label;
  }

  // Helper to format slug/id to title case
  const formatName = (name: string): string => {
    if (!name) return "";
    return name
      .split("-")
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  // Component instances show the component name
  if (node.componentRef) return formatName(node.componentRef);

  if (node.type === "Component") {
    if (node.props?.componentId)
      return formatName(node.props.componentId as string);
    const nodeReference = getNodeReference(node);
    if (nodeReference?.masterId) return formatName(nodeReference.masterId);
    if (nodeReference?.id) return formatName(nodeReference.id);
  }

  // Check data attribute for expanded components
  if (node.props?.["data-component-ref"]) {
    return formatName(node.props["data-component-ref"] as string);
  }

  if (node.type === "Code" || node.type === "code") {
    return "Code";
  }

  if (normalizeContainerNodeType(node.type).toLowerCase() === "svg") {
    return "SVG";
  }

  const getNonEmptyStringProp = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const text = getNonEmptyStringProp(node.props?.text);
  if (text) return text;
  const heading = getNonEmptyStringProp(node.props?.heading);
  if (heading) return heading;
  const title = getNonEmptyStringProp(node.props?.title);
  if (title) return title;
  if (normalizeContainerNodeType(node.type).toLowerCase() === "icon") {
    const canonicalId = getCanonicalIconIdFromValue(node.props?.icon);
    const parsed = canonicalId ? parseCanonicalIconId(canonicalId) : null;

    if (parsed?.name) {
      return formatName(parsed.name);
    }
  }
  const content = getNonEmptyStringProp(node.props?.content);
  if (content) {
    return content.length > 30 ? content.substring(0, 30) + "..." : content;
  }
  const alt = getNonEmptyStringProp(node.props?.alt);
  if (alt) {
    return alt;
  }

  return node.type.charAt(0).toUpperCase() + node.type.slice(1);
}

function getNodeReference(node: BuilderNode): LayerNodeReference | null {
  const candidate = Reflect.get(node, "reference");
  const parsedReference = LayerNodeReferenceSchema.safeParse(candidate);
  return parsedReference.success ? parsedReference.data : null;
}

/**
 * Get icon for node type
 */
function getNodeIconClass(node: BuilderNode): string {
  const hasIconChild = node.children.some(
    (child) => child.type?.toLowerCase() === "icon",
  );
  const isIconList =
    normalizeContainerNodeType(node.type).toLowerCase() === "list" &&
    node.children.some(
      (child) =>
        child.type?.toLowerCase() === "listitem" &&
        child.children.some(
          (grandchild) => grandchild.type?.toLowerCase() === "icon",
        ),
    );

  if (node.type === "Component" || node.componentRef) {
    return layerNodeTypeIcons.component;
  }

  const nodeType = normalizeContainerNodeType(node.type).toLowerCase();

  if (nodeType === "list") {
    return isIconList ? layerNodeTypeIcons.listIcon : layerNodeTypeIcons.list;
  }

  if (nodeType === "listitem") {
    return hasIconChild
      ? layerNodeTypeIcons.listitemIcon
      : layerNodeTypeIcons.listitem;
  }

  return layerNodeTypeIcons[nodeType] ?? layerNodeTypeIcons.default;
}

/**
 * Get hydration indicator
 */
function getHydrationMode(node: BuilderNode): HydrationMode | null {
  return node.hydration?.mode || null;
}

// Drag & Drop - Auto-expand on hover

const expandTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const previewPosition = ref<DropPosition | null>(null);

const cancelExpandTimer = (): void => {
  if (expandTimer.value) {
    clearTimeout(expandTimer.value);
    expandTimer.value = null;
  }
};

const resolveDropPositionForEvent = (event: DragEvent): DropPosition => {
  const targetElement = layerItemRef.value;
  if (!targetElement) {
    return acceptsInsideDrop.value ? "inside" : "after";
  }

  const rect = targetElement.getBoundingClientRect();

  return resolveLayerDropPosition({
    clientY: event.clientY,
    top: rect.top,
    height: rect.height,
    allowInside: acceptsInsideDrop.value,
  });
};

const handleDragOver = (e: DragEvent): void => {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "move";
  }

  const position = resolveDropPositionForEvent(e);
  previewPosition.value = position;
  emit("drop-target-change", {
    targetNode: props.node,
    position,
  });

  // Only auto-expand collapsed nodes that have children to reveal.
  if (props.hasChildren && !props.expanded && position === "inside") {
    if (!expandTimer.value) {
      expandTimer.value = setTimeout(() => {
        emit("toggle-expand", e);
        expandTimer.value = null;
      }, 600); // 600ms delay to prevent accidental expansion
    }
  } else {
    cancelExpandTimer();
  }
};

const handleDragLeave = (event: DragEvent): void => {
  const row = layerItemRef.value;
  if (row && !didDragLeaveElement(event, row)) {
    return;
  }

  cancelExpandTimer();
  previewPosition.value = null;
  emit("drop-target-leave");
};

const handleDrop = (e: DragEvent): void => {
  e.preventDefault();
  e.stopPropagation();

  cancelExpandTimer();

  emit("drop-node", {
    targetNode: props.node,
    position: previewPosition.value ?? resolveDropPositionForEvent(e),
  });
  previewPosition.value = null;
  emit("drop-target-leave");
};

onBeforeUnmount(cancelExpandTimer);
</script>

<style scoped>
.layer-item--drop-inside {
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--primary) 42%, transparent);
}

.layer-drop-indicator {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  pointer-events: none;
  background: var(--primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 30%, transparent);
}

.layer-drop-indicator--before {
  top: 0;
}

.layer-drop-indicator--after {
  bottom: 0;
}
</style>
