<script setup lang="ts">
/**
 * PropsTab - Component Properties Panel
 *
 * Displays and edits component properties (non-style props).
 * Uses usePropsEditor composable for all logic.
 *
 * @component
 */
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePropsEditor } from "../composables/usePropsEditor";
import { useInspectorPropBinding, resolveBindingPickerMode } from "../composables/useInspectorPropBinding";
import { studioIcons } from "@/lib/icons";
import CmsEntryCommandSelect from "@/features/CMS/components/CmsEntryCommandSelect.vue";
import InspectorPropBinding from "../components/InspectorPropBinding.vue";
import InspectorDateFormatSelect from "../components/InspectorDateFormatSelect.vue";
import LoopArchiveFilterFields from "../components/LoopArchiveFilterFields.vue";
import LoopQueryFields from "../components/LoopQueryFields.vue";
import LinkProperty from "../inputs/LinkProperty.vue";
import type { CmsEntryRow } from "@/features/CMS/lib/entryRow";
import type {
  PropBindingMode,
  PropertyDefinition,
} from "../composables/usePropsEditor";
import PaginationInspectorSection from "../components/PaginationInspectorSection.vue";
import { isLinkableContainerNodeType } from "../../../../lib/blocks/containerTypes";
import {
  INSPECTOR_CHIP_TOGGLE_ACTIVE_CLASS,
  INSPECTOR_CHIP_TOGGLE_CLASS,
  INSPECTOR_CHIP_TOGGLE_GROUP_CLASS,
  INSPECTOR_PROPERTY_LABEL_CLASS,
  INSPECTOR_PROPERTY_ROW_CLASS,
  INSPECTOR_SECTION_HINT_CLASS,
  INSPECTOR_SELECT_CONTENT_CLASS,
  INSPECTOR_SELECT_TRIGGER_CLASS,
} from "../constants/panelTokens";
import {
  isLoopSourceProp,
  shouldHideLoopSourceProp,
  shouldShowInheritedLoopBanner,
  shouldShowLoopSourceSection,
} from "../lib/loopInspectorVisibility";
import { useStudioI18n } from "@/i18n";

interface Props {
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
}

const props = withDefaults(defineProps<Props>(), {
  currentItemType: undefined,
  currentItemSlug: undefined,
});

const propsEditor = usePropsEditor();
const { t } = useStudioI18n();
const loopBinding = useInspectorPropBinding({
  propName: "items",
  propType: "array",
  value: [],
});

const newPropName = ref("");
const newPropType = ref<"string" | "number" | "boolean">("string");
const newPropValue = ref<string | number | boolean>("");
const repeatMode = ref<"static" | "repeat">("static");

watch(
  () => loopBinding.isCollectionMode.value,
  (isRepeat) => {
    repeatMode.value = isRepeat ? "repeat" : "static";
  },
  { immediate: true },
);

const hasSelectedNode = computed(
  () => propsEditor.hasProperties.value || propsEditor.propertyCount.value >= 0,
);
const elementProps = computed(() => propsEditor.properties.value);
const showLoopSourceSection = computed(
  () =>
    shouldShowLoopSourceSection({
      isRepeatCapable: propsEditor.isSelectedNodeRepeatCapable.value,
      hasInheritedLoop: propsEditor.hasInheritedCmsLoopSource.value,
    }) &&
    (propsEditor.collections.value.length > 0 ||
      propsEditor.isAssignedCmsTemplatePage.value),
);
const showInheritedLoopBanner = computed(() =>
  shouldShowInheritedLoopBanner({
    isRepeatCapable: propsEditor.isSelectedNodeRepeatCapable.value,
    hasInheritedLoop: propsEditor.hasInheritedCmsLoopSource.value,
  }),
);
const visibleElementProps = computed(() =>
  elementProps.value.filter(
    (prop) => !shouldHideLoopSourceProp(prop, showLoopSourceSection.value),
  ),
);
const primaryContentEditorProp = computed(
  () => elementProps.value.find((prop) => prop.contentEditorEligible) ?? null,
);
const showLoopItemLink = computed(() => {
  const nodeType = propsEditor.elementContext.value.node?.type ?? "";
  return (
    loopBinding.hasCmsContext.value &&
    isLinkableContainerNodeType(nodeType)
  );
});
const showNestedLoopItemLink = computed(() => {
  const nodeType = propsEditor.elementContext.value.node?.type ?? "";
  return (
    propsEditor.cmsDataSourceMode.value === "list" &&
    isLinkableContainerNodeType(nodeType)
  );
});

