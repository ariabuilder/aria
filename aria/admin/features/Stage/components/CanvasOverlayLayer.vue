<script setup lang="ts">
/**
 * CanvasOverlayLayer. vue Parent-level overlay component that renders
 * all visual overlays for the canvas.
 */

import { computed, onMounted, toRef, type CSSProperties } from "vue";
import { Button } from "@/components/ui/button";
import { ColorField } from "@/components/ui/color-picker";
import { useToolbarTextColorContext } from "../composables/useToolbarTextColorContext";
import {
  useCanvasOverlays,
  TOOLBAR_ICONS,
  type CanvasAffordanceDescriptor,
  type ToolbarActionName,
} from "../../../composables/useCanvasOverlays";
import { OVERLAY_Z_INDEX } from "@/lib/zIndex";
import { getContentHeadingLevel } from "../../Inspector/composables/useContentContract";
import { useSelectedNodeState } from "../../Core/composables/useSelectedNodeState";
import { useCanvasSignalBridge } from "../../Core/composables/useCanvasSignalBridge";
import { useDragDrop } from "../../../composables/useDragDrop";
import ToolbarHeadingLevelPicker from "./ToolbarHeadingLevelPicker.vue";
import SelectionToolbarCmsControls from "./SelectionToolbarCmsControls.vue";
import SelectionToolbarMotionControl from "./SelectionToolbarMotionControl.vue";
import { useStudioI18n } from "@/i18n";
import { resolveCanvasAffordanceVisualLayout } from "../utils/canvasAffordanceLayout";
import { shouldHideSelectionToolbar } from "../utils/selectionToolbarVisibility";

// PROPS & EMITS

const props = defineProps<{
  iframeRef?: HTMLIFrameElement | null;
}>();

const emit = defineEmits<{
  (e: "toolbar-action", action: ToolbarActionName, nodeId: string): void;
  (
    e: "toolbar-style-change",
    property: string,
    value: string,
    nodeId: string,
  ): void;
  (
    e: "toolbar-props-change",
    updates: Record<string, unknown>,
    nodeId: string,
  ): void;
  (e: "select-affordance", descriptor: CanvasAffordanceDescriptor): void;
  (e: "ready"): void;
}>();
const { t } = useStudioI18n();

const { selectedNode } = useSelectedNodeState();
const { signalStyleUpdate } = useCanvasSignalBridge();
const { isDragging, dragSource } = useDragDrop();

const hideToolbarDuringLibraryDrag = computed(() =>
  shouldHideSelectionToolbar(isDragging.value, dragSource.value),
);

const TEXT_NODE_TYPES = new Set([
  "heading",
  "text",
  "paragraph",
  "span",
  "richtext",
  "rich-text",
]);

const iframeRefProp = toRef(props, "iframeRef");
const overlays = useCanvasOverlays({
  iframeRef: computed(() => iframeRefProp.value ?? null),
  debug: import.meta.env.DEV,
});

const isTextNode = computed(() => {
  const t = overlays.selection.nodeType?.toLowerCase();
  return Boolean(t && TEXT_NODE_TYPES.has(t));
});

const isHeadingNode = computed(() => {
  return overlays.selection.nodeType?.toLowerCase() === "heading";
});

const headingLevel = computed(() => getContentHeadingLevel(selectedNode.value));

const toolbarTextColor = computed(() => {
  if (!isTextNode.value) return "";

  const colorStyle = selectedNode.value?.styles?.color;
  if (colorStyle) {
    const explicit = (colorStyle as Record<string, string>).base ?? "";
    if (explicit) return explicit;
  }

  const el = overlays.selection.element as HTMLElement | null;
  if (el) {
    const view = (el.ownerDocument as Document).defaultView;
    if (view) {
      return view.getComputedStyle(el).color || "";
    }
  }

  return "";
});

const { toolbarContrastBackground, resolvedToolbarContrastBackground } =
  useToolbarTextColorContext({
    selectedNode,
    iframeElement: computed(
      () => overlays.selection.element as HTMLElement | null,
    ),
  });

function handleColorChange(value: string): void {
  const nodeId = overlays.selection.nodeId;
  if (!nodeId) return;
  signalStyleUpdate({
    nodeId,
    styles: { base: { color: value } },
  });
  emit("toolbar-style-change", "color", value, nodeId);
}

function handleHeadingLevelChange(level: number): void {
  const nodeId = overlays.selection.nodeId;
  if (!nodeId || !Number.isInteger(level) || level < 1 || level > 6) return;
  if (headingLevel.value === level) return;

  emit("toolbar-props-change", { level }, nodeId);
}

