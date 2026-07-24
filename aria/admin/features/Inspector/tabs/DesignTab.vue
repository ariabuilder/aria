<script setup lang="ts">
/**
 * DesignTab - Design Properties Panel
 *
 * Displays styling properties for the selected element.
 * Uses useDesignEditor composable for all logic.
 *
 * @component
 */
import { ref, computed, inject, onMounted, watch } from "vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isLinkableContainerNodeType, isStructuralContainerNodeType } from "../../../../lib/blocks/containerTypes";
import { useDesignEditor } from "../composables/useDesignEditor";
import { useSelectedNodeState, useSelectionTreeState } from "../../Core";
import type { BuilderNode, LayoutDSL } from "../../../../lib/types/nodes";
import {
  findEditableListContextNode,
  findNearestListItemContextNode,
} from "../lib/findEditableListContextNode";

import ClassesProperty from "../inputs/ClassesProperty.vue";
import SizeProperty from "../inputs/SizeProperty.vue";
import PositionProperty from "../inputs/PositionProperty.vue";
import TransformProperty from "../inputs/TransformProperty.vue";
import BorderProperty from "../inputs/BorderProperty.vue";
import CornerProperty from "../inputs/CornerProperty.vue";
import DisplayProperty from "../inputs/DisplayProperty.vue";
import ListProperty from "../inputs/ListProperty.vue";
import IconListProperty from "../inputs/IconListProperty.vue";
import ShadowProperty from "../inputs/ShadowProperty.vue";
import FilterProperty from "../inputs/FilterProperty.vue";
import OpacityProperty from "../inputs/OpacityProperty.vue";
import LinkProperty from "../inputs/LinkProperty.vue";
import ButtonProperty from "../inputs/ButtonProperty.vue";
import ImageProperty from "../inputs/ImageProperty.vue";
import VideoProperty from "../inputs/VideoProperty.vue";
import CodeProperty from "../inputs/CodeProperty.vue";
import SvgProperty from "../inputs/SvgProperty.vue";
import IconProperty from "../inputs/IconProperty.vue";
import ComponentInstanceProperty from "../inputs/ComponentInstanceProperty.vue";
import TypographyProperty from "../inputs/TypographyProperty.vue";
import SpacingProperty from "../inputs/SpacingProperty.vue";
import BackgroundProperty from "../inputs/BackgroundProperty.vue";
import AttributesProperty from "../inputs/AttributesProperty.vue";
import TextProperty from "../inputs/TextProperty.vue";
import NavigationProperty from "../inputs/NavigationProperty.vue";
import NavItemProperty from "../inputs/NavItemProperty.vue";

// PROPS & EMITS

interface Props {
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
  currentLayoutSlug?: string;
  currentLayout?: LayoutDSL | null;
  layoutMetadata?: {
    layoutType?: string;
    slots?: Array<{ name: string; required: boolean }>;
    description?: string;
  };
}

const props = withDefaults(defineProps<Props>(), {
  currentItemType: undefined,
  currentItemSlug: undefined,
  currentLayoutSlug: undefined,
  currentLayout: null,
  layoutMetadata: undefined,
});

const emit = defineEmits<{
  updateLayout: [layoutSlug: string];
  updateLayoutMetadata: [metadata: NonNullable<Props["layoutMetadata"]>];
}>();

const isMounted = ref(false);
onMounted(() => {
  isMounted.value = true;
});

const { selectedNode: selectedBlock } = useSelectedNodeState();
const { selectionTreeRootNodes } = useSelectionTreeState();

function isIconListNode(node: BuilderNode | null | undefined): boolean {
  if (!node || node.type?.toLowerCase() !== "list") {
    return false;
  }

  return node.children.some(
    (child) =>
      child.type?.toLowerCase() === "listitem" &&
      child.children.some(
        (grandchild) => grandchild.type?.toLowerCase() === "icon",
      ),
  );
}

