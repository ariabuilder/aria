<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { studioIcons } from "@/lib/icons";

import BaseProperty from "./BaseProperty.vue";
import InspectorBreakpointIndicators from "./InspectorBreakpointIndicators.vue";
import {
  usePropertySave,
  useSelectionTreeState,
  useStageSignalBridge,
} from "../../Core";
import { useInspectorPropertyOverrides } from "../composables/useInspectorPropertyOverrides";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useListSemanticMutation } from "../composables/useListSemanticMutation";
import { useInspectorStyleTarget } from "../composables/useInspectorStyleTarget";
import { usePropertySchema } from "../composables/usePropertySchema";
import {
  createDescriptionListGroupNode,
  createIconListItemNode,
  createTextListItemNode,
  LIST_SEMANTIC_MODES,
  resolveListSemanticMode,
  type ListSemanticMode,
} from "../../../../lib/blocks/listNodes";
import type { BuilderNode } from "../../../../lib/types/nodes";
import {
  DEFAULT_LIST,
  ListStylePositionSchema,
  ListStyleTypeSchema,
  type ListStylePosition,
  type ListStyleType,
  type ListValue,
} from "../schemas/list.schema";
import { useStudioI18n } from "@/i18n";

interface Props {
  defaultOpen?: boolean;
  open?: boolean;
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
  targetNodeId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  defaultOpen: false,
  open: undefined,
});

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();
const { t } = useStudioI18n();

const LIST_STYLE_KEYS = ["listStyleType", "listStylePosition"] as const;
type ListStyleKey = (typeof LIST_STYLE_KEYS)[number];

const ORDERED_STYLE_OPTIONS: Array<{ value: ListStyleType; label: string }> = [
  { value: "decimal", label: "Decimal" },
  { value: "lower-alpha", label: "Lower Alpha" },
  { value: "upper-alpha", label: "Upper Alpha" },
  { value: "lower-roman", label: "Lower Roman" },
  { value: "upper-roman", label: "Upper Roman" },
];

const UNORDERED_STYLE_OPTIONS: Array<{
  value: ListStyleType;
  label: string;
}> = [
  { value: "disc", label: "Disc" },
  { value: "circle", label: "Circle" },
  { value: "square", label: "Square" },
  { value: "none", label: "None" },
];

const LIST_POSITION_OPTIONS: Array<{
  value: ListStylePosition;
  label: string;
}> = [
  { value: "outside", label: "Outside" },
  { value: "inside", label: "Inside" },
];

const propertySave = usePropertySave();
const { selectedNode, selectedNodeId, breakpointName } = propertySave;
const { selectionTreeRootNodes } = useSelectionTreeState();
const { signalAddBlock } = useStageSignalBridge();
const listSemanticMutation = useListSemanticMutation();

function findNodeInSelectionTree(
  nodes: unknown,
  nodeId: string,
): BuilderNode | null {
  const stack: BuilderNode[] = Array.isArray(nodes)
    ? [...(nodes as BuilderNode[])]
    : [];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (node.id === nodeId) {
      return node;
    }

    if (node.children.length > 0) {
      stack.push(...node.children);
    }
  }

  return null;
}

const targetNodeId = computed(() => props.targetNodeId ?? selectedNodeId.value);
const targetNode = computed<BuilderNode | null>(() => {
  if (!targetNodeId.value) {
    return null;
  }

  if (selectedNode.value?.id === targetNodeId.value) {
    return selectedNode.value;
  }

  return findNodeInSelectionTree(
    selectionTreeRootNodes.value,
    targetNodeId.value,
  );
});
const listStyleTarget = useInspectorStyleTarget({
  propertySave,
  targetNode,
  targetNodeId,
});
const listOverrides = useInspectorPropertyOverrides({
  propertyKeys: LIST_STYLE_KEYS,
  currentBreakpoint: breakpointName,
  styleTarget: listStyleTarget,
});
const { safeParse, getDefault } = usePropertySchema();

const internalOpen = ref(props.defaultOpen);
const sectionOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = value;
    emit("update:open", value);
  },
});

const ordered = ref(false);
const listStyleType = ref<ListStyleType>("none");
const listStylePosition = ref<ListStylePosition>("outside");
const validationError = ref<string | null>(null);

function hasSaveContext(): boolean {
  return Boolean(
    targetNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: computed(
    () => propertySave.isLoading.value || listStyleTarget.isLoading.value,
  ),
});

const targetError = computed(() => listStyleTarget.error.value);

