<script setup lang="ts">
import { computed, defineAsyncComponent, ref, toRaw, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ColorField } from "@/components/ui/color-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBuilderData } from "@/composables/useBuilderData";
import { studioIcons } from "@/lib/icons";
import { IconPickerDialog } from "@/components/ui/icon-picker";
import type { FieldSchema } from "../../../../lib/cms/schemas";
import {
  StructuredTextDocumentSchema,
  type StructuredTextDocument,
} from "../../../../lib/cms/structuredText";
import {
  cloneCmsRepeaterItemDraft,
  createFrontmatterDraft,
  isEditableCmsField,
  normalizeCmsLinkDraftValue,
  normalizeCmsMediaDraftValue,
  resolveCmsRepeaterItemTitle,
  type CmsLinkDraftValue,
} from "../lib/frontmatterForm";
import { isCmsColorField } from "../lib/colorField";
import CmsCollectionIconPreview from "./CmsCollectionIconPreview.vue";
import CmsEntryCommandSelect from "./CmsEntryCommandSelect.vue";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import CoverImageCard from "@/features/Studio/media/components/CoverImageCard.vue";
import { useMediaAssets } from "@/features/Studio/media/composables/useMediaAssets";
import type { MediaAsset, MediaAssetType } from "@/features/Studio/media/types/media";
import { getThumbnailUrl, handleThumbnailError } from "@/features/Studio/media/utils";
import type { CmsEntryRow } from "../lib/entryRow";
import { resolveEntryLabels } from "../lib/resolveEntryLabels";
import { cmsImageFieldLayout } from "../lib/imageFieldLayout";
import { resolveCmsMediaPreviewUrl } from "../lib/resolveMediaPreviewUrl";
import StructuredTextEditor from "./StructuredTextEditor.vue";
import { useStudioI18n } from "@/i18n";

const draggable = defineAsyncComponent(() => import("vuedraggable"));
const repeaterItemKeys = new WeakMap<Record<string, unknown>, string>();
let repeaterItemKeyIndex = 0;

const props = withDefaults(
  defineProps<{
    field: FieldSchema;
    modelValue: unknown;
    disabled?: boolean;
    error?: string;
    hideLinkLabel?: boolean;
    hideLinkNewTab?: boolean;
  }>(),
  {
    disabled: false,
    error: undefined,
    hideLinkLabel: false,
    hideLinkNewTab: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: unknown];
}>();
const { t } = useStudioI18n();

defineOptions({
  name: "CmsFrontmatterField",
});

const fieldId = computed(() => `cms-field-${props.field.key}`);
const isRequired = computed(() => props.field.required === true);
const isEditable = computed(() => isEditableCmsField(props.field));
const { pages } = useBuilderData();
const { assets, loadAssets } = useMediaAssets();
const isMediaPickerOpen = ref(false);
const isIconPickerOpen = ref(false);
const isMediaMetaOpen = ref(false);
const selectedMedia = ref<{ id: string; name: string } | null>(null);
const selectedEntryTitle = ref<string | null>(null);
const selectedLinkEntryTitle = ref<string | null>(null);
const selectedRelationTitles = ref<Record<string, string>>({});
const expandedRepeaterIndex = ref<number | null>(null);
const draggedExpandedRepeaterItemKey = ref<string | null>(null);

const stringValue = computed({
  get: () => {
    const value = props.modelValue;
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
    return "";
  },
  set: (value: string | number) => emit("update:modelValue", String(value)),
});

const booleanValue = computed({
  get: () => props.modelValue === true,
  set: (value: boolean | "indeterminate") =>
    emit("update:modelValue", value === true),
});

const multiSelectValue = computed<string[]>({
  get: () => {
    if (Array.isArray(props.modelValue)) {
      return props.modelValue.filter(
        (value): value is string => typeof value === "string",
      );
    }
    if (typeof props.modelValue === "string") {
      return props.modelValue
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
    return [];
  },
  set: (value: string[]) => emit("update:modelValue", value),
});

const jsonValue = computed({
  get: () => {
    if (typeof props.modelValue === "string") {
      return props.modelValue;
    }
    if (props.modelValue == null) {
      return "{}";
    }
    return JSON.stringify(props.modelValue, null, 2);
  },
  set: (value: string | number) => emit("update:modelValue", String(value)),
});

const structuredTextValue = computed<StructuredTextDocument>({
  get: () => {
    const parsed = StructuredTextDocumentSchema.safeParse(props.modelValue);
    return parsed.success ? parsed.data : [];
  },
  set: (value) => emit("update:modelValue", value),
});

const nestedFields = computed(() => props.field.fields ?? []);
const nestedFieldsHaveStandaloneOpenInNewTab = computed(() =>
  nestedFields.value.some(
    (field) => field.key === "openInNewTab" && field.type === "boolean",
  ),
);
const nestedFieldsHaveStandaloneLinkLabel = computed(() =>
  nestedFields.value.some(
    (field) =>
      field.key === "label" &&
      (field.type === "string" || field.type === "text"),
  ),
);

const objectValue = computed<Record<string, unknown>>({
  get: () => {
    const value = props.modelValue;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return createFrontmatterDraft(nestedFields.value);
  },
  set: (value) => emit("update:modelValue", value),
});

const repeaterValue = computed<Record<string, unknown>[]>({
  get: () => {
    if (!Array.isArray(props.modelValue)) {
      return [];
    }
    return props.modelValue.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null && !Array.isArray(item),
    );
  },
  set: (value) => emit("update:modelValue", value),
});
const repeaterAddButtonLabel = computed(() => {
  const label = props.field.repeaterDisplay?.addButtonLabel?.trim();
  return label || t("collections.field.addPlaceholder");
});
const repeaterTitleFieldKey = computed(() =>
  props.field.repeaterDisplay?.titleFieldKey?.trim(),
);