const listContextNode = computed(() => {
  const selectedId = selectedBlock.value?.id;
  if (!selectedId) {
    return null;
  }

  return findEditableListContextNode(selectionTreeRootNodes.value, selectedId);
});
const listItemContextNode = computed(() => {
  const selectedId = selectedBlock.value?.id;
  if (!selectedId) {
    return null;
  }

  return findNearestListItemContextNode(
    selectionTreeRootNodes.value,
    selectedId,
  );
});
const isIconListContext = computed(() => isIconListNode(listContextNode.value));

const selectedElement = computed(() => {
  if (!selectedBlock.value) {
    return {
      type: "none",
      hasText: false,
      hasImage: false,
      hasVideo: false,
      hasLink: false,
      isButton: false,
      hasList: false,
      hasCode: false,
      hasSvg: false,
      hasIcon: false,
      hasComponent: false,
      isNavigation: false,
      isNavItem: false,
      isContainer: false,
      supportsHtmlTag: false,
    };
  }

  const block = selectedBlock.value;
  const blockType = block.type?.toLowerCase() || "";

  return {
    type: blockType,
    hasText: [
      "text",
      "heading",
      "button",
      "link",
      "paragraph",
      "span",
      "input",
      "textarea",
      "select",
    ].includes(blockType),
    hasImage: blockType === "image",
    hasVideo: blockType === "video",
    hasLink:
      listItemContextNode.value !== null ||
      ["link", "button", "heading", "text", "paragraph", "span"].includes(
        blockType,
      ) ||
      isLinkableContainerNodeType(blockType),
    isButton: blockType === "button",
    hasList: listContextNode.value !== null,
    hasCode: blockType === "code",
    hasSvg: blockType === "svg",
    hasIcon: blockType === "icon",
    hasComponent: blockType === "component",
    isNavigation: blockType === "navigation",
    isNavItem: blockType === "nav-item",
    isContainer: isStructuralContainerNodeType(blockType),
    supportsHtmlTag:
      isStructuralContainerNodeType(blockType) ||
      ["text", "paragraph", "heading", "span"].includes(blockType),
  };
});

const showNavigationSection = computed(
  () => selectedElement.value.isNavigation,
);

const showNavItemSection = computed(() => selectedElement.value.isNavItem);

const availableSectionIds = computed(() => {
  const sectionIds = ["classes"];

  // Editable text content (text, heading, paragraph, span — but not button
  // which has its own dedicated section)
  if (selectedElement.value.hasText && !selectedElement.value.isButton) {
    sectionIds.push("content");
  }

  // Typography comes right after content so the full text-editing workflow
  // (what you write → how it looks) is grouped at the top
  if (selectedElement.value.hasText) {
    sectionIds.push("typography");
  }

  // Image source / alt / fit settings
  if (selectedElement.value.hasImage) {
    sectionIds.push("image");
  }

  if (showNavigationSection.value) {
    sectionIds.push("navigation");
  }

  if (showNavItemSection.value) {
    sectionIds.push("nav-item");
  }

  // Video source / playback / display settings
  if (selectedElement.value.hasVideo) {
    sectionIds.push("video");
  }

  // Button variant / appearance (replaces the generic link section for buttons)
  if (selectedElement.value.isButton) {
    sectionIds.push("button");
  }

  // Link destination — shown for text/heading/paragraph/span/link/listitem
  if (selectedElement.value.hasLink && !isIconListContext.value) {
    sectionIds.push("link");
  }

  if (selectedElement.value.hasCode) {
    sectionIds.push("code");
  }

  if (selectedElement.value.hasSvg) {
    sectionIds.push("svg");
  }

  if (selectedElement.value.hasIcon && !isIconListContext.value) {
    sectionIds.push("icon");
  }

  if (selectedElement.value.hasComponent) {
    sectionIds.push("component-instance");
  }

  if (selectedElement.value.hasList) {
    sectionIds.push(isIconListContext.value ? "icon-list" : "list");
  }

  sectionIds.push("display");

  if (!isIconListContext.value) {
    sectionIds.push("size");
  }

  sectionIds.push("spacing", "position", "transform");

  sectionIds.push(
    "background",
    "border",
    "corner",
    "shadow",
    "filter",
    "opacity",
  );

  if (selectedElement.value.supportsHtmlTag) {
    sectionIds.push("html-tag");
  }

  return sectionIds;
});