function handlePropChange(propName: string, newValue: unknown) {
  propsEditor.updateProp(propName, newValue);
}

function handleCmsFieldSelect(propName: string, fieldPath: string) {
  void propsEditor.bindPropToCmsField(propName, fieldPath);
}

function handleCmsFieldClear(propName: string) {
  void propsEditor.unbindPropFromCms(propName);
}

const PROPS_INPUT_CLASS =
  "w-full min-w-0 rounded-md border border-dashed border-border bg-input px-2 py-1.5 text-xs text-foreground outline-none transition-colors focus:border-primary/50";
const PROPS_INPUT_READONLY_CLASS =
  "cursor-default bg-muted/40 text-muted-foreground";

function showTemplateFieldBinding(prop: PropertyDefinition): boolean {
  return (
    propsEditor.isAssignedCmsTemplatePage.value && !isLoopSourceProp(prop)
  );
}

const templateBindingPickerMode = computed(() =>
  resolveBindingPickerMode({
    isListTemplatePage: propsEditor.isListTemplatePage.value,
    hasInheritedCmsLoopSource: propsEditor.hasInheritedCmsLoopSource.value,
    isListLoopContainer:
      propsEditor.isSelectedNodeRepeatCapable.value &&
      propsEditor.cmsDataSourceMode.value === "list",
  }),
);

function isTemplateFieldBindingDisabled(): boolean {
  if (templateBindingPickerMode.value === "multi-step") {
    return propsEditor.isLoadingCollections.value;
  }
  return (
    !propsEditor.selectedCollection.value ||
    propsEditor.cmsFieldOptions.value.length === 0
  );
}

function showLoopBindingModeSelector(prop: PropertyDefinition): boolean {
  return (
    propsEditor.isSelectedNodeRepeatCapable.value && isLoopSourceProp(prop)
  );
}

function isValueInputReadOnly(prop: PropertyDefinition): boolean {
  return (
    propsEditor.isAssignedCmsTemplatePage.value &&
    propsEditor.isPropCmsBound(prop.name)
  );
}

function boundFieldModelValue(propName: string): string {
  return propsEditor.cmsBindings.value[propName] ?? "";
}

function handleCmsCollectionChange(value: string) {
  void propsEditor.updateCmsCollection(value);
}

function handleCmsModeChange(value: string) {
  if (value !== "single" && value !== "list") return;
  void propsEditor.updateCmsDataSourceMode(value);
}

function handleCmsSingleEntrySelect(entry: CmsEntryRow) {
  void propsEditor.updateCmsSingleEntry(entry.id, {
    id: entry.id,
    slug: entry.slug,
  });
}

function handleLoopModeChange(mode: "static" | "repeat"): void {
  if (mode === "repeat") {
    repeatMode.value = "repeat";
    void loopBinding.enterCollectionMode();
    return;
  }

  repeatMode.value = "static";
  void loopBinding.leaveCollectionMode();
}

function handleBindingModeChange(propName: string, value: string) {
  if (value !== "static" && value !== "dynamic") return;
  void propsEditor.setPropBindingMode(propName, value);
}

function formatPropertyTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function handleStudioEditableChange(propName: string, editable: boolean) {
  void propsEditor.setStudioEditable(propName, editable);
}

function handleStudioHiddenChange(propName: string, hidden: boolean) {
  void propsEditor.setStudioHidden(propName, hidden);
}

function handleContentEditorStateToggle(prop: PropertyDefinition) {
  void propsEditor.setContentEditorExposure(prop.name, {
    locked: !prop.contentEditorLocked,
  });
}

function contentEditorStateIcon(prop: PropertyDefinition): string {
  if (prop.contentEditorLocked) return studioIcons.lock;
  return studioIcons.unlock;
}

function contentEditorStateTitle(prop: PropertyDefinition): string {
  if (prop.contentEditorLocked) return t("inspector.props.lockedInContentDetail");
  return t("inspector.props.editableInContentDetail");
}

function cmsBindingGroupsForProp(prop: (typeof elementProps.value)[number]) {
  return propsEditor.cmsFieldOptionGroupsForProp(prop);
}

function propBindingMode(propName: string): PropBindingMode {
  return propsEditor.propBindingMode(propName);
}