const defaultList = computed<ListValue>(() => {
  return (getDefault("list") as ListValue) ?? DEFAULT_LIST;
});

const orderedHasChanges = computed(
  () => ordered.value !== defaultList.value.ordered,
);

const hasListChanges = computed(
  () =>
    orderedHasChanges.value ||
    listOverrides.overrideBreakpointIds.value.length > 0,
);

const showSectionReset = computed(
  () =>
    orderedHasChanges.value || listOverrides.hasCurrentBreakpointOverride.value,
);

const listSemanticMode = computed<ListSemanticMode>(() =>
  resolveListSemanticMode(targetNode.value),
);
const listSemanticOptions = computed<
  Array<{ value: ListSemanticMode; label: string; icon: string }>
>(() => [
  {
    value: "unordered",
    label: t("inspector.list.bullets"),
    icon: studioIcons.listBulleted,
  },
  {
    value: "ordered",
    label: t("inspector.list.numbers"),
    icon: studioIcons.listNumbered,
  },
  {
    value: "description",
    label: t("inspector.list.description"),
    icon: studioIcons.listDescription,
  },
]);

const listStyleOptions = computed(() =>
  ordered.value ? ORDERED_STYLE_OPTIONS : UNORDERED_STYLE_OPTIONS,
);
function listOptionLabel(value: ListStyleType | ListStylePosition): string {
  const keys = {
    decimal: "inspector.list.marker.decimal",
    "lower-alpha": "inspector.list.marker.lowerAlpha",
    "upper-alpha": "inspector.list.marker.upperAlpha",
    "lower-roman": "inspector.list.marker.lowerRoman",
    "upper-roman": "inspector.list.marker.upperRoman",
    disc: "inspector.list.marker.disc",
    circle: "inspector.list.marker.circle",
    square: "inspector.list.marker.square",
    none: "inspector.list.marker.none",
    outside: "inspector.list.position.outside",
    inside: "inspector.list.position.inside",
  } as const;
  return t(keys[value]);
}
const isIconList = computed(() => isIconListNode(targetNode.value));
const isDescriptionList = computed(
  () => targetNode.value?.props?.element === "dl",
);
const showListTypeControl = computed(() => !isIconList.value);
const showMarkerControls = computed(
  () => !isIconList.value && !isDescriptionList.value,
);
const canAddListItem = computed(
  () => targetNode.value?.type?.toLowerCase() === "list",
);

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

function addListItem(): void {
  if (!canAddListItem.value) {
    return;
  }

  const listNode = targetNode.value;
  if (!listNode) {
    return;
  }

  const nextItemNumber = listNode.children.length + 1;
  const nextLabel = `Item ${nextItemNumber}`;
  const nextContent = `List item ${nextItemNumber}`;
  const nextBlock = isDescriptionList.value
    ? createDescriptionListGroupNode(
        `Term ${nextItemNumber}`,
        `Description ${nextItemNumber}`,
        nextLabel,
      )
    : isIconListNode(listNode)
      ? createIconListItemNode(nextContent, { label: nextLabel })
      : createTextListItemNode(nextContent, nextLabel);

  signalAddBlock({
    block: nextBlock,
    parentId: listNode.id,
  });
}

function hasStyleSaveContext(): boolean {
  if (listStyleTarget.isClassEditing.value) {
    return true;
  }

  return hasSaveContext();
}

function getDefaultStyleValue(key: ListStyleKey, breakpoint: string): string {
  if (key === "listStyleType") {
    return ordered.value ? "decimal" : "none";
  }

  const defaults = defaultList.value[key];
  return (
    defaults?.[breakpoint] ??
    defaults?.default ??
    DEFAULT_LIST[key].default ??
    "outside"
  );
}

function getStyleValue(key: ListStyleKey): string {
  const fallback = getDefaultStyleValue(key, breakpointName.value);

  if (listStyleTarget.isClassEditing.value) {
    return (
      listStyleTarget.getStyleValue(key, fallback, breakpointName.value) ??
      fallback
    );
  }

  return (
    propertySave.getComputedStyleValue(
      key,
      fallback,
      breakpointName.value,
      targetNodeId.value ?? undefined,
    ) ?? fallback
  );
}

function syncListValues(): void {
  ordered.value = targetNode.value?.props?.ordered === true;

  const nextListStyleType = ListStyleTypeSchema.safeParse(
    getStyleValue("listStyleType"),
  );
  listStyleType.value = nextListStyleType.success
    ? nextListStyleType.data
    : ordered.value
      ? "decimal"
      : "none";

  const nextListStylePosition = ListStylePositionSchema.safeParse(
    getStyleValue("listStylePosition"),
  );
  listStylePosition.value = nextListStylePosition.success
    ? nextListStylePosition.data
    : "outside";
}