const openSectionId = ref<string | null>("display");
const classesSectionOpen = ref(true);
const AUTO_OPEN_SECTION_BY_NODE_TYPE: Record<string, string> = {
  // Content-first: open the primary editing section for the node type
  button: "button",
  text: "typography",
  heading: "typography",
  paragraph: "typography",
  span: "typography",
  link: "link",
  image: "image",
  video: "video",
  code: "code",
  svg: "svg",
  icon: "icon",
  navigation: "navigation",
  "nav-item": "nav-item",
  list: "list",
};

function getAutoOpenSectionId(
  nodeType: string,
  sectionIds: string[],
): string | null {
  if (
    sectionIds.includes("icon-list") &&
    ["list", "listitem", "icon", "text", "heading", "paragraph"].includes(
      nodeType,
    )
  ) {
    return "icon-list";
  }

  const candidate = AUTO_OPEN_SECTION_BY_NODE_TYPE[nodeType];
  if (candidate && sectionIds.includes(candidate)) {
    return candidate;
  }

  // Structural containers (div, section, article, etc.) all default to display
  if (
    isStructuralContainerNodeType(nodeType) &&
    sectionIds.includes("display")
  ) {
    return "display";
  }

  return null;
}

watch(
  availableSectionIds,
  (sectionIds) => {
    if (sectionIds.length === 0) {
      openSectionId.value = null;
      return;
    }

    if (
      openSectionId.value !== null &&
      sectionIds.includes(openSectionId.value)
    ) {
      return;
    }

    openSectionId.value = sectionIds[0] ?? null;
  },
  { immediate: true },
);

watch(
  () =>
    [
      selectedBlock.value?.id,
      selectedBlock.value?.type?.toLowerCase() ?? "",
    ] as const,
  ([nextId, nextType], previousSelection) => {
    const previousId = previousSelection?.[0];

    if (!nextId) {
      return;
    }

    const autoOpenSectionId = getAutoOpenSectionId(
      nextType,
      availableSectionIds.value,
    );

    if (!autoOpenSectionId) {
      return;
    }

    if (nextId === previousId && openSectionId.value === autoOpenSectionId) {
      return;
    }

    openSectionId.value = autoOpenSectionId;
  },
  { flush: "post", immediate: true },
);

function expandAll() {
  classesSectionOpen.value = true;
  openSectionId.value = availableSectionIds.value[0] ?? null;
}

function collapseAll() {
  openSectionId.value = null;
}

function isSectionOpen(sectionId: string): boolean {
  if (sectionId === "classes") {
    return classesSectionOpen.value;
  }

  return openSectionId.value === sectionId;
}

function setSectionOpen(sectionId: string, isOpen: boolean): void {
  if (sectionId === "classes") {
    classesSectionOpen.value = isOpen;
    return;
  }

  if (isOpen) {
    openSectionId.value = sectionId;
    return;
  }

  if (openSectionId.value === sectionId) {
    openSectionId.value = null;
  }
}

defineExpose({
  expandAll,
  collapseAll,
});
</script>

