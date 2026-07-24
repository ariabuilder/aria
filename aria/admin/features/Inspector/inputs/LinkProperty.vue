<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
import { computed, watch } from "vue";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BaseProperty from "./BaseProperty.vue";
import InspectorPropBinding from "../components/InspectorPropBinding.vue";
import LinkAnchorPickerField from "./LinkAnchorPickerField.vue";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import { usePropertySave, useSelectionTreeState } from "../../Core";
import type { BuilderNode } from "../../../../lib/types/nodes";
import {
  LINK_MODE_OPTIONS,
  useLinkPropertyForm,
} from "../composables/useLinkPropertyForm";
import type { LinkScope } from "../schemas/link.schema";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useInspectorPropBinding } from "../composables/useInspectorPropBinding";
import {
  INSPECTOR_INPUT_CLASS,
  INSPECTOR_SELECT_CONTENT_CLASS,
  INSPECTOR_SELECT_TRIGGER_CLASS,
} from "../constants/panelTokens";
import { useStudioI18n } from "@/i18n";

type ItemType = "page" | "layout" | "component";

const FIELD_LABEL_CLASS =
  "text-3xs font-semibold uppercase tracking-widest text-muted-foreground";
const EMBEDDED_FIELD_ROW_CLASS =
  "grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2";

interface Props {
  defaultOpen?: boolean;
  open?: boolean;
  currentItemType?: ItemType;
  currentItemSlug?: string;
  targetNodeId?: string;
  showScopeControl?: boolean;
  defaultScope?: LinkScope;
  embedded?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  defaultOpen: false,
  open: undefined,
  targetNodeId: undefined,
  showScopeControl: false,
  defaultScope: undefined,
  embedded: false,
});

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

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();
const { t } = useStudioI18n();

const { selectedNode, selectedNodeId, isLoading, error, saveProperties } =
  usePropertySave();
const { selectionTreeRootNodes } = useSelectionTreeState();
const resolvedTargetNodeId = computed(
  () => props.targetNodeId ?? selectedNodeId.value,
);
const targetNode = computed(() => {
  const targetId = resolvedTargetNodeId.value;
  if (!targetId) {
    return null;
  }

  if (selectedNode.value?.id === targetId) {
    return selectedNode.value;
  }

  return findNodeInSelectionTree(selectionTreeRootNodes.value, targetId);
});
const {
  form,
  validationError,
  anchorValidationError,
  isMediaPickerOpen,
  isPagePickerOpen,
  isAnchorPickerOpen,
  pageSearchQuery,
  anchorSearchQuery,
  hasLinkChanges,
  filteredPages,
  selectedPageOption,
  selectedPageLabel,
  selectedPagePath,
  mediaButtonLabel,
  filteredAnchorOptions,
  selectedAnchorOption,
  selectedAnchorTriggerLabel,
  selectedAnchorSubtitle,
  showCustomAnchorOption,
  normalizedAnchorSearchQuery,
  pageAnchorOptions,
  hasSelectedLinkMode,
  hasConfiguredHref,
  showOpenInNewTab,
  showDownload,
  showRelField,
  showTitleField,
  relNoOpenerEnabled,
  relNoReferrerEnabled,
  relNoFollowEnabled,
  getPageHref,
  setMode,
  setPageHref,
  setAnchorId,
  setMediaAsset,
  clearMediaSelection,
  setBooleanField,
  setRelToken,
  setLinkScope,
  serializeLinkState,
  validatePayload,
  shouldPersistLinkState,
  resetForm,
} = useLinkPropertyForm(targetNode, {
  defaultScope: props.defaultScope,
  pageRootNodes: selectionTreeRootNodes,
});

const hrefBinding = useInspectorPropBinding({
  propName: "href",
  propType: "string",
  value: computed(() =>
    typeof targetNode.value?.props?.href === "string"
      ? targetNode.value.props.href
      : "",
  ),
});