function isPropDynamic(propName: string): boolean {
  return propBindingMode(propName) === "dynamic";
}

function canShowDynamicSourceControls(): boolean {
  return propsEditor.collections.value.length > 0;
}

function usesInheritedLoopSource(prop: PropertyDefinition): boolean {
  return (
    propsEditor.hasInheritedCmsLoopSource.value &&
    isPropDynamic(prop.name) &&
    !isLoopSourceProp(prop)
  );
}

function propHeaderLabel(prop: PropertyDefinition): string {
  return `${prop.name} · ${formatPropertyTypeLabel(prop.type)}`;
}

function propDisplayName(prop: PropertyDefinition): string {
  return prop.name === "items" && prop.type === "array"
    ? t("inspector.props.loop")
    : prop.name;
}

function handleDateFormatChange(propName: string, formatId: string) {
  void propsEditor.setPropDateFormat(propName, formatId as never);
}

function createNewProp() {
  if (!newPropName.value.trim()) return;

  const propName = newPropName.value.trim();
  const value =
    newPropType.value === "number"
      ? parseFloat(String(newPropValue.value))
      : newPropType.value === "boolean"
        ? newPropValue.value === "true" || newPropValue.value === true
        : newPropValue.value;

  propsEditor.addProp(propName, newPropType.value, value);

  newPropName.value = "";
  newPropType.value = "string";
  newPropValue.value = "";
}
</script>