const TOOLBAR_PADDING = 2;
const TOOLBAR_OFFSET = 4;
const MIN_TOP_SPACE = 60;

const toolbarStyle = computed((): CSSProperties => {
  if (
    !overlays.selection.visible ||
    !overlays.selection.position ||
    hideToolbarDuringLibraryDrag.value
  ) {
    return { display: "none" };
  }

  const { left, top, width, height } = overlays.selection.position;
  const centerX = left + width / 2;
  const clampedCenterX = Math.max(
    TOOLBAR_PADDING,
    Math.min(centerX, window.innerWidth - TOOLBAR_PADDING),
  );

  const spaceAbove = top - TOOLBAR_PADDING - MIN_TOP_SPACE;
  const placeAbove = spaceAbove >= 32;

  if (placeAbove) {
    return {
      display: "flex",
      left: `${clampedCenterX}px`,
      top: `${top - TOOLBAR_OFFSET}px`,
      transform: "translate(-50%, -100%)",
      zIndex: OVERLAY_Z_INDEX.toolbar,
    };
  }

  return {
    display: "flex",
    left: `${clampedCenterX}px`,
    top: `${top + height + TOOLBAR_OFFSET}px`,
    transform: "translate(-50%, 0)",
    zIndex: OVERLAY_Z_INDEX.toolbar,
  };
});

onMounted(() => {
  emit("ready");
});

defineExpose({
  showHover: overlays.showHover,
  hideHover: overlays.hideHover,
  showSelection: overlays.showSelection,
  hideSelection: overlays.hideSelection,
  updateSelectionPosition: overlays.updateSelectionPosition,
  showInsertion: overlays.showInsertion,
  showFrameInsertion: overlays.showFrameInsertion,
  hideInsertion: overlays.hideInsertion,
  showAddElementsDropFeedback: overlays.showAddElementsDropFeedback,
  hideAddElementsDropFeedback: overlays.hideAddElementsDropFeedback,
  showFrameAffordances: overlays.showFrameAffordances,
  hideAffordances: overlays.hideAffordances,
  showDropZones: overlays.showDropZones,
  activateDropZone: overlays.activateDropZone,
  hideDropZones: overlays.hideDropZones,
  schedulePositionUpdate: overlays.schedulePositionUpdate,
  hover: overlays.hover,
  selection: overlays.selection,
});

function handleToolbarAction(action: ToolbarActionName): void {
  const nodeId = overlays.selection.nodeId;
  if (!nodeId) return;

  emit("toolbar-action", action, nodeId);
}

const insertionStyle = computed(() => {
  if (!overlays.insertion.visible || !overlays.insertion.position) {
    return { display: "none" };
  }
  const { left, top, width } = overlays.insertion.position;
  const isVertical = overlays.insertion.orientation === "vertical";

  const style: CSSProperties = {
    display: "block",
    position: "fixed",
    left: "0",
    top: "0",
    translate: `${left}px ${top}px`,
    width: isVertical ? "3px" : `${width}px`,
    height: isVertical ? `${overlays.insertion.position.height}px` : "3px",
    zIndex: OVERLAY_Z_INDEX.insertion,
  };
  return style;
});

const addElementsInsertionStyle = computed((): CSSProperties => {
  const position = overlays.addElementsDrop.placeholder;
  if (!overlays.addElementsDrop.visible || !position) {
    return { display: "none" };
  }

  const isVertical = overlays.addElementsDrop.orientation === "vertical";
  return {
    display: "block",
    position: "fixed",
    left: "0",
    top: "0",
    translate: `${position.left}px ${position.top}px`,
    width: isVertical ? "3px" : `${position.width}px`,
    height: isVertical ? `${position.height}px` : "3px",
    zIndex: OVERLAY_Z_INDEX.insertion,
  };
});

const addElementsTargetStyle = computed((): CSSProperties => {
  const position = overlays.addElementsDrop.target;
  if (!overlays.addElementsDrop.visible || !position) {
    return { display: "none" };
  }

  return {
    display: "block",
    position: "fixed",
    left: "0",
    top: "0",
    translate: `${position.left}px ${position.top}px`,
    width: `${position.width}px`,
    height: `${position.height}px`,
    zIndex: OVERLAY_Z_INDEX.dropZone,
  };
});