const linkModeOptions = computed(() => {
  const options = hrefBinding.hasCmsContext.value
    ? LINK_MODE_OPTIONS
    : LINK_MODE_OPTIONS.filter((option) => option.value !== "collection");
  return options.map((option) => ({
    ...option,
    label: t(`inspector.link.mode.${option.value}` as const),
  }));
});
const linkScopeOptions = computed<Array<{ value: LinkScope; label: string }>>(
  () => [
    { value: "row", label: t("inspector.link.scope.row") },
    { value: "text", label: t("inspector.link.scope.text") },
  ],
);

watch(
  () => hrefBinding.isBound.value,
  (isBound) => {
    if (isBound) {
      setMode("collection");
    }
  },
  { immediate: true },
);

function hasSaveContext(): boolean {
  return Boolean(
    resolvedTargetNodeId.value &&
      props.currentItemType &&
      props.currentItemSlug,
  );
}

const { isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading,
});
const showLinkScopeControl = computed(
  () => props.showScopeControl && hasConfiguredHref.value,
);
const linkModeRowClass = computed(() =>
  props.embedded ? EMBEDDED_FIELD_ROW_CLASS : "space-y-1.5",
);
const embeddedFieldRowClass = computed(() =>
  props.embedded ? EMBEDDED_FIELD_ROW_CLASS : "space-y-1.5",
);
const linkModeLabel = computed(() =>
  props.embedded ? t("inspector.section.link") : t("inspector.link.type"),
);
const selectTriggerClass = computed(() =>
  props.embedded
    ? `${INSPECTOR_SELECT_TRIGGER_CLASS} w-full`
    : "h-8 text-xs",
);
const embeddedInputClass = computed(() =>
  props.embedded ? INSPECTOR_INPUT_CLASS : "h-8 text-xs",
);
const embeddedOutlineButtonClass = computed(() =>
  props.embedded
    ? "h-9 w-full justify-between border-dashed border-border-70 bg-sidebar px-3 text-left text-xs font-normal hover:border-border hover:bg-sidebar-80"
    : "h-8 w-full justify-between px-3 text-left text-xs font-normal",
);
const embeddedSelectContentClass = computed(() =>
  props.embedded ? INSPECTOR_SELECT_CONTENT_CLASS : "",
);
const basePropertyProps = computed(() => {
  if (props.embedded) {
    return {};
  }

  return {
    open: props.open,
    defaultOpen: props.defaultOpen,
    hasChanges: hasLinkChanges.value,
    showReset: hasLinkChanges.value,
    resetDisabled: isPanelDisabled.value,
    resetAriaLabel: t("inspector.link.reset"),
    title: "Link",
    "onUpdate:open": (value: boolean) => emit("update:open", value),
    onReset: () => {
      void resetLink();
    },
  };
});

async function commitLink(): Promise<void> {
  if (form.value.mode === "collection") {
    return;
  }
  if (!resolvedTargetNodeId.value) return;
  if (!props.currentItemType || !props.currentItemSlug) return;

  const payload = serializeLinkState();
  if (!validatePayload(payload)) return;

  const currentHref =
    typeof targetNode.value?.props?.href === "string"
      ? targetNode.value.props.href
      : "";
  const currentTarget =
    targetNode.value?.props?.target === "_blank" ||
    targetNode.value?.props?.target === "_parent" ||
    targetNode.value?.props?.target === "_top"
      ? targetNode.value.props.target
      : "_self";
  const currentRel =
    typeof targetNode.value?.props?.rel === "string"
      ? targetNode.value.props.rel
      : "";
  const currentTitle =
    typeof targetNode.value?.props?.title === "string"
      ? targetNode.value.props.title
      : "";
  const currentDownload = targetNode.value?.props?.download === true;
  const currentLinkScope =
    targetNode.value?.props?.linkScope === "row" ||
    targetNode.value?.props?.linkScope === "text"
      ? targetNode.value.props.linkScope
      : undefined;

  const nextTarget = payload.target ?? "_self";
  const nextRel = payload.rel ?? "";
  const nextTitle = payload.title ?? "";
  const nextDownload = payload.download === true;
  const nextLinkScope =
    props.showScopeControl && payload.href ? payload.linkScope : undefined;

  if (
    currentHref === payload.href &&
    currentTarget === nextTarget &&
    currentRel === nextRel &&
    currentTitle === nextTitle &&
    currentDownload === nextDownload &&
    currentLinkScope === nextLinkScope
  ) {
    return;
  }

  await saveProperties(
    {
      href: payload.href || undefined,
      target: payload.target,
      rel: payload.rel,
      title: payload.title,
      download: payload.download,
      linkScope: nextLinkScope,
    },
    props.currentItemType,
    props.currentItemSlug,
    resolvedTargetNodeId.value,
  );
}