function mediaDraftValue(): Record<string, string> {
  const draft = normalizeCmsMediaDraftValue(props.modelValue);
  return {
    mediaId: draft.mediaId,
    alt: draft.alt ?? "",
    caption: draft.caption ?? "",
    label: draft.label ?? "",
  };
}

function updateMediaDraft(
  key: "mediaId" | "alt" | "caption" | "label",
  value: string,
): void {
  emit("update:modelValue", {
    ...mediaDraftValue(),
    [key]: value,
  });
}

const mediaIdValue = computed({
  get: () => mediaDraftValue().mediaId,
  set: (value: string | number) => updateMediaDraft("mediaId", String(value)),
});

const mediaPickerType = computed<MediaAssetType | undefined>(() =>
  props.field.type === "image"
    ? "image"
    : props.field.type === "file"
      ? "document"
      : undefined,
);

const selectedMediaAsset = computed<MediaAsset | null>(() => {
  const mediaId = mediaIdValue.value;
  if (!mediaId) {
    return null;
  }

  return assets.value.find((asset) => asset.id === mediaId) ?? null;
});

const selectedImageAsset = computed<MediaAsset | null>(() => {
  const asset = selectedMediaAsset.value;
  if (!asset || props.field.type !== "image") {
    return null;
  }

  return asset.type === "image" || asset.type === "icon" ? asset : null;
});

const selectedImagePreviewUrl = computed(() => {
  const asset = selectedImageAsset.value;
  return asset
    ? getThumbnailUrl(asset)
    : resolveCmsMediaPreviewUrl(mediaIdValue.value);
});

const selectedMediaLabel = computed(() => {
  const mediaId = mediaIdValue.value;
  if (selectedMediaAsset.value) {
    return selectedMediaAsset.value.name;
  }
  if (selectedMedia.value?.id === mediaId) {
    return selectedMedia.value.name;
  }
  return mediaId
    ? t("cms.field.selected", { value: mediaId })
    : t("cms.field.noMedia");
});

const selectedReferenceLabel = computed(() => {
  if (selectedEntryTitle.value) {
    return selectedEntryTitle.value;
  }
  return stringValue.value
    ? t("cms.field.selected", { value: stringValue.value })
    : t("cms.entryPicker.empty");
});

const relationValue = computed<string[]>({
  get: () => {
    if (Array.isArray(props.modelValue)) {
      return props.modelValue.filter(
        (value): value is string => typeof value === "string",
      );
    }
    if (typeof props.modelValue === "string" && props.modelValue.trim()) {
      return [props.modelValue.trim()];
    }
    return [];
  },
  set: (value) => emit("update:modelValue", value),
});

const relationIdsKey = computed(() => relationValue.value.join("\u0000"));

const mediaAltValue = computed({
  get: () => mediaDraftValue().alt,
  set: (value: string | number) => updateMediaDraft("alt", String(value)),
});

const mediaCaptionValue = computed({
  get: () => mediaDraftValue().caption,
  set: (value: string | number) => updateMediaDraft("caption", String(value)),
});

const imageFieldLayout = computed(() =>
  props.field.type === "image" ? cmsImageFieldLayout(props.field) : null,
);

const isCompactImageLayout = computed(
  () => imageFieldLayout.value === "compact",
);

const imageActionLabel = computed(() => {
  if (mediaIdValue.value) {
    return t("cms.field.replaceImage");
  }
  return imageFieldLayout.value === "cover"
    ? t("cms.field.addCover")
    : t("cms.field.chooseImage");
});

const fileLabelValue = computed({
  get: () => mediaDraftValue().label,
  set: (value: string | number) => updateMediaDraft("label", String(value)),
});

const sortedPages = computed(() =>
  [...pages.value].sort((left, right) =>
    (left.title || left.slug).localeCompare(right.title || right.slug),
  ),
);

function pageHref(slug: string): string {
  return slug === "index" ? "/" : `/${slug.replace(/^\/+/, "")}`;
}

function linkDraftValue(): CmsLinkDraftValue {
  return normalizeCmsLinkDraftValue(props.modelValue);
}

function updateLinkDraft(next: Partial<CmsLinkDraftValue>): void {
  emit("update:modelValue", {
    ...linkDraftValue(),
    ...next,
  });
}

const linkTypeValue = computed({
  get: () => linkDraftValue().type,
  set: (value: CmsLinkDraftValue["type"]) => updateLinkDraft({ type: value }),
});

