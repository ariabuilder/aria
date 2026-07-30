<script setup lang="ts">
/**
 * Page Cover Image Displays a page's cover image using the shared CoverImageCard
 * block (the same "cover select" UI used for CMS entry cover.
 */
import { computed, onUnmounted, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import CoverImageCard from "@/features/Studio/media/components/CoverImageCard.vue";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import { useStudioI18n } from "@/i18n";

interface Props {
  /** Current cover image source URL */
  coverSrc?: string;
  coverAlt?: string;
  coverCaption?: string;
  isSaving?: boolean;
}

interface Emits {
  (
    e: "update",
    src: string,
    alt: string | undefined,
    caption: string | undefined,
    autoSetOgImage: boolean,
  ): void;
  (e: "remove"): void;
}

const props = withDefaults(defineProps<Props>(), {
  coverSrc: "",
  coverAlt: "",
  coverCaption: "",
  isSaving: false,
});

const emit = defineEmits<Emits>();
const { t } = useStudioI18n();

const caps = useStudioCapabilities();
const canEditCover = computed(
  () => caps.canChangeCover.value || caps.canRemoveCover.value,
);

const isPickerOpen = ref(false);

const actionLabel = computed(() =>
  props.coverSrc ? t("pages.cover.replace") : t("pages.cover.add"),
);

// Cover edits are part of the page's local draft. The parent performs the
// single guarded page write when the user saves or publishes.
const altDraft = ref(props.coverAlt);
const captionDraft = ref(props.coverCaption);
const lastEmittedAlt = ref(props.coverAlt);
const lastEmittedCaption = ref(props.coverCaption);

watch(
  () => [props.coverSrc, props.coverAlt, props.coverCaption] as const,
  ([, alt, caption]) => {
    altDraft.value = alt ?? "";
    captionDraft.value = caption ?? "";
    lastEmittedAlt.value = alt ?? "";
    lastEmittedCaption.value = caption ?? "";
  },
);

let commitTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAltCaptionCommit(): void {
  if (commitTimer) {
    clearTimeout(commitTimer);
  }
  commitTimer = setTimeout(() => {
    commitTimer = null;
    emitAltCaptionDraft();
  }, 600);
}

watch([altDraft, captionDraft], () => {
  if (!props.coverSrc || !canEditCover.value) {
    return;
  }
  scheduleAltCaptionCommit();
});

function emitAltCaptionDraft(): void {
  if (!props.coverSrc) return;

  const alt = altDraft.value.trim();
  const caption = captionDraft.value.trim();
  if (alt === lastEmittedAlt.value && caption === lastEmittedCaption.value) {
    return;
  }

  lastEmittedAlt.value = alt;
  lastEmittedCaption.value = caption;
  emit("update", props.coverSrc, alt || undefined, caption || undefined, false);
}

onUnmounted(() => {
  if (commitTimer) {
    clearTimeout(commitTimer);
  }
});

function openPicker(): void {
  if (!caps.canChangeCover.value) {
    toast.error(caps.getForbiddenMessage("pages.cover"));
    return;
  }
  isPickerOpen.value = true;
}

/**
 * Handle media selection from the picker
 * Updates the local page draft while preserving any drafted caption.
 */
function handleMediaSelect(asset: MediaAsset): void {
  const caption = captionDraft.value.trim();
  lastEmittedAlt.value = asset.name;
  lastEmittedCaption.value = caption;
  emit("update", asset.url, asset.name, caption || undefined, true);
  isPickerOpen.value = false;
}

/**
 * Remove the cover image from the local page draft.
 */
function handleRemove(): void {
  if (!caps.canRemoveCover.value) {
    toast.error(caps.getForbiddenMessage("pages.removeCover"));
    return;
  }
  emit("remove");
}
</script>

<template>
  <CoverImageCard
    v-if="canEditCover || coverSrc"
    v-model:alt="altDraft"
    v-model:caption="captionDraft"
    :label="t('pages.cover.label')"
    :disabled="!canEditCover || isSaving"
    :has-image="!!coverSrc"
    :image-url="coverSrc"
    :image-alt="coverAlt"
    :fallback-label="t('pages.cover.fallback')"
    :action-label="actionLabel"
    show-alt-caption
    show-caption
    @choose="openPicker"
    @remove="handleRemove"
  />

  <!-- Media Picker Dialog -->
  <MediaPickerDialog
    v-if="canEditCover"
    v-model:open="isPickerOpen"
    :title="t('pages.cover.dialogTitle')"
    :description="t('pages.cover.dialogDescription')"
    media-type="image"
    @select="handleMediaSelect"
  />
</template>