function handleModeChange(value: unknown): void {
  const nextMode = setMode(value);
  if (!nextMode) {
    return;
  }

  if (nextMode === "collection") {
    void hrefBinding.enterCollectionMode();
    return;
  }

  if (hrefBinding.isBound.value) {
    void hrefBinding.leaveCollectionMode();
  }

  if (shouldPersistLinkState()) {
    void commitLink();
  }
}

async function handleHrefFieldSelect(fieldPath: string): Promise<void> {
  await hrefBinding.bind(fieldPath);
  setMode("collection");
}

function handlePageChange(value: unknown): void {
  if (typeof value !== "string") return;
  setPageHref(value);
  void commitLink();
}

function handleAnchorSelect(id: string, fromList: boolean): void {
  if (!setAnchorId(id, { fromList })) {
    return;
  }

  void commitLink();
}

function handleAnchorSelectCustom(): void {
  if (!setAnchorId(anchorSearchQuery.value)) {
    return;
  }

  void commitLink();
}

function handleMediaSelect(asset: MediaAsset): void {
  setMediaAsset(asset);
  void commitLink();
}

function handleSwitchChange(
  field: "openInNewTab" | "downloadEnabled",
  value: boolean,
): void {
  setBooleanField(field, value);
  void commitLink();
}

function handleScopeChange(value: unknown): void {
  const nextScope = setLinkScope(value);
  if (!nextScope) {
    return;
  }

  void commitLink();
}

async function resetLink(): Promise<void> {
  resetForm();
  await commitLink();
}
</script>