watch(
  [
    selectedNode,
    breakpointName,
    listStyleTarget.isClassEditing,
    listStyleTarget.activeClass,
  ],
  () => {
    syncListValues();
  },
  { flush: "post", immediate: true },
);

function validateList(
  nextOrdered: boolean,
  nextListStyleType: ListStyleType,
  nextListStylePosition: ListStylePosition,
): boolean {
  const candidate: ListValue = {
    ordered: nextOrdered,
    listStyleType: {
      ...defaultList.value.listStyleType,
      [breakpointName.value]: nextListStyleType,
    },
    listStylePosition: {
      ...defaultList.value.listStylePosition,
      [breakpointName.value]: nextListStylePosition,
    },
  };

  const result = safeParse("list", candidate);
  const valid = "success" in result && result.success;

  if (!valid) {
    validationError.value = t("inspector.validation.invalidList");
    return false;
  }

  validationError.value = null;
  return true;
}

async function replaceListSemanticMode(
  nextMode: ListSemanticMode,
): Promise<void> {
  const listNode = targetNode.value;
  if (!listNode || nextMode === listSemanticMode.value) {
    return;
  }

  const result = await listSemanticMutation.replaceListSemanticMode(
    listNode,
    nextMode,
  );

  if (!result.success) {
    validationError.value =
      result.error ?? t("inspector.validation.invalidList");
    return;
  }

  validationError.value = null;
  syncListValues();
}

async function saveListSemanticMode(value: string): Promise<void> {
  if (!LIST_SEMANTIC_MODES.includes(value as ListSemanticMode)) {
    return;
  }

  const nextMode = value as ListSemanticMode;
  await replaceListSemanticMode(nextMode);
}