<template>
  <ScrollArea
    class="flex-1 h-full w-full *:data-[slot=scroll-area-scrollbar]:hidden"
  >
    <div class="w-full min-w-0">
      <!-- Element Properties (when element is selected) -->
      <div v-if="selectedBlock" class="space-y-0">
        <!-- Unified Classes Input (Tailwind + Custom) -->
        <div>
          <ClassesProperty
            :selected-element="selectedElement"
            mode="inspector"
            :open="isSectionOpen('classes')"
            @update:open="setSectionOpen('classes', $event)"
          />
        </div>

        <!-- Content (editable text — text, heading, paragraph, span) -->
        <div
          v-if="selectedElement.hasText && !selectedElement.isButton"
        >
          <TextProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('content')"
            @update:open="setSectionOpen('content', $event)"
          />
        </div>

        <!-- Typography (for text-capable elements) -->
        <div v-if="selectedElement.hasText" class="border-b border-white/5">
          <TypographyProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('typography')"
            @update:open="setSectionOpen('typography', $event)"
          />
        </div>

        <!-- Image Properties (for image elements) -->
        <div v-if="selectedElement.hasImage" class="border-b border-white/5">
          <ImageProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('image')"
            @update:open="setSectionOpen('image', $event)"
          />
        </div>

        <div v-if="showNavigationSection" class="border-b border-white/5">
          <NavigationProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('navigation')"
            @update:open="setSectionOpen('navigation', $event)"
          />
        </div>

        <div v-if="showNavItemSection" class="border-b border-white/5">
          <NavItemProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('nav-item')"
            @update:open="setSectionOpen('nav-item', $event)"
          />
        </div>

        <!-- Video Properties (for video elements) -->
        <div v-if="selectedElement.hasVideo" class="border-b border-white/5">
          <VideoProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('video')"
            @update:open="setSectionOpen('video', $event)"
          />
        </div>

        <!-- Button Properties -->
        <div v-if="selectedElement.isButton" class="border-b border-white/5">
          <ButtonProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('button')"
            @update:open="setSectionOpen('button', $event)"
          />
        </div>

        <!-- Link Properties (for link-capable elements except buttons) -->
        <div
          v-if="
            selectedElement.hasLink &&
            !selectedElement.isButton &&
            !isIconListContext
          "
          class="border-b border-white/5"
        >
          <LinkProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :target-node-id="listItemContextNode?.id"
            :show-scope-control="Boolean(listItemContextNode)"
            :default-scope="listItemContextNode ? 'text' : undefined"
            :open="isSectionOpen('link')"
            @update:open="setSectionOpen('link', $event)"
          />
        </div>

        <!-- Code Properties (for code elements) -->
        <div v-if="selectedElement.hasCode" class="border-b border-white/5">
          <CodeProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('code')"
            @update:open="setSectionOpen('code', $event)"
          />
        </div>

        <!-- SVG Properties (for svg elements) -->
        <div v-if="selectedElement.hasSvg" class="border-b border-white/5">
          <SvgProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('svg')"
            @update:open="setSectionOpen('svg', $event)"
          />
        </div>

        <!-- Icon Properties (for icon elements) -->
        <div
          v-if="selectedElement.hasIcon && !isIconListContext"
          class="border-b border-white/5"
        >
          <IconProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('icon')"
            @update:open="setSectionOpen('icon', $event)"
          />
        </div>

        <!-- Component Instance Properties -->
        <div
          v-if="selectedElement.hasComponent"
          class="border-b border-white/5"
        >
          <ComponentInstanceProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('component-instance')"
            @update:open="setSectionOpen('component-instance', $event)"
          />
        </div>

        <!-- List / Icon List formatting -->
        <div
          v-if="selectedElement.hasList && isIconListContext"
          class="border-b border-white/5"
        >
          <IconListProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :target-node-id="listContextNode?.id"
            :open="isSectionOpen('icon-list')"
            @update:open="setSectionOpen('icon-list', $event)"
          />
        </div>

        <div
          v-else-if="selectedElement.hasList"
          class="border-b border-white/5"
        >
          <ListProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :target-node-id="listContextNode?.id"
            :open="isSectionOpen('list')"
            @update:open="setSectionOpen('list', $event)"
          />
        </div>

        <!-- Display -->
        <div class="border-b border-white/5">
          <DisplayProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('display')"
            @update:open="setSectionOpen('display', $event)"
          />
        </div>

        <!-- Size Properties -->
        <div v-if="!isIconListContext" class="border-b border-white/5">
          <SizeProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('size')"
            @update:open="setSectionOpen('size', $event)"
          />
        </div>

        <!-- Spacing Properties -->
        <div class="border-b border-white/5">
          <SpacingProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('spacing')"
            @update:open="setSectionOpen('spacing', $event)"
          />
        </div>

        <div class="border-b border-white/5">
          <PositionProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('position')"
            @update:open="setSectionOpen('position', $event)"
          />
        </div>

        <div class="border-b border-white/5">
          <TransformProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('transform')"
            @update:open="setSectionOpen('transform', $event)"
          />
        </div>

        <!-- Background Properties -->
        <div class="border-b border-white/5">
          <BackgroundProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('background')"
            @update:open="setSectionOpen('background', $event)"
          />
        </div>

        <!-- Border Properties -->
        <div class="border-b border-white/5">
          <BorderProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('border')"
            @update:open="setSectionOpen('border', $event)"
          />
        </div>

        <div class="border-b border-white/5">
          <CornerProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('corner')"
            @update:open="setSectionOpen('corner', $event)"
          />
        </div>

        <!-- Shadow Properties -->
        <div class="border-b border-white/5">
          <ShadowProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('shadow')"
            @update:open="setSectionOpen('shadow', $event)"
          />
        </div>

        <!-- Filter / Backdrop Filter -->
        <div class="border-b border-white/5">
          <FilterProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('filter')"
            @update:open="setSectionOpen('filter', $event)"
          />
        </div>

        <!-- Opacity -->
        <div class="border-b border-white/5">
          <OpacityProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('opacity')"
            @update:open="setSectionOpen('opacity', $event)"
          />
        </div>

        <!-- HTML Tag override -->
        <div
          v-if="selectedElement.supportsHtmlTag"
          class="border-b border-white/5"
        >
          <AttributesProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('html-tag')"
            @update:open="setSectionOpen('html-tag', $event)"
          />
        </div>

      </div>

      <!-- Always show core properties even when no selection -->
      <div v-if="!selectedBlock" class="space-y-0">
        <!-- Unified Classes Input (Tailwind + Custom) -->
        <div class="border-b border-white/5">
          <ClassesProperty
            mode="inspector"
            :open="isSectionOpen('classes')"
            @update:open="setSectionOpen('classes', $event)"
          />
        </div>

        <!-- Display -->
        <div class="border-b border-white/5">
          <DisplayProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('display')"
            @update:open="setSectionOpen('display', $event)"
          />
        </div>

        <div class="border-b border-white/5">
          <TransformProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('transform')"
            @update:open="setSectionOpen('transform', $event)"
          />
        </div>

        <!-- Size Properties -->
        <div class="border-b border-white/5">
          <SizeProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('size')"
            @update:open="setSectionOpen('size', $event)"
          />
        </div>

        <!-- Spacing Properties -->
        <div class="border-b border-white/5">
          <SpacingProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('spacing')"
            @update:open="setSectionOpen('spacing', $event)"
          />
        </div>

        <!-- Background Properties -->
        <div class="border-b border-white/5">
          <BackgroundProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('background')"
            @update:open="setSectionOpen('background', $event)"
          />
        </div>

        <!-- Border Properties -->
        <div class="border-b border-white/5">
          <BorderProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('border')"
            @update:open="setSectionOpen('border', $event)"
          />
        </div>

        <!-- Shadow Properties -->
        <div class="border-b border-white/5">
          <ShadowProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('shadow')"
            @update:open="setSectionOpen('shadow', $event)"
          />
        </div>

        <!-- Filter / Backdrop Filter -->
        <div class="border-b border-white/5">
          <FilterProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('filter')"
            @update:open="setSectionOpen('filter', $event)"
          />
        </div>

        <!-- Opacity -->
        <div class="border-b border-white/5">
          <OpacityProperty
            :current-item-type="props.currentItemType"
            :current-item-slug="props.currentItemSlug"
            :open="isSectionOpen('opacity')"
            @update:open="setSectionOpen('opacity', $event)"
          />
        </div>
      </div>
    </div>
  </ScrollArea>
</template>