<template>
  <component :is="embedded ? 'div' : BaseProperty" v-bind="basePropertyProps">
    <div class="space-y-4">
      <div data-testid="link-mode-row" :class="linkModeRowClass">
        <label
          data-testid="link-mode-label"
          :class="FIELD_LABEL_CLASS"
        >
          {{ linkModeLabel }}
        </label>
        <div :class="embedded ? 'min-w-0' : ''">
          <Select
            data-testid="link-mode-select"
            :model-value="form.mode"
            @update:model-value="handleModeChange"
          >
            <SelectTrigger
              data-testid="link-mode-select-trigger"
              :class="selectTriggerClass"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent :class="embeddedSelectContentClass">
              <SelectItem
                v-for="option in linkModeOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div v-if="form.mode === 'collection'" :class="embeddedFieldRowClass">
        <label :class="FIELD_LABEL_CLASS">{{ t("inspector.link.field") }}</label>
        <InspectorPropBinding
          variant="inline"
          :model-value="hrefBinding.boundPath.value"
          :groups="hrefBinding.fieldGroups.value"
          :picker-mode="hrefBinding.bindingPickerMode.value"
          :display-label="hrefBinding.displayLabel.value"
          :disabled="hrefBinding.pickerDisabled.value"
          :placeholder="t('inspector.props.chooseField')"
          @select="(path) => void handleHrefFieldSelect(path)"
          @clear="void hrefBinding.clear()"
        />
      </div>

      <div v-if="form.mode === 'page'" :class="embeddedFieldRowClass">
        <label :class="FIELD_LABEL_CLASS">{{ t("inspector.link.page") }}</label>
        <Popover v-model:open="isPagePickerOpen">
          <PopoverTrigger as-child>
            <Button
              type="button"
              variant="outline"
              :class="embeddedOutlineButtonClass"
            >
              <span
                class="flex min-w-0 flex-col items-start text-left leading-tight"
              >
                <span class="truncate text-xs text-foreground">{{
                  selectedPageLabel
                }}</span>
                <span
                  v-if="selectedPagePath"
                  class="truncate text-[10px] text-muted-foreground"
                >
                  {{ selectedPagePath }}
                </span>
              </span>
              <span
                :class="[studioIcons.magnifier, 'h-4 w-4 shrink-0 text-muted-foreground']"
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            :side-offset="6"
            class="w-88 p-1.5"
            @open-auto-focus.prevent
          >
            <div class="space-y-2">
              <Input
                v-model="pageSearchQuery"
                class="h-8 text-xs"
                :placeholder="t('inspector.link.searchPages')"
              />

              <ScrollArea class="max-h-72">
                <div class="space-y-1 pr-1">
                  <button
                    v-for="page in filteredPages"
                    :key="page.id"
                    type="button"
                    @click="handlePageChange(getPageHref(page.slug))"
                    :class="[
                      'flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                      selectedPageOption?.id === page.id
                        ? 'bg-secondary text-foreground'
                        : 'text-foreground/72 hover:bg-muted/25',
                    ]"
                  >
                    <span class="min-w-0 flex-1">
                      <span
                        class="flex items-center justify-between gap-2 text-xs font-medium"
                      >
                        <span class="truncate">{{
                          page.title || page.slug
                        }}</span>
                        <span
                          v-if="selectedPageOption?.id === page.id"
                          :class="[studioIcons.checkCircleBold, 'size-4 text-primary']"
                        />
                      </span>
                      <span
                        class="mt-1 block truncate text-[11px] text-foreground/45"
                      >
                        {{ getPageHref(page.slug) }}
                      </span>
                    </span>
                  </button>

                  <div
                    v-if="filteredPages.length === 0"
                    class="rounded-md px-3 py-4 text-center text-xs text-foreground/45"
                  >
                    {{ t("inspector.link.noPages") }}
                  </div>
                </div>
              </ScrollArea>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div v-else-if="form.mode === 'url'" :class="embeddedFieldRowClass">
        <label :class="FIELD_LABEL_CLASS">{{ t("inspector.link.url") }}</label>
        <Input
          v-model="form.urlHref"
          :class="embeddedInputClass"
          placeholder="https://example.com"
          @blur="commitLink"
        />
      </div>

      <div v-else-if="form.mode === 'media'" :class="embeddedFieldRowClass">
        <label :class="FIELD_LABEL_CLASS">{{ t("inspector.link.media") }}</label>
        <div class="flex items-center gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            class="h-8 px-3 text-xs"
            @click="isMediaPickerOpen = true"
          >
            {{ mediaButtonLabel }}
          </Button>
          <Button
            v-if="form.mediaHref"
            type="button"
            variant="ghost"
            size="sm"
            class="h-8 px-2 text-xs text-muted-foreground"
            @click="
              clearMediaSelection();
              void commitLink();
            "
          >
            {{ t("inspector.link.clearMedia") }}
          </Button>
        </div>
      </div>

      <LinkAnchorPickerField
        v-else-if="form.mode === 'anchor'"
        v-model:open="isAnchorPickerOpen"
        v-model:anchor-search-query="anchorSearchQuery"
        :row-class="embeddedFieldRowClass"
        :filtered-anchor-options="filteredAnchorOptions"
        :selected-anchor-option="selectedAnchorOption"
        :selected-anchor-trigger-label="selectedAnchorTriggerLabel"
        :selected-anchor-subtitle="selectedAnchorSubtitle"
        :show-custom-anchor-option="showCustomAnchorOption"
        :normalized-anchor-search-query="normalizedAnchorSearchQuery"
        :anchor-validation-error="anchorValidationError"
        :has-anchor-options="pageAnchorOptions.length > 0"
        @select="handleAnchorSelect"
        @select-custom="handleAnchorSelectCustom"
      />

      <div v-else-if="form.mode === 'email'" class="space-y-3">
        <div :class="embeddedFieldRowClass">
          <label :class="FIELD_LABEL_CLASS">{{ t("inspector.link.email") }}</label>
          <Input
            v-model="form.emailAddress"
            :class="embeddedInputClass"
            placeholder="hello@example.com"
            @blur="commitLink"
          />
        </div>
        <div :class="embeddedFieldRowClass">
          <label :class="FIELD_LABEL_CLASS">{{ t("inspector.link.subject") }}</label>
          <Input
            v-model="form.emailSubject"
            :class="embeddedInputClass"
            :placeholder="t('inspector.link.subjectPlaceholder')"
            @blur="commitLink"
          />
        </div>
      </div>

      <div v-else-if="form.mode === 'phone'" :class="embeddedFieldRowClass">
        <label :class="FIELD_LABEL_CLASS">{{ t("inspector.link.phone") }}</label>
        <Input
          v-model="form.phoneNumber"
          :class="embeddedInputClass"
          placeholder="+1 555 123 4567"
          @blur="commitLink"
        />
      </div>

      <div
        v-if="showOpenInNewTab"
        class="flex items-center justify-between gap-3 rounded-md border border-dashed border-border/50 px-3 py-2"
      >
        <div class="text-xs font-medium text-foreground">{{ t("inspector.link.newTab") }}</div>
        <Switch
          :model-value="form.openInNewTab"
          @update:model-value="
            handleSwitchChange('openInNewTab', Boolean($event))
          "
        />
      </div>

      <div
        v-if="showRelField"
        class="space-y-2 rounded-md border border-dashed border-border/50 px-3 py-3"
      >
        <div class="text-xs font-medium text-foreground">{{ t("inspector.link.rel") }}</div>

        <div class="flex items-center justify-between gap-3">
          <div class="text-xs text-foreground">{{ t("inspector.link.noOpener") }}</div>
          <Switch
            :model-value="relNoOpenerEnabled"
            @update:model-value="setRelToken('noopener', Boolean($event))"
          />
        </div>

        <div class="flex items-center justify-between gap-3">
          <div class="text-xs text-foreground">{{ t("inspector.link.noReferrer") }}</div>
          <Switch
            :model-value="relNoReferrerEnabled"
            @update:model-value="setRelToken('noreferrer', Boolean($event))"
          />
        </div>

        <div class="flex items-center justify-between gap-3">
          <div class="text-xs text-foreground">{{ t("inspector.link.noFollow") }}</div>
          <Switch
            :model-value="relNoFollowEnabled"
            @update:model-value="setRelToken('nofollow', Boolean($event))"
          />
        </div>
      </div>

      <div
        v-if="showDownload"
        class="flex items-center justify-between gap-3 rounded-md border border-dashed border-border/50 px-3 py-2"
      >
        <div class="text-xs font-medium text-foreground">{{ t("inspector.link.download") }}</div>
        <Switch
          :model-value="form.downloadEnabled"
          @update:model-value="
            handleSwitchChange('downloadEnabled', Boolean($event))
          "
        />
      </div>

      <div
        v-if="showTitleField"
        data-testid="link-title-field"
        :class="embeddedFieldRowClass"
      >
        <label :class="FIELD_LABEL_CLASS">{{ t("inspector.link.titleAttribute") }}</label>
        <Input
          v-model="form.title"
          class="h-8 text-xs"
          :placeholder="t('inspector.link.titlePlaceholder')"
          @blur="commitLink"
        />
      </div>

      <div v-if="showLinkScopeControl" :class="embeddedFieldRowClass">
        <label :class="FIELD_LABEL_CLASS">{{ t("inspector.link.scope") }}</label>
        <Select
          data-testid="link-scope-select"
          :model-value="form.linkScope"
          @update:model-value="handleScopeChange"
        >
          <SelectTrigger class="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in linkScopeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div v-if="validationError" class="text-xs text-destructive">
        {{ validationError }}
      </div>

      <div v-if="error" class="text-xs text-destructive">
        {{ error }}
      </div>

      <MediaPickerDialog
        v-model:open="isMediaPickerOpen"
        :title="t('inspector.link.selectMedia')"
        :description="t('inspector.link.mediaDescription')"
        @select="handleMediaSelect"
      />
    </div>
  </component>
</template>