const linkUrlValue = computed({
  get: () => linkDraftValue().url,
  set: (value: string | number) => updateLinkDraft({ url: String(value) }),
});

const linkLabelValue = computed({
  get: () => linkDraftValue().label,
  set: (value: string | number) => updateLinkDraft({ label: String(value) }),
});

const linkOpenInNewTabValue = computed({
  get: () => linkDraftValue().openInNewTab,
  set: (value: boolean | "indeterminate") =>
    updateLinkDraft({ openInNewTab: value === true }),
});

const selectedLinkPageLabel = computed(() => {
  const draft = linkDraftValue();
  const page = pages.value.find(
    (candidate) =>
      candidate.id === draft.pageId ||
      candidate.slug === draft.slug ||
      pageHref(candidate.slug) === draft.url,
  );
  return page?.title || page?.slug || t("cms.field.link.selectPage");
});

const selectedLinkEntryLabel = computed(() => {
  if (selectedLinkEntryTitle.value) {
    return selectedLinkEntryTitle.value;
  }
  const draft = linkDraftValue();
  return draft.entryId
    ? t("cms.field.selected", { value: draft.entryId })
    : t("cms.entryPicker.empty");
});

function openMediaPicker(): void {
  if (props.disabled) return;
  isMediaPickerOpen.value = true;
}

function openIconPicker(): void {
  if (props.disabled) return;
  isIconPickerOpen.value = true;
}

function toggleMediaMeta(): void {
  isMediaMetaOpen.value = !isMediaMetaOpen.value;
}

function clearMedia(): void {
  selectedMedia.value = null;
  isMediaMetaOpen.value = false;
  emit("update:modelValue", {
    ...mediaDraftValue(),
    mediaId: "",
  });
}

function handleIconSelect(icon: string): void {
  stringValue.value = icon;
}

function clearIcon(): void {
  stringValue.value = "";
}

function handleMediaSelect(asset: MediaAsset): void {
  const current = mediaDraftValue();
  selectedMedia.value = { id: asset.id, name: asset.name };
  emit("update:modelValue", {
    ...current,
    mediaId: asset.id,
    alt:
      props.field.type === "image" && !current.alt.trim()
        ? asset.name
        : current.alt,
    label:
      props.field.type === "file" && !current.label.trim()
        ? asset.name
        : current.label,
  });
}

function handleSelectedImageError(event: Event): void {
  const asset = selectedImageAsset.value;
  if (!asset) {
    return;
  }

  handleThumbnailError(event, asset);
}

function clearReference(): void {
  selectedEntryTitle.value = null;
  emit("update:modelValue", "");
}

function handleEntrySelect(entry: CmsEntryRow): void {
  selectedEntryTitle.value = entry.title;
  emit("update:modelValue", entry.id);
}

function handleLinkPageSelect(page: { id: string; slug: string; title?: string }): void {
  updateLinkDraft({
    type: "page",
    pageId: page.id,
    slug: page.slug,
    url: pageHref(page.slug),
  });
}

function handleLinkEntrySelect(entry: CmsEntryRow): void {
  selectedLinkEntryTitle.value = entry.title;
  updateLinkDraft({
    type: "entry",
    entryId: entry.id,
    collectionId: entry.collectionId,
    slug: entry.slug,
  });
}

function handleRelationEntrySelect(entry: CmsEntryRow): void {
  if (relationValue.value.includes(entry.id)) {
    return;
  }
  selectedRelationTitles.value = {
    ...selectedRelationTitles.value,
    [entry.id]: entry.title,
  };
  relationValue.value = [...relationValue.value, entry.id];
}

function removeRelationEntry(entryId: string): void {
  const nextTitles = { ...selectedRelationTitles.value };
  delete nextTitles[entryId];
  selectedRelationTitles.value = nextTitles;
  relationValue.value = relationValue.value.filter((value) => value !== entryId);
}

function relationEntryLabel(entryId: string): string {
  return selectedRelationTitles.value[entryId] ?? entryId;
}

async function hydrateTargetEntryTitles(): Promise<void> {
  const targetCollection = props.field.targetCollection?.trim();
  if (!targetCollection) {
    return;
  }

  const ids =
    props.field.type === "relation"
      ? relationValue.value
      : props.field.type === "reference" && stringValue.value
        ? [stringValue.value]
        : [];

  const unresolvedIds = ids.filter((id) => {
    if (!id) {
      return false;
    }
    if (props.field.type === "reference") {
      return !selectedEntryTitle.value;
    }
    return selectedRelationTitles.value[id] === undefined;
  });
  if (unresolvedIds.length === 0) {
    return;
  }

  try {
    const labels = await resolveEntryLabels(targetCollection, unresolvedIds);

    if (props.field.type === "reference" && stringValue.value) {
      selectedEntryTitle.value = labels[stringValue.value] ?? null;
      return;
    }

    if (props.field.type === "relation") {
      selectedRelationTitles.value = {
        ...selectedRelationTitles.value,
        ...labels,
      };
    }
  } catch {
    // Keep UUID fallback labels if the lookup fails; saving should still work.
  }
}