function getAffordanceStyle(
  descriptor: CanvasAffordanceDescriptor,
): CSSProperties {
  const layout = resolveCanvasAffordanceVisualLayout(descriptor);
  return {
    position: "fixed",
    left: "0",
    top: "0",
    translate: `${layout.left}px ${layout.top}px`,
    width: `${layout.width}px`,
    height: `${layout.height}px`,
    zIndex: OVERLAY_Z_INDEX.dropZone + Math.min(descriptor.depth, 20),
  };
}

function isCollapsedAffordance(
  descriptor: CanvasAffordanceDescriptor,
): boolean {
  return descriptor.presentation === "collapsed-rail";
}

function getAffordanceLabel(descriptor: CanvasAffordanceDescriptor): string {
  switch (descriptor.kind) {
    case "empty-node":
      return `Empty ${descriptor.nodeType}`;
    case "empty-component":
      return `Empty ${descriptor.nodeType} component`;
    case "missing-media":
      return `Missing ${descriptor.nodeType}`;
    default: {
      const exhaustive: never = descriptor;
      return exhaustive;
    }
  }
}

interface ToolbarButton {
  action: ToolbarActionName;
  title: string;
  iconPath: string;
  isDanger?: boolean;
  show: boolean;
}

const toolbarButtons = computed((): ToolbarButton[] => {
  const { isComponent } = overlays.selection;

  const buttons: ToolbarButton[] = [];

  if (isComponent) {
    buttons.push(
      {
        action: "edit-component",
        title: t("composer.toolbar.editComponent"),
        iconPath: TOOLBAR_ICONS["edit-component"],
        show: true,
      },
      {
        action: "detach-component",
        title: t("composer.toolbar.detachInstance"),
        iconPath: TOOLBAR_ICONS["detach-component"],
        show: true,
      },
    );
  } else {
    buttons.push({
      action: "create-component",
      title: t("composer.toolbar.createComponent"),
      iconPath: TOOLBAR_ICONS["create-component"],
      show: true,
    });
  }

  buttons.push(
    {
      action: "duplicate",
      title: t("common.duplicate"),
      iconPath: TOOLBAR_ICONS.duplicate,
      show: true,
    },
    {
      action: "delete",
      title: t("common.delete"),
      iconPath: TOOLBAR_ICONS.delete,
      isDanger: true,
      show: true,
    },
  );

  return buttons.filter((b) => b.show);
});

const showSelectParent = computed(() => overlays.selection.hasParent);

const isImageNode = computed(() => {
  const t = overlays.selection.nodeType?.toLowerCase();
  return t === "image";
});

const showNodeTypeControls = computed(
  () => isTextNode.value || isHeadingNode.value || isImageNode.value,
);

