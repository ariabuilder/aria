<script setup lang="ts">
/**
 * Page Cover Image Displays a page's cover image using the shared CoverImageCard
 * block (the same "cover select" UI used for CMS entry cover.
 */
import { computed, ref, watch } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import { handleActionResultForbidden } from "@/lib/actionErrors";
import CoverImageCard from "@/features/Studio/media/components/CoverImageCard.vue";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import { useStudioI18n } from "@/i18n";

interface Props {
  pageSlug: string;
  /** Current cover image source URL */
  coverSrc?: string;
  coverAlt?: string;
  coverCaption?: string;
  isSaving?: boolean;
}

interface Emits {
  (e: "update", src: string, alt?: string, caption?: string): void;
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
const isProcessing = ref(false);

const actionLabel = computed(() =>
  props.coverSrc ? t("pages.cover.replace") : t("pages.cover.add"),
);

// Local drafts for alt/caption editing, debounced-committed to the server
// independently of the main page save flow (mirrors how selecting a new
// cover image already saves immediately).
const altDraft = ref(props.coverAlt);
const captionDraft = ref(props.coverCaption);
const lastCommittedAlt = ref(props.coverAlt);
const lastCommittedCaption = ref(props.coverCaption);

watch(
  () => [props.coverSrc, props.coverAlt, props.coverCaption] as const,
  ([, alt, caption]) => {
    altDraft.value = alt ?? "";
    captionDraft.value = caption ?? "";
    lastCommittedAlt.value = alt ?? "";
    lastCommittedCaption.value = caption ?? "";
  },
);

let commitTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAltCaptionCommit(): void {
  if (commitTimer) {
    clearTimeout(commitTimer);
  }
  commitTimer = setTimeout(() => {
    commitTimer = null;
    void commitAltCaption();
  }, 600);
}

watch([altDraft, captionDraft], () => {
  if (!props.coverSrc || !canEditCover.value) {
    return;
  }
  scheduleAltCaptionCommit();
});

async function commitAltCaption(): Promise<void> {
  if (!props.coverSrc) return;

  const alt = altDraft.value.trim();
  const caption = captionDraft.value.trim();
  if (alt === lastCommittedAlt.value && caption === lastCommittedCaption.value) {
    return;
  }

  isProcessing.value = true;
  try {
    const result = await actions.pages.cover({
      pageSlug: props.pageSlug,
      src: props.coverSrc,
      alt,
      caption,
      autoSetOgImage: false,
    });

    if (result.error) {
      if (!handleActionResultForbidden(result, "pages.cover")) {
        toast.error(result.error.message || t("pages.cover.updateError"));
      }
      return;
    }

    lastCommittedAlt.value = alt;
    lastCommittedCaption.value = caption;
    emit("update", props.coverSrc, alt, caption);
  } catch (error) {
    toast.error(t("pages.cover.updateError"));
    console.error("[CoverImage] Alt/caption update failed:", error);
  } finally {
    isProcessing.value = false;
  }
}

function openPicker(): void {
  if (!caps.canChangeCover.value) {
    toast.error(caps.getForbiddenMessage("pages.cover"));
    return;
  }
  isPickerOpen.value = true;
}

/**
 * Handle media selection from the picker
 * Calls the cover action to update the page's featured image, preserving
 * any caption already drafted for this cover slot.
 */
async function handleMediaSelect(asset: MediaAsset): Promise<void> {
  isProcessing.value = true;
  try {
    const result = await actions.pages.cover({
      pageSlug: props.pageSlug,
      src: asset.url,
      alt: asset.name,
      caption: captionDraft.value.trim(),
      autoSetOgImage: true,
    });

    if (result.error) {
      if (!handleActionResultForbidden(result, "pages.cover")) {
        toast.error(result.error.message || t("pages.cover.imageUpdateError"));
      }
    } else {
      lastCommittedAlt.value = asset.name;
      emit("update", asset.url, asset.name, captionDraft.value.trim());
      toast.success(t("pages.cover.imageUpdated"));
    }
  } catch (error) {
    toast.error(t("pages.cover.imageUpdateError"));
    console.error("[CoverImage] Update failed:", error);
  } finally {
    isProcessing.value = false;
    isPickerOpen.value = false;
  }
}

/**
 * Remove the current cover image
 * Calls the removeCover action to delete the featured image
 */
async function handleRemove(): Promise<void> {
  if (!caps.canRemoveCover.value) {
    toast.error(caps.getForbiddenMessage("pages.removeCover"));
    return;
  }
  isProcessing.value = true;
  try {
    const result = await actions.pages.removeCover({
      pageSlug: props.pageSlug,
      clearOgImage: true,
    });

    if (result.error) {
      if (!handleActionResultForbidden(result, "pages.removeCover")) {
        toast.error(result.error.message || t("pages.cover.removeError"));
      }
    } else {
      emit("remove");
      toast.success(t("pages.cover.removed"));
    }
  } catch (error) {
    toast.error(t("pages.cover.removeError"));
    console.error("[CoverImage] Remove failed:", error);
  } finally {
    isProcessing.value = false;
  }
}
</script>

<template>
  <CoverImageCard
    v-if="canEditCover || coverSrc"
    v-model:alt="altDraft"
    v-model:caption="captionDraft"
    :label="t('pages.cover.label')"
    :disabled="!canEditCover || isSaving || isProcessing"
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