watch(
  () => [
    props.field.type,
    props.field.targetCollection,
    stringValue.value,
    relationIdsKey.value,
  ],
  () => {
    if (props.field.type === "reference" || props.field.type === "relation") {
      void hydrateTargetEntryTitles();
    }
  },
  { immediate: true },
);

function isMultiSelectOptionSelected(option: string): boolean {
  return multiSelectValue.value.includes(option);
}

function toggleMultiSelectOption(option: string): void {
  if (props.disabled) {
    return;
  }
  const current = multiSelectValue.value;
  multiSelectValue.value = current.includes(option)
    ? current.filter((value) => value !== option)
    : [...current, option];
}

function updateObjectField(fieldKey: string, value: unknown): void {
  objectValue.value = {
    ...objectValue.value,
    [fieldKey]: value,
  };
}

function createRepeaterItem(): Record<string, unknown> {
  return createFrontmatterDraft(nestedFields.value);
}

function addRepeaterItem(): void {
  if (props.disabled) {
    return;
  }
  const next = [...repeaterValue.value, createRepeaterItem()];
  repeaterValue.value = next;
  expandedRepeaterIndex.value = next.length - 1;
}

function duplicateRepeaterItem(index: number): void {
  if (props.disabled) {
    return;
  }
  const item = repeaterValue.value[index];
  if (!item) {
    return;
  }
  const next = [...repeaterValue.value];
  next.splice(index + 1, 0, cloneCmsRepeaterItemDraft(item));
  repeaterValue.value = next;
  expandedRepeaterIndex.value = index + 1;
}

function removeRepeaterItem(index: number): void {
  if (props.disabled) {
    return;
  }
  repeaterValue.value = repeaterValue.value.filter((_, itemIndex) => itemIndex !== index);
  if (expandedRepeaterIndex.value === index) {
    expandedRepeaterIndex.value = null;
    return;
  }
  if (
    expandedRepeaterIndex.value !== null &&
    expandedRepeaterIndex.value > index
  ) {
    expandedRepeaterIndex.value -= 1;
  }
}

function updateRepeaterItemField(
  index: number,
  fieldKey: string,
  value: unknown,
): void {
  const next = repeaterValue.value.map((item, itemIndex) => {
    if (itemIndex !== index) {
      return item;
    }

    // The draft must remain immutable, but the draggable row key must survive
    // replacing an item. Otherwise Vue remounts the row on every keystroke and
    // the nested input loses focus.
    const nextItem = { ...item, [fieldKey]: value };
    repeaterItemKeys.set(toRaw(nextItem), getRepeaterItemKey(item));
    return nextItem;
  });
  repeaterValue.value = next;
}

function getRepeaterItemKey(item: Record<string, unknown>): string {
  const itemIdentity = toRaw(item);
  const existing = repeaterItemKeys.get(itemIdentity);
  if (existing) {
    return existing;
  }
  const key = `${props.field.key}-${repeaterItemKeyIndex}`;
  repeaterItemKeyIndex += 1;
  repeaterItemKeys.set(itemIdentity, key);
  return key;
}

function repeaterItemTitle(item: Record<string, unknown>, index: number): string {
  return resolveCmsRepeaterItemTitle(
    nestedFields.value,
    item,
    index,
    repeaterTitleFieldKey.value,
  );
}

function setRepeaterItemOpen(index: number, open: boolean): void {
  expandedRepeaterIndex.value = open ? index : null;
}

function toggleRepeaterItem(index: number): void {
  expandedRepeaterIndex.value =
    expandedRepeaterIndex.value === index ? null : index;
}

function moveRepeaterItem(index: number, direction: -1 | 1): void {
  if (props.disabled) {
    return;
  }
  const targetIndex = index + direction;
  const next = [...repeaterValue.value];
  if (targetIndex < 0 || targetIndex >= next.length) {
    return;
  }
  const [item] = next.splice(index, 1);
  if (!item) {
    return;
  }
  next.splice(targetIndex, 0, item);
  repeaterValue.value = next;

  if (expandedRepeaterIndex.value === index) {
    expandedRepeaterIndex.value = targetIndex;
  } else if (expandedRepeaterIndex.value === targetIndex) {
    expandedRepeaterIndex.value = index;
  }
}

function handleRepeaterDragStart(): void {
  const index = expandedRepeaterIndex.value;
  const item = index === null ? null : repeaterValue.value[index];
  draggedExpandedRepeaterItemKey.value = item ? getRepeaterItemKey(item) : null;
}

function handleRepeaterDragEnd(): void {
  const expandedKey = draggedExpandedRepeaterItemKey.value;
  draggedExpandedRepeaterItemKey.value = null;
  if (!expandedKey) {
    return;
  }
  const nextIndex = repeaterValue.value.findIndex(
    (item) => getRepeaterItemKey(item) === expandedKey,
  );
  expandedRepeaterIndex.value = nextIndex >= 0 ? nextIndex : null;
}

watch(
  mediaIdValue,
  (mediaId) => {
    if (!mediaId) {
      return;
    }

    void loadAssets({ silent: true });
  },
  { immediate: true },
);