async function saveListStyleType(value: string): Promise<void> {
  if (!hasStyleSaveContext()) {
    return;
  }

  const parsedType = ListStyleTypeSchema.safeParse(value);
  if (!parsedType.success) {
    return;
  }

  if (!validateList(ordered.value, parsedType.data, listStylePosition.value)) {
    return;
  }

  if (parsedType.data === listStyleType.value) {
    return;
  }

  const previousListStyleType = listStyleType.value;

  listStyleTarget.previewStyleProperties({
    listStyleType: parsedType.data,
  });
  listStyleType.value = parsedType.data;

  const success = await listStyleTarget.saveStyleProperty(
    "listStyleType",
    parsedType.data,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (!success) {
    listStyleTarget.previewStyleProperties({
      listStyleType: previousListStyleType,
    });
    listStyleType.value = previousListStyleType;
  }
}

async function saveListStylePosition(value: string): Promise<void> {
  if (!hasStyleSaveContext()) {
    return;
  }

  const parsedPosition = ListStylePositionSchema.safeParse(value);
  if (!parsedPosition.success) {
    return;
  }

  if (!validateList(ordered.value, listStyleType.value, parsedPosition.data)) {
    return;
  }

  if (parsedPosition.data === listStylePosition.value) {
    return;
  }

  const previousListStylePosition = listStylePosition.value;

  listStyleTarget.previewStyleProperties({
    listStylePosition: parsedPosition.data,
  });
  listStylePosition.value = parsedPosition.data;

  const success = await listStyleTarget.saveStyleProperty(
    "listStylePosition",
    parsedPosition.data,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (!success) {
    listStyleTarget.previewStyleProperties({
      listStylePosition: previousListStylePosition,
    });
    listStylePosition.value = previousListStylePosition;
  }
}

async function resetList(): Promise<void> {
  if (!hasSaveContext()) {
    return;
  }

  const orderedSaved = orderedHasChanges.value
    ? await propertySave.saveProperty(
        "ordered",
        defaultList.value.ordered,
        props.currentItemType,
        props.currentItemSlug,
        targetNodeId.value ?? undefined,
      )
    : true;

  const styleSaved = await listOverrides.clearCurrentBreakpointOverrides(
    props.currentItemType,
    props.currentItemSlug,
  );

  if (orderedSaved && styleSaved) {
    ordered.value = defaultList.value.ordered;
    listStyleType.value = getDefaultStyleValue(
      "listStyleType",
      breakpointName.value,
    ) as ListStyleType;
    listStylePosition.value = getDefaultStyleValue(
      "listStylePosition",
      breakpointName.value,
    ) as ListStylePosition;
    validationError.value = null;
  }
}
</script>

<template>
  <BaseProperty
    title="List"
    :open="sectionOpen"
    :defaultOpen="defaultOpen"
    :has-changes="hasListChanges"
    :show-reset="showSectionReset"
    :reset-disabled="isPanelDisabled"
    :reset-aria-label="t('inspector.list.reset')"
    @update:open="sectionOpen = $event"
    @reset="void resetList()"
  >
    <template #header-actions>
      <InspectorBreakpointIndicators
        :breakpoints="listOverrides.overrideBreakpoints.value"
        :current-breakpoint-label="listOverrides.currentBreakpointLabel.value"
      />
    </template>

    <div class="space-y-3">
      <div
        v-if="showListTypeControl"
        class="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2"
      >
        <label
          class="text-3xs font-semibold uppercase tracking-widest text-muted-foreground"
        >
          {{ t("inspector.list.type") }}
        </label>
        <div class="flex min-w-0 items-center gap-2">
          <Tabs
            data-testid="list-ordered-tabs"
            class="min-w-0 flex-1 gap-0"
            :model-value="listSemanticMode"
            @update:model-value="
              (value) => void saveListSemanticMode(String(value ?? ''))
            "
          >
            <TabsList
              class="h-8 w-full rounded-md border border-solid border-border/50 bg-sidebar/50 p-[3px]"
            >
              <TooltipProvider
                v-for="option in listSemanticOptions"
                :key="option.value"
                :delay-duration="250"
              >
                <Tooltip>
                  <TooltipTrigger as-child>
                    <TabsTrigger
                      :value="option.value"
                      :data-testid="`list-type-${option.value}-tab`"
                      class="min-w-0 px-0"
                      :disabled="isPanelDisabled"
                    >
                      <span class="sr-only">{{ option.label }}</span>
                      <span
                        aria-hidden="true"
                        :class="[option.icon, 'size-4.5 shrink-0']"
                      />
                    </TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" class="text-xs">
                    {{ option.label }}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </TabsList>
          </Tabs>

          <TooltipProvider v-if="canAddListItem" :delay-duration="250">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  data-testid="list-add-item-button"
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  class="h-8! w-8! shrink-0 rounded-md! p-0! transition-transform active:scale-[0.96]"
                  :disabled="isPanelDisabled"
                  :aria-label="t('inspector.list.addItem')"
                  @click="addListItem"
                >
                  <span
                    aria-hidden="true"
                    :class="[studioIcons.plus, 'size-4 shrink-0']"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" class="text-xs">
                {{ t("inspector.list.addItem") }}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div
        v-else-if="canAddListItem"
        class="flex justify-end"
      >
        <TooltipProvider :delay-duration="250">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                data-testid="list-add-item-button"
                type="button"
                variant="secondary"
                size="xs"
                class="h-8! gap-1.5 rounded-md! px-2.5! transition-transform active:scale-[0.96]"
                :disabled="isPanelDisabled"
                @click="addListItem"
              >
                <span
                  aria-hidden="true"
                  :class="[studioIcons.plus, 'size-4 shrink-0']"
                />
                {{ t("inspector.list.addItem") }}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" class="text-xs">
              {{ t("inspector.list.addItem") }}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div
        v-if="showMarkerControls"
        class="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2"
      >
        <label
          class="text-3xs font-semibold uppercase tracking-widest text-muted-foreground"
        >
          {{ t("inspector.list.marker") }}
        </label>
        <Select
          data-testid="list-style-type-select"
          :model-value="listStyleType"
          :disabled="isPanelDisabled"
          @update:model-value="
            (value) => void saveListStyleType(String(value ?? ''))
          "
        >
          <SelectTrigger class="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in listStyleOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ listOptionLabel(option.value) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        v-if="showMarkerControls"
        class="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2"
      >
        <label
          class="text-3xs font-semibold uppercase tracking-widest text-muted-foreground"
        >
          {{ t("inspector.list.position") }}
        </label>
        <Select
          data-testid="list-style-position-select"
          :model-value="listStylePosition"
          :disabled="isPanelDisabled"
          @update:model-value="
            (value) => void saveListStylePosition(String(value ?? ''))
          "
        >
          <SelectTrigger class="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in LIST_POSITION_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ listOptionLabel(option.value) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p v-if="validationError" class="text-xs text-destructive">
        {{ validationError }}
      </p>

      <p v-if="targetError" class="text-xs text-destructive">
        {{ targetError }}
      </p>
    </div>
  </BaseProperty>
</template>