function formatNodeTypeLabel(type: string | null | undefined): string {
  const value = String(type ?? "").trim();
  if (!value) {
    return t("composer.toolbar.element");
  }
  if (value.toLowerCase() === "svg") {
    return "SVG";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const nodeTypeLabel = computed(() => {
  return formatNodeTypeLabel(overlays.selection.nodeType);
});
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed inset-0 overflow-visible"
      :style="{ zIndex: OVERLAY_Z_INDEX.hover }"
      data-aria-canvas-overlay-root="true"
    >
      <div
        v-if="overlays.selection.visible"
        class="selection-toolbar fixed pointer-events-auto flex h-9 max-w-[calc(100vw-16px)] select-none items-center whitespace-nowrap rounded border-solid border-border bg-background px-1 text-xs text-foreground"
        :style="toolbarStyle"
        data-overlay="toolbar"
        :data-node-id="overlays.selection.nodeId"
      >
        <div class="flex min-w-0 items-center gap-1 px-1">
          <Button
            v-if="showSelectParent"
            variant="sidebar-action"
            size="icon-sm"
            class="shrink-0"
            data-action="select-parent"
            :title="t('composer.toolbar.selectParent')"
            @click.stop.prevent="handleToolbarAction('select-parent')"
          >
            <span
              :class="[TOOLBAR_ICONS['select-parent'], 'size-3.5 shrink-0']"
            />
          </Button>
          <span
            class="max-w-28 truncate px-1 text-xs font-medium text-muted-foreground capitalize"
          >
            {{ nodeTypeLabel }}
          </span>
        </div>

        <template v-if="showNodeTypeControls">
          <div
            class="mx-1.5 h-3 shrink-0 border-l border-solid border-border/70"
            aria-hidden="true"
          />

          <div class="flex items-center gap-1 px-2" @click.stop>
            <ColorField
              v-if="isTextNode"
              :model-value="toolbarTextColor"
              variant="toolbar"
              layout="unified"
              show-design-colors
              show-alpha
              content-side="bottom"
              content-align="start"
              :contrast-against="toolbarContrastBackground"
              :resolved-contrast-against="resolvedToolbarContrastBackground"
              @update:model-value="handleColorChange"
            />

            <ToolbarHeadingLevelPicker
              v-if="isHeadingNode"
              :model-value="headingLevel"
              @select="handleHeadingLevelChange"
            />

            <Button
              v-if="isImageNode"
              type="button"
              variant="headerAction"
              size="icon-sm"
              class="shrink-0"
              :title="t('inspector.media.chooseImage')"
              @click.stop.prevent="handleToolbarAction('open-media-picker')"
            >
              <span
                :class="[
                  TOOLBAR_ICONS['open-media-picker'],
                  'size-3.5 shrink-0',
                ]"
              />
            </Button>
          </div>
        </template>

        <SelectionToolbarCmsControls />
        <SelectionToolbarMotionControl />

        <div
          class="mx-1.5 h-3 shrink-0 border-l border-solid border-border/70"
          aria-hidden="true"
        />

        <div class="flex items-center gap-0.5 px-0.5">
          <Button
            v-for="btn in toolbarButtons"
            :key="btn.action"
            variant="sidebar-action"
            size="icon-sm"
            :class="[
              btn.isDanger
                ? 'hover:border-destructive/50 hover:text-destructive'
                : '',
            ]"
            :data-action="btn.action"
            :title="btn.title"
            @click.stop.prevent="handleToolbarAction(btn.action)"
          >
            <span :class="[btn.iconPath, 'size-4']" />
          </Button>
        </div>
      </div>

      <div
        class="pointer-events-none fixed bg-primary will-change-transform"
        :style="insertionStyle"
        data-overlay="insertion"
      />

      <div
        class="pointer-events-none fixed rounded-sm border-2 border-dashed border-primary/70 bg-transparent will-change-transform"
        :style="addElementsTargetStyle"
        data-overlay="add-elements-target"
      />

      <div
        class="pointer-events-none fixed rounded-sm bg-primary shadow-[0_0_4px_color-mix(in_srgb,var(--primary)_35%,transparent)] will-change-transform"
        :style="addElementsInsertionStyle"
        data-overlay="add-elements-insertion"
      />

      <button
        v-for="affordance in overlays.affordances"
        :key="`${affordance.kind}:${affordance.nodeId}`"
        type="button"
        class="pointer-events-auto fixed flex min-h-6 min-w-6 items-center justify-center overflow-visible p-0 text-[10px] font-medium text-primary"
        :class="
          isCollapsedAffordance(affordance)
            ? 'bg-transparent'
            : 'overflow-hidden rounded-sm border border-dashed border-primary/70 bg-primary/10 p-1'
        "
        :style="getAffordanceStyle(affordance)"
        :aria-label="getAffordanceLabel(affordance)"
        :data-overlay="affordance.kind"
        :data-node-id="affordance.nodeId"
        :data-presentation="affordance.presentation"
        @pointerdown.stop.prevent="emit('select-affordance', affordance)"
      >
        <span
          v-if="isCollapsedAffordance(affordance)"
          class="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-primary/70"
          aria-hidden="true"
        />
        <span
          class="rounded-sm bg-background px-2 py-0.5"
          :class="
            isCollapsedAffordance(affordance)
              ? 'pointer-events-auto absolute right-1 top-1/2 -translate-y-1/2'
              : 'pointer-events-none relative'
          "
          aria-hidden="true"
        >
          {{ getAffordanceLabel(affordance) }}
        </span>
      </button>

      <template v-if="overlays.dropZones.visible">
        <div
          v-for="zone in overlays.dropZones.zones"
          :key="zone.id"
          class="pointer-events-none fixed border-2 border-dashed border-primary bg-background transition-all duration-150"
          :class="{
            'shadow-[inset_0_0_8px_color-mix(in_srgb,var(--primary)_15%,transparent)]':
              zone.isActive,
          }"
          :style="{
            position: 'fixed',
            zIndex: OVERLAY_Z_INDEX.dropZone,
            left: `${zone.position.left}px`,
            top: `${zone.position.top}px`,
            width: `${zone.position.width}px`,
            height: `${zone.position.height}px`,
          }"
          data-overlay="drop-zone"
          :data-zone-id="zone.id"
        />
      </template>
    </div>
  </Teleport>
</template>