watch(
  () => [props.field.key, repeaterValue.value.length] as const,
  ([, length]) => {
    if (length === 0) {
      expandedRepeaterIndex.value = null;
      return;
    }
    if (
      expandedRepeaterIndex.value !== null &&
      expandedRepeaterIndex.value >= length
    ) {
      expandedRepeaterIndex.value = length - 1;
    }
  },
);
</script>

<template>
  <div v-if="isEditable" class="grid gap-2">
    <Label
      v-if="field.type !== 'repeater' && (field.type !== 'image' || isCompactImageLayout)"
      :for="fieldId"
      class="m-0 text-sm! leading-none text-muted-foreground"
    >
      {{ field.label }}<span v-if="isRequired" aria-hidden="true"> *</span>
    </Label>

    <Textarea
      v-if="field.type === 'text'"
      :id="fieldId"
      v-model="stringValue"
      rows="3"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
    />

    <StructuredTextEditor
      v-else-if="field.type === 'structuredText' || field.type === 'richtext'"
      v-model="structuredTextValue"
      :disabled="disabled"
      :placeholder="`Write ${field.label.toLowerCase()}...`"
      min-height-class="min-h-28"
    />

    <Input
      v-else-if="field.type === 'number' || field.type === 'integer'"
      :id="fieldId"
      v-model="stringValue"
      type="number"
      :step="field.type === 'integer' ? 1 : 'any'"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
    />

    <div
      v-else-if="field.type === 'boolean'"
      class="flex h-9 items-center gap-2"
    >
      <Checkbox
        :id="fieldId"
        v-model="booleanValue"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
      />
      <span class="text-xs text-muted-foreground">{{ field.label }}</span>
    </div>

    <Input
      v-else-if="field.type === 'date'"
      :id="fieldId"
      v-model="stringValue"
      type="date"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
    />

    <Input
      v-else-if="field.type === 'datetime'"
      :id="fieldId"
      v-model="stringValue"
      type="datetime-local"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
    />

    <Select
      v-else-if="field.type === 'select'"
      v-model="stringValue"
      :disabled="disabled"
    >
      <SelectTrigger :id="fieldId" :aria-invalid="error ? 'true' : undefined">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          v-for="option in field.options ?? []"
          :key="option"
          :value="option"
        >
          {{ option }}
        </SelectItem>
      </SelectContent>
    </Select>

    <ColorField
      v-else-if="isCmsColorField(field)"
      v-model="stringValue"
      :disabled="disabled"
      show-alpha
      show-design-colors
      layout="unified"
      persist-mode="commit"
      :aria-invalid="error ? 'true' : undefined"
    />

    <div
      v-else-if="field.type === 'image' && isCompactImageLayout"
      :id="fieldId"
      class="grid w-fit max-w-full gap-3"
      :aria-invalid="error ? 'true' : undefined"
    >
      <div class="flex items-start gap-3">
        <button
          type="button"
          class="group relative size-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/10 transition-colors hover:border-primary/40 hover:bg-muted/20 disabled:pointer-events-none disabled:opacity-50"
          :class="mediaIdValue ? 'border-solid' : 'border-dashed'"
          :disabled="disabled"
          :aria-label="imageActionLabel"
          @click="openMediaPicker"
        >
          <img
            v-if="mediaIdValue && selectedImagePreviewUrl && selectedImageAsset"
            :src="selectedImagePreviewUrl"
            :alt="mediaAltValue || selectedMediaLabel"
            class="size-full object-cover"
            @error="handleSelectedImageError"
          />
          <div
            v-else-if="mediaIdValue"
            class="flex size-full items-center justify-center px-2 text-center text-2xs text-muted-foreground"
          >
            {{ selectedMediaLabel }}
          </div>
          <div
            v-else
            class="flex size-full items-center justify-center"
          >
            <span :class="[studioIcons.image, 'size-5 text-muted-foreground/60']" />
          </div>
          <div
            class="absolute inset-0 flex items-center justify-center bg-background/50 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <span
              :class="[
                mediaIdValue ? studioIcons.edit : studioIcons.plus,
                'size-4 text-foreground',
              ]"
            />
          </div>
        </button>

        <div class="grid min-w-0 gap-2 pt-0.5">
          <div class="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="disabled"
              @click="openMediaPicker"
            >
              {{ imageActionLabel }}
            </Button>
            <Button
              v-if="mediaIdValue"
              type="button"
              variant="ghost"
              size="sm"
              :disabled="disabled"
              @click="clearMedia"
            >
              {{ t("cms.field.remove") }}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              :disabled="disabled"
              @click="toggleMediaMeta"
            >
              {{ t("cms.field.altCaption") }}
            </Button>
          </div>
          <p class="m-0 text-2xs leading-snug text-muted-foreground">
            {{ t("cms.field.imageFormats") }}
          </p>
        </div>
      </div>

      <div
        v-if="isMediaMetaOpen"
        class="grid w-full max-w-sm gap-2 rounded-md border border-border bg-card/20 p-3"
      >
        <Input
          v-model="mediaAltValue"
          :placeholder="t('cms.field.altText')"
          :disabled="disabled"
        />
        <Input
          v-model="mediaCaptionValue"
          :placeholder="t('cms.field.caption')"
          :disabled="disabled"
        />
      </div>
    </div>

    <CoverImageCard
      v-else-if="field.type === 'image'"
      :id="fieldId"
      :label="field.label"
      :required="isRequired"
      :disabled="disabled"
      :error="error"
      :has-image="!!mediaIdValue"
      :image-url="selectedImagePreviewUrl"
      :image-alt="mediaAltValue"
      :fallback-label="selectedMediaLabel"
      :action-label="imageActionLabel"
      show-alt-caption
      show-caption
      v-model:alt="mediaAltValue"
      v-model:caption="mediaCaptionValue"
      @choose="openMediaPicker"
      @remove="clearMedia"
      @image-error="handleSelectedImageError"
    />

    <div v-else-if="field.type === 'file'" class="grid gap-2">
      <div class="flex items-center justify-between gap-2 rounded-md border border-border bg-card/30 px-3 py-2">
        <span class="truncate text-xs text-muted-foreground">
          {{ selectedMediaLabel }}
        </span>
        <div class="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            :disabled="disabled"
            @click="openMediaPicker"
          >
            {{ mediaIdValue ? t("cms.field.change") : t("cms.field.choose") }}
          </Button>
          <Button
            v-if="mediaIdValue"
            type="button"
            variant="ghost"
            size="sm"
            :disabled="disabled"
            @click="clearMedia"
          >
            {{ t("cms.field.clear") }}
          </Button>
        </div>
      </div>
      <Input
        v-model="fileLabelValue"
        :placeholder="t('cms.field.fileLabel')"
        :disabled="disabled"
      />
    </div>

    <div v-else-if="field.type === 'icon'" class="grid gap-2">
      <div class="inline-flex w-fit max-w-full items-center gap-2 rounded-md border border-border bg-card/30 px-3 py-2">
        <div class="flex min-w-0 items-center gap-2">
          <button
            type="button"
            class="grid size-7 shrink-0 place-items-center rounded-sm border border-border/50 bg-muted/20 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-input hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            :disabled="disabled"
            :aria-label="stringValue ? t('cms.field.changeIcon') : t('cms.field.chooseIcon')"
            @click="openIconPicker"
          >
            <CmsCollectionIconPreview
              v-if="stringValue"
              :value="stringValue"
              class="size-4"
            />
            <span v-else :class="[studioIcons.image, 'size-4 opacity-60']" />
          </button>
          <span class="truncate text-xs text-muted-foreground">
            {{ stringValue || t("cms.field.noIcon") }}
          </span>
        </div>
        <div class="flex shrink-0 gap-1.5">
          <Button
            v-if="stringValue"
            type="button"
            variant="ghost"
            size="icon-sm"
            :disabled="disabled"
            :aria-label="t('cms.field.clearIcon')"
            :title="t('cms.field.clearIcon')"
            @click="clearIcon"
          >
            <span :class="[studioIcons.close, 'size-3.5']" />
          </Button>
        </div>
      </div>
    </div>

    <div v-else-if="field.type === 'reference'" class="grid gap-2">
      <CmsEntryCommandSelect
        :model-value="stringValue"
        :target-collection="field.targetCollection ?? ''"
        :disabled="disabled || !field.targetCollection"
        :placeholder="selectedReferenceLabel"
        clearable
        class="min-w-0 w-full"
        @select="handleEntrySelect"
        @clear="clearReference"
      />
    </div>

    <div v-else-if="field.type === 'relation'" class="grid gap-2">
      <CmsEntryCommandSelect
        model-value=""
        :target-collection="field.targetCollection ?? ''"
        :disabled="disabled || !field.targetCollection"
        :placeholder="t('cms.field.addRelated')"
        @select="handleRelationEntrySelect"
      />
      <div v-if="relationValue.length > 0" class="flex flex-wrap gap-1.5">
        <button
          v-for="entryId in relationValue"
          :key="entryId"
          type="button"
          class="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-border/50 bg-card/30 px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/35 hover:bg-card/45 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          :disabled="disabled"
          @click="removeRelationEntry(entryId)"
        >
          <span class="truncate">{{ relationEntryLabel(entryId) }}</span>
          <span :class="[studioIcons.close, 'size-3 shrink-0']" />
        </button>
      </div>
      <p v-else class="text-xs text-muted-foreground">
        {{ t("cms.field.noRelated") }}
      </p>
    </div>

    <div v-else-if="field.type === 'link'" class="grid gap-2">
      <Select v-model="linkTypeValue" :disabled="disabled">
        <SelectTrigger :id="fieldId" :aria-invalid="error ? 'true' : undefined">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="external">{{ t("cms.field.link.url") }}</SelectItem>
          <SelectItem value="internal">{{ t("cms.field.link.internal") }}</SelectItem>
          <SelectItem value="page">{{ t("cms.field.link.page") }}</SelectItem>
          <SelectItem value="entry">{{ t("cms.field.link.entry") }}</SelectItem>
          <SelectItem value="email">{{ t("cms.field.link.email") }}</SelectItem>
          <SelectItem value="phone">{{ t("cms.field.link.phone") }}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        v-if="linkTypeValue === 'page'"
        :model-value="linkDraftValue().pageId || linkDraftValue().slug"
        :disabled="disabled"
        @update:model-value="
          (value) => {
            const page = sortedPages.find(
              (candidate) => candidate.id === value || candidate.slug === value,
            );
            if (page) handleLinkPageSelect(page);
          }
        "
      >
        <SelectTrigger>
          <SelectValue :placeholder="selectedLinkPageLabel" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="page in sortedPages"
            :key="page.id"
            :value="page.id"
          >
            {{ page.title || page.slug }}
          </SelectItem>
        </SelectContent>
      </Select>

      <CmsEntryCommandSelect
        v-else-if="linkTypeValue === 'entry'"
        :model-value="linkDraftValue().entryId"
        :target-collection="field.targetCollection ?? ''"
        :disabled="disabled || !field.targetCollection"
        :placeholder="selectedLinkEntryLabel"
        @select="handleLinkEntrySelect"
      />

      <Input
        v-else
        v-model="linkUrlValue"
        :placeholder="
          linkTypeValue === 'email'
            ? 'hello@example.com'
            : linkTypeValue === 'phone'
              ? '+1 555 123 4567'
              : 'https://example.com'
        "
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
      />

      <Input
        v-if="!hideLinkLabel"
        v-model="linkLabelValue"
        :placeholder="t('cms.field.link.label')"
        :disabled="disabled"
      />

      <label
        v-if="!hideLinkNewTab"
        class="flex items-center gap-3 text-sm! text-muted-foreground"
      >
        <Checkbox v-model="linkOpenInNewTabValue" :disabled="disabled" />
        {{ t("cms.field.link.newTab") }}
      </label>
    </div>

    <div
      v-else-if="field.type === 'multiSelect'"
      :id="fieldId"
      class="flex flex-wrap gap-1.5"
      role="group"
      :aria-invalid="error ? 'true' : undefined"
    >
      <button
        v-for="option in field.options ?? []"
        :key="option"
        type="button"
        class="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
        :class="
          isMultiSelectOptionSelected(option)
            ? 'border-primary/55 bg-primary/15 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.18)]'
            : 'border-border/50 bg-card/30 text-muted-foreground hover:border-primary/35 hover:bg-card/45 hover:text-foreground'
        "
        :aria-pressed="isMultiSelectOptionSelected(option)"
        :disabled="disabled"
        @click="toggleMultiSelectOption(option)"
      >
        <span
          class="size-1.5 shrink-0 rounded-full"
          :class="
            isMultiSelectOptionSelected(option)
              ? 'bg-primary'
              : 'bg-muted-foreground/45'
          "
          aria-hidden="true"
        />
        <span class="truncate">{{ option }}</span>
      </button>
      <p
        v-if="(field.options ?? []).length === 0"
        class="basis-full text-xs text-muted-foreground"
      >
        {{ t("cms.field.addOptions") }}
      </p>
    </div>

    <div
      v-else-if="field.type === 'object'"
      :id="fieldId"
      class="grid gap-3 rounded-md border border-border bg-card/30 p-3"
      :aria-invalid="error ? 'true' : undefined"
    >
      <CmsFrontmatterField
        v-for="nestedField in nestedFields"
        :key="nestedField.key"
        :field="nestedField"
        :model-value="objectValue[nestedField.key]"
        :disabled="disabled"
        :hide-link-label="nestedFieldsHaveStandaloneLinkLabel"
        :hide-link-new-tab="nestedFieldsHaveStandaloneOpenInNewTab"
        @update:model-value="updateObjectField(nestedField.key, $event)"
      />
      <p v-if="nestedFields.length === 0" class="text-xs text-muted-foreground">
        {{ t("cms.field.addNested") }}
      </p>
    </div>

    <div
      v-else-if="field.type === 'repeater'"
      :id="fieldId"
      class="grid gap-4"
      :aria-invalid="error ? 'true' : undefined"
    >
      <div class="flex items-center justify-between gap-3">
        <Label :for="fieldId" class="m-0 text-sm! leading-none text-muted-foreground">
          {{ field.label }}<span v-if="isRequired" aria-hidden="true"> *</span>
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="disabled || nestedFields.length === 0"
          @click="addRepeaterItem"
        >
          {{ repeaterAddButtonLabel }}
        </Button>
      </div>

      <div
        class="grid gap-2 rounded-sm border border-border bg-card/30 p-2"
      >
        <p
          v-if="repeaterValue.length === 0"
          class="px-1 py-2 text-xs text-muted-foreground"
        >
          {{ t("cms.field.noItems") }}
        </p>

        <draggable
          v-else
          v-model="repeaterValue"
          :item-key="getRepeaterItemKey"
          :animation="150"
          handle=".cms-repeater-item-drag-handle"
          :disabled="disabled"
          class="grid gap-2"
          @start="handleRepeaterDragStart"
          @end="handleRepeaterDragEnd"
        >
          <template #item="{ element: item, index }">
            <Collapsible
              :open="expandedRepeaterIndex === index"
              class="grid gap-0 rounded-sm border border-border/50 bg-card/30"
              @update:open="setRepeaterItemOpen(index, $event)"
            >
              <div class="flex min-w-0 items-center justify-between gap-2 px-2 py-1.5">
                <div class="flex min-w-0 flex-1 items-center gap-3">
                  <Button
                    type="button"
                    variant="headerAction"
                    size="icon-xs"
                    class="cms-repeater-item-drag-handle"
                    :class="
                      !disabled ? 'cursor-grab active:cursor-grabbing' : ''
                    "
                    :disabled="disabled"
                    :aria-label="t('cms.field.reorder')"
                  >
                    <span :class="[studioIcons.dragHandle, 'size-3.5']" />
                  </Button>
                  <button
                    type="button"
                    class="min-w-0 flex-1 text-left"
                    @click="toggleRepeaterItem(index)"
                  >
                    <span class="truncate text-xs text-foreground">
                      {{ repeaterItemTitle(item, index) }}
                    </span>
                  </button>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="sidebar-action"
                    size="icon-sm"
                    :disabled="disabled || index === 0"
                    :title="t('cms.field.moveUp')"
                    :aria-label="t('cms.field.moveUp')"
                    @click="moveRepeaterItem(index, -1)"
                  >
                    <span :class="[studioIcons.chevronUp, 'size-3.5']" />
                  </Button>
                  <Button
                    type="button"
                    variant="sidebar-action"
                    size="icon-sm"
                    :disabled="disabled || index === repeaterValue.length - 1"
                    :title="t('cms.field.moveDown')"
                    :aria-label="t('cms.field.moveDown')"
                    @click="moveRepeaterItem(index, 1)"
                  >
                    <span :class="[studioIcons.chevronDown, 'size-3.5']" />
                  </Button>
                  <Button
                    type="button"
                    variant="sidebar-action"
                    size="icon-sm"
                    :disabled="disabled"
                    :title="t('cms.field.duplicate')"
                    :aria-label="t('cms.field.duplicate')"
                    @click="duplicateRepeaterItem(index)"
                  >
                    <span :class="[studioIcons.duplicate, 'size-3.5']" />
                  </Button>
                  <Button
                    type="button"
                    variant="sidebar-action"
                    size="icon-sm"
                    class="hover:text-destructive"
                    :disabled="disabled"
                    :title="t('cms.field.removeItem')"
                    :aria-label="t('cms.field.removeItem')"
                    @click="removeRepeaterItem(index)"
                  >
                    <span :class="[studioIcons.trash, 'size-3.5']" />
                  </Button>
                  <CollapsibleTrigger as-child>
                    <Button
                      type="button"
                      variant="sidebar-action"
                      size="icon-sm"
                      :title="
                        expandedRepeaterIndex === index
                          ? t('cms.field.collapse')
                          : t('cms.field.expand')
                      "
                      :aria-label="
                        expandedRepeaterIndex === index
                          ? t('cms.field.collapse')
                          : t('cms.field.expand')
                      "
                    >
                      <span
                        :class="[
                          expandedRepeaterIndex === index
                            ? studioIcons.chevronUp
                            : studioIcons.chevronDown,
                          'size-3.5',
                        ]"
                      />
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </div>

              <CollapsibleContent
                class="border-t border-dashed border-border/50 p-3"
              >
                <div class="grid gap-3 md:grid-cols-2">
                  <CmsFrontmatterField
                    v-for="nestedField in nestedFields"
                    :key="nestedField.key"
                    :field="nestedField"
                    :model-value="item[nestedField.key]"
                    :disabled="disabled"
                    :hide-link-label="nestedFieldsHaveStandaloneLinkLabel"
                    :hide-link-new-tab="nestedFieldsHaveStandaloneOpenInNewTab"
                    @update:model-value="
                      updateRepeaterItemField(index, nestedField.key, $event)
                    "
                  />
                </div>
                <p
                  v-if="nestedFields.length === 0"
                  class="text-xs text-muted-foreground"
                >
                  {{ t("cms.field.addNested") }}
                </p>
              </CollapsibleContent>
            </Collapsible>
          </template>
        </draggable>
      </div>
    </div>

    <Textarea
      v-else-if="field.type === 'json'"
      :id="fieldId"
      v-model="jsonValue"
      rows="5"
      class="font-mono text-xs"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
    />

    <Input
      v-else
      :id="fieldId"
      v-model="stringValue"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
    />

    <p v-if="error" class="text-xs text-destructive">{{ error }}</p>

    <MediaPickerDialog
      v-if="field.type === 'image' || field.type === 'file'"
      v-model:open="isMediaPickerOpen"
      :title="field.type === 'image' ? t('cms.field.selectImage') : t('cms.field.selectFile')"
      :description="
        field.type === 'image'
          ? t('cms.field.selectImageDescription')
          : t('cms.field.selectFileDescription')
      "
      :media-type="mediaPickerType"
      @select="handleMediaSelect"
    />

    <IconPickerDialog
      v-if="field.type === 'icon'"
      v-model:open="isIconPickerOpen"
      :title="t('cms.field.selectIcon', { field: field.label })"
      :description="t('cms.field.selectIconDescription')"
      :value="stringValue"
      @select="handleIconSelect"
    />

  </div>
</template>