<template>
  <ScrollArea class="flex-1 w-full">
    <div class="space-y-6 w-full min-w-0 p-2">
      <div class="flex items-center justify-between px-2 pt-2">
        <div class="flex min-w-0 items-center gap-2">
          <span :class="[studioIcons.databaseLine, 'size-3 text-muted-foreground']" />
          <span class="truncate text-xs text-foreground">
            {{ propsEditor.nodeBindingSummary.value.label }}
          </span>
        </div>
      </div>

      <div
        v-if="propsEditor.collectionsError.value"
        class="mx-2 flex items-start gap-1 text-3xs text-destructive"
      >
        <span :class="[studioIcons.infoCircle, 'mt-0.5 size-3']" />
        <span>{{ propsEditor.collectionsError.value }}</span>
      </div>
      <div
        v-else-if="propsEditor.cmsEntriesError.value"
        class="mx-2 flex items-start gap-1 text-3xs text-destructive"
      >
        <span :class="[studioIcons.infoCircle, 'mt-0.5 size-3']" />
        <span>{{ propsEditor.cmsEntriesError.value }}</span>
      </div>
      <div
        v-else-if="propsEditor.cmsSourceError.value"
        class="mx-2 flex items-start gap-1 text-3xs text-destructive"
      >
        <span :class="[studioIcons.infoCircle, 'mt-0.5 size-3']" />
        <span>{{ propsEditor.cmsSourceError.value }}</span>
      </div>

      <PaginationInspectorSection />

      <div
        v-if="showInheritedLoopBanner"
        class="mx-2 flex min-w-0 items-center gap-1.5 rounded-sm border border-dashed border-border/50 bg-sidebar/50 px-2 py-1.5"
        data-testid="inherited-loop-banner"
      >
        <span
          :class="[studioIcons.databaseLine, 'size-3 shrink-0 text-orange-500']"
        />
        <span class="min-w-0 text-3xs text-muted-foreground">
          {{ t("inspector.props.inheritedLoop") }}
        </span>
      </div>

      <section
        v-if="showLoopSourceSection"
        class="mx-2 space-y-3 border-b border-dashed border-border pb-3"
        data-testid="loop-source-section"
      >
        <div class="min-w-0">
          <div class="text-xs font-medium text-foreground">{{ t("inspector.props.loop") }}</div>
          <span class="text-[9px] font-mono text-muted-foreground">{{ t("inspector.props.array") }}</span>
        </div>

        <div
          :class="INSPECTOR_CHIP_TOGGLE_GROUP_CLASS"
          role="group"
          :aria-label="t('inspector.props.loopMode')"
        >
          <button
            type="button"
            :aria-pressed="repeatMode === 'static'"
            :class="[
              INSPECTOR_CHIP_TOGGLE_CLASS,
              repeatMode === 'static' && INSPECTOR_CHIP_TOGGLE_ACTIVE_CLASS,
            ]"
            @click="handleLoopModeChange('static')"
          >
            {{ t("inspector.props.static") }}
          </button>
          <button
            type="button"
            :aria-pressed="repeatMode === 'repeat'"
            :class="[
              INSPECTOR_CHIP_TOGGLE_CLASS,
              repeatMode === 'repeat' && INSPECTOR_CHIP_TOGGLE_ACTIVE_CLASS,
            ]"
            @click="handleLoopModeChange('repeat')"
          >
            {{ t("inspector.props.loop") }}
          </button>
        </div>

        <template v-if="repeatMode === 'repeat'">
          <div
            v-if="loopBinding.hasCmsContext.value"
            :class="INSPECTOR_PROPERTY_ROW_CLASS"
          >
            <label :class="INSPECTOR_PROPERTY_LABEL_CLASS">{{ t("inspector.props.collection") }}</label>
            <Select
              :model-value="loopBinding.propsEditor.selectedCollectionName.value"
              :disabled="loopBinding.propsEditor.isLoadingCollections.value"
              @update:model-value="
                (value) => handleCmsCollectionChange(String(value))
              "
            >
              <SelectTrigger :class="INSPECTOR_SELECT_TRIGGER_CLASS">
                <SelectValue :placeholder="t('inspector.props.collection')" />
              </SelectTrigger>
              <SelectContent :class="INSPECTOR_SELECT_CONTENT_CLASS">
                <SelectItem
                  v-for="collection in loopBinding.propsEditor.collections.value"
                  :key="collection.id"
                  :value="collection.name"
                >
                  {{ collection.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <LoopQueryFields />

          <div
            v-if="showLoopItemLink"
            class="space-y-2"
            data-testid="loop-item-link"
          >
            <p :class="INSPECTOR_SECTION_HINT_CLASS">
              {{ t("inspector.props.wrapLoopItem") }}
            </p>
            <LinkProperty
              embedded
              :current-item-type="props.currentItemType"
              :current-item-slug="props.currentItemSlug"
              :target-node-id="propsEditor.elementContext.value.nodeId ?? undefined"
            />
          </div>

          <LoopArchiveFilterFields />
        </template>
      </section>

      <div
        v-if="primaryContentEditorProp"
        class="mx-2 border-b border-dashed border-border pb-3"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 space-y-1">
            <div class="text-2xs font-medium text-foreground">{{ t("inspector.props.contentDetails") }}</div>
            <div class="max-w-[12rem] text-3xs leading-4 text-muted-foreground">
              {{ t("inspector.props.lockForContentEditing") }}
            </div>
          </div>
          <div
            class="inline-flex shrink-0 items-center gap-1 rounded-sm border border-dashed border-border bg-sidebar/60 p-0.5"
          >
            <Button
              type="button"
              variant="sidebar-action"
              size="icon-sm"
              class="h-6! w-6! rounded-xs!"
              :class="
                primaryContentEditorProp.contentEditorLocked
                  ? 'border-primary/70 bg-accent-10 text-primary!'
                  : ''
              "
              :data-state="
                primaryContentEditorProp.contentEditorLocked
                  ? 'open'
                  : undefined
              "
              :aria-pressed="primaryContentEditorProp.contentEditorLocked"
              :title="contentEditorStateTitle(primaryContentEditorProp)"
              @click="handleContentEditorStateToggle(primaryContentEditorProp)"
            >
              <span
                :class="[
                  contentEditorStateIcon(primaryContentEditorProp),
                  'size-3.5',
                ]"
              />
            </Button>
          </div>
        </div>
      </div>

        <!-- Component Props -->
        <div class="">
          <div class="flex items-center justify-between mb-4 px-2">
            <span
              class="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider"
              >{{ t("inspector.props.properties") }}</span
            >
            <span
              class="text-3xs bg-card px-2 py-1 rounded-md text-muted-foreground"
              >{{ t("inspector.props.elementProps") }}</span
            >
          </div>

          <div class="space-y-6">
            <div
              v-if="propsEditor.componentSchemaError.value"
              class="rounded-sm border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-3xs text-destructive"
            >
              {{ propsEditor.componentSchemaError.value }}
            </div>

          <!-- Dynamic Props -->
          <template v-for="prop in visibleElementProps" :key="prop.name">
            <section class="grid gap-3 border-t border-dashed border-border px-2 pt-4">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <label class="block truncate text-xs font-medium text-foreground">
                    {{ propDisplayName(prop) }}
                  </label>
                  <span class="text-[9px] text-muted-foreground font-mono">
                    {{ formatPropertyTypeLabel(prop.type) }}
                  </span>
                </div>
                <div
                  v-if="!isLoopSourceProp(prop)"
                  class="flex shrink-0 items-center gap-1.5"
                >
                  <Select
                    :model-value="propBindingMode(prop.name)"
                    @update:model-value="
                      (value) =>
                        handleBindingModeChange(prop.name, String(value))
                    "
                  >
                    <SelectTrigger
                      class="h-7! w-28 justify-between text-xs"
                      :aria-label="t('inspector.props.bindingMode', { property: propHeaderLabel(prop) })"
                    >
                      <SelectValue :placeholder="t('inspector.props.mode')" />
                    </SelectTrigger>
                    <SelectContent class="w-[var(--radix-select-trigger-width)]">
                      <SelectItem value="static">{{ t("inspector.props.static") }}</SelectItem>
                      <SelectItem value="dynamic">
                        {{
                          showLoopBindingModeSelector(prop)
                            ? t("inspector.props.loop")
                            : t("inspector.props.dynamic")
                        }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <!-- String Props -->
              <div
                v-if="prop.type === 'string'"
                class="relative flex items-center"
              >
                <input
                  type="text"
                  :value="prop.value"
                  :readonly="isValueInputReadOnly(prop)"
                  @change="
                    (e: Event) =>
                      handlePropChange(
                        prop.name,
                        (e.target as HTMLInputElement).value,
                      )
                  "
                  :class="[
                    PROPS_INPUT_CLASS,
                    isValueInputReadOnly(prop) ? PROPS_INPUT_READONLY_CLASS : '',
                  ]"
                />
              </div>

              <InspectorDateFormatSelect
                v-if="
                  isPropDynamic(prop.name) &&
                  propsEditor.isDateBoundProp(prop.name)
                "
                :model-value="propsEditor.dateFormatForProp(prop.name)"
                @update:model-value="
                  (formatId) => handleDateFormatChange(prop.name, formatId)
                "
              />

              <!-- Boolean Props -->
              <div
                v-else-if="prop.type === 'boolean'"
                class="flex items-center justify-between"
              >
                <span class="text-xs text-muted-foreground">{{ t("inspector.props.value") }}</span>
                <div
                  class="relative inline-block w-9 mr-2 align-middle select-none shrink-0"
                >
                  <input
                    type="checkbox"
                    :checked="Boolean(prop.value)"
                    @change="
                      (e: Event) =>
                        handlePropChange(
                          prop.name,
                          (e.target as HTMLInputElement).checked,
                        )
                    "
                    class="absolute block w-4 h-4 rounded-full bg-background border-4 border-muted appearance-none cursor-pointer transition-all duration-300 ease-in-out top-0.5 left-0.5"
                    :class="prop.value ? 'right-0 border-primary' : ''"
                  />
                  <label
                    class="block overflow-hidden h-5 rounded-full cursor-pointer transition-colors border border-border"
                    :class="prop.value ? 'bg-primary' : 'bg-muted'"
                  ></label>
                </div>
              </div>

              <!-- Number Props -->
              <div v-else-if="prop.type === 'number'" class="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  :value="prop.value"
                  @change="
                    (e: Event) =>
                      handlePropChange(
                        prop.name,
                        parseFloat((e.target as HTMLInputElement).value),
                      )
                  "
                  class="w-full min-w-0 h-1 rounded-lg bg-muted appearance-none cursor-pointer"
                />
                <input
                  type="number"
                  :value="prop.value"
                  @change="
                    (e: Event) =>
                      handlePropChange(
                        prop.name,
                        parseFloat((e.target as HTMLInputElement).value),
                      )
                  "
                  class="w-12 min-w-12 rounded-md border border-dashed border-border bg-input px-1 py-1 text-center text-xs text-foreground outline-none focus:border-primary/50"
                />
              </div>

              <div
                v-if="propsEditor.componentRef.value"
                class="mt-2 flex flex-wrap items-center gap-1.5 rounded-sm border border-dashed border-border/50 bg-sidebar/50 px-2 py-1.5"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="h-6 gap-1 px-1.5 text-3xs"
                  :class="
                    prop.studioEditable
                      ? 'text-primary'
                      : 'text-muted-foreground'
                  "
                  :aria-pressed="prop.studioEditable"
                  :disabled="propsEditor.isLoadingComponentSchema.value"
                  @click="
                    handleStudioEditableChange(prop.name, !prop.studioEditable)
                  "
                >
                  <span
                    :class="[
                      prop.studioEditable
                        ? studioIcons.check
                        : studioIcons.close,
                      'size-3',
                    ]"
                  />
                  {{ t("inspector.props.studioEditable") }}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="h-6 gap-1 px-1.5 text-3xs"
                  :class="
                    prop.studioHidden
                      ? 'text-primary'
                      : 'text-muted-foreground'
                  "
                  :aria-pressed="prop.studioHidden"
                  :disabled="propsEditor.isLoadingComponentSchema.value"
                  @click="handleStudioHiddenChange(prop.name, !prop.studioHidden)"
                >
                  <span
                    :class="[
                      prop.studioHidden ? studioIcons.eyeOff : studioIcons.eye,
                      'size-3',
                    ]"
                  />
                  {{ t("inspector.props.hiddenFromStudio") }}
                </Button>
              </div>

              <div
                v-if="showTemplateFieldBinding(prop)"
                class="flex items-center gap-2"
              >
                <InspectorPropBinding
                  :model-value="boundFieldModelValue(prop.name)"
                  :groups="cmsBindingGroupsForProp(prop)"
                  :picker-mode="templateBindingPickerMode"
                  :disabled="isTemplateFieldBindingDisabled()"
                  :placeholder="t('inspector.props.chooseField')"
                  @select="(path) => handleCmsFieldSelect(prop.name, path)"
                  @clear="handleCmsFieldClear(prop.name)"
                />
              </div>

              <div
                v-if="
                  !propsEditor.isAssignedCmsTemplatePage.value &&
                  isPropDynamic(prop.name)
                "
                class="grid gap-3"
              >
                <div
                  v-if="!canShowDynamicSourceControls()"
                  class="flex items-start gap-1 text-3xs text-muted-foreground"
                >
                  <span :class="[studioIcons.infoCircle, 'mt-0.5 size-3']" />
                  <span>{{ t("inspector.props.noCollections") }}</span>
                </div>

                <template v-else>
                  <div
                    v-if="usesInheritedLoopSource(prop)"
                    class="flex min-w-0 items-center gap-1.5 rounded-sm border border-dashed border-border/50 bg-sidebar/50 px-2 py-1.5"
                  >
                    <span
                      :class="[studioIcons.databaseLine, 'size-3 shrink-0 text-orange-500']"
                    />
                    <span class="min-w-0 truncate text-3xs text-muted-foreground">
                      {{ t("inspector.props.currentLoopItem") }}
                    </span>
                  </div>

                  <div
                    v-else-if="!propsEditor.isEntryTemplatePage.value && !propsEditor.isListTemplatePage.value"
                    class="grid gap-2"
                  >
                    <div class="flex items-center justify-between">
                      <label
                        class="text-3xs uppercase font-semibold tracking-wide text-muted-foreground"
                        >{{ t("inspector.props.collection") }}</label
                      >
                    </div>
                    <Select
                      :model-value="propsEditor.selectedCollectionName.value"
                      :disabled="
                        propsEditor.isLoadingCollections.value ||
                        propsEditor.collections.value.length === 0
                      "
                      @update:model-value="
                        (value) => handleCmsCollectionChange(String(value))
                      "
                    >
                      <SelectTrigger class="h-8! text-xs">
                        <SelectValue
                          :placeholder="
                            propsEditor.isLoadingCollections.value
                              ? t('inspector.props.loadingCollections')
                              : t('inspector.props.selectCollection')
                          "
                        />
                      </SelectTrigger>
                      <SelectContent
                        class="max-h-72 w-[var(--radix-select-trigger-width)]"
                      >
                        <SelectItem
                          v-for="collection in propsEditor.collections.value"
                          :key="collection.id"
                          :value="collection.name"
                        >
                          {{ collection.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div
                    v-if="
                      !propsEditor.isEntryTemplatePage.value &&
                      !isLoopSourceProp(prop) &&
                      !usesInheritedLoopSource(prop)
                    "
                    class="grid gap-2"
                  >
                    <label
                      class="text-3xs uppercase font-semibold tracking-wide text-muted-foreground"
                      >{{ t("inspector.props.source") }}</label
                    >
                    <Select
                      :model-value="propsEditor.cmsDataSourceMode.value"
                      :disabled="!propsEditor.selectedCollection.value"
                      @update:model-value="
                        (value) => handleCmsModeChange(String(value))
                      "
                    >
                      <SelectTrigger class="h-8! text-xs">
                        <SelectValue :placeholder="t('inspector.props.sourceMode')" />
                      </SelectTrigger>
                      <SelectContent class="w-[var(--radix-select-trigger-width)]">
                        <SelectItem value="single">{{ t("inspector.props.singleEntry") }}</SelectItem>
                        <SelectItem
                          v-if="
                            propsEditor.isSelectedNodeRepeatCapable.value ||
                            propsEditor.cmsDataSourceMode.value === 'list'
                          "
                          value="list"
                          :disabled="!propsEditor.isSelectedNodeRepeatCapable.value"
                        >
                          {{ t("inspector.props.loopCollection") }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p
                      v-if="!propsEditor.isSelectedNodeRepeatCapable.value"
                      class="m-0 text-3xs leading-snug text-muted-foreground/70"
                    >
                      {{ t("inspector.props.loopsRequireContainer") }}
                    </p>
                  </div>

                  <div
                    v-if="
                      !propsEditor.isEntryTemplatePage.value &&
                      !isLoopSourceProp(prop) &&
                      !usesInheritedLoopSource(prop) &&
                      propsEditor.cmsDataSourceMode.value === 'single'
                    "
                    class="grid gap-2"
                  >
                    <div class="flex items-center gap-1.5">
                      <label
                        class="text-3xs uppercase font-semibold tracking-wide text-muted-foreground"
                        >{{ t("inspector.props.previewEntry") }}</label
                      >
                    </div>
                    <CmsEntryCommandSelect
                      :model-value="propsEditor.selectedCmsEntryId.value"
                      :target-collection="
                        propsEditor.selectedCollection.value?.id ?? ''
                      "
                      :disabled="!propsEditor.selectedCollection.value"
                      :placeholder="t('inspector.props.chooseEntry')"
                      @select="handleCmsSingleEntrySelect"
                    />
                  </div>

                  <div
                    v-if="
                      propsEditor.isSelectedNodeRepeatCapable.value &&
                      !usesInheritedLoopSource(prop) &&
                      !isLoopSourceProp(prop) &&
                      propsEditor.cmsDataSourceMode.value === 'list'
                    "
                    class="space-y-2"
                  >
                    <LoopQueryFields />

                    <div
                      v-if="showNestedLoopItemLink"
                      class="space-y-2"
                      data-testid="loop-item-link"
                    >
                      <p :class="INSPECTOR_SECTION_HINT_CLASS">
                        {{ t("inspector.props.wrapLoopItem") }}
                      </p>
                      <LinkProperty
                        embedded
                        :current-item-type="props.currentItemType"
                        :current-item-slug="props.currentItemSlug"
                        :target-node-id="
                          propsEditor.elementContext.value.nodeId ?? undefined
                        "
                      />
                    </div>

                    <LoopArchiveFilterFields />
                  </div>

                  <div
                    v-if="
                      !propsEditor.isSelectedNodeRepeatCapable.value &&
                      (isLoopSourceProp(prop) ||
                        propsEditor.cmsDataSourceMode.value === 'list')
                    "
                    class="flex items-start gap-1 rounded-sm border border-dashed border-border/50 bg-sidebar/50 px-2 py-1.5 text-3xs text-muted-foreground"
                  >
                    <span :class="[studioIcons.infoCircle, 'mt-0.5 size-3 shrink-0']" />
                    <span>
                      {{ t("inspector.props.cannotLoop") }}
                    </span>
                  </div>

                  <div
                    v-if="!isLoopSourceProp(prop)"
                    class="grid gap-2"
                  >
                    <InspectorPropBinding
                      :model-value="boundFieldModelValue(prop.name)"
                      :groups="cmsBindingGroupsForProp(prop)"
                      :picker-mode="templateBindingPickerMode"
                      :disabled="isTemplateFieldBindingDisabled()"
                      :placeholder="t('inspector.props.chooseField')"
                      @select="(path) => handleCmsFieldSelect(prop.name, path)"
                      @clear="handleCmsFieldClear(prop.name)"
                    />
                  </div>
                </template>
              </div>
            </section>
          </template>
          </div>
        </div>
      </div>
  </ScrollArea>
</template>
