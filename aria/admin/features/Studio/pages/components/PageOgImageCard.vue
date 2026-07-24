<script setup lang="ts">
import { computed, ref } from "vue";
import CoverImageCard from "@/features/Studio/media/components/CoverImageCard.vue";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import { useStudioI18n } from "@/i18n";

const ogImage = defineModel<string>({ default: "" });
const { t } = useStudioI18n();

const isPickerOpen = ref(false);

const actionLabel = computed(() =>
  ogImage.value.trim() ? t("pages.seo.replaceOgImage") : t("pages.seo.selectOgImage"),
);

function openPicker(): void {
  isPickerOpen.value = true;
}

function handleMediaSelect(asset: MediaAsset): void {
  ogImage.value = asset.deliveryUrl || asset.url;
  isPickerOpen.value = false;
}

function handleRemove(): void {
  ogImage.value = "";
}
</script>

<template>
  <CoverImageCard
    :label="t('pages.seo.ogImage')"
    :has-image="!!ogImage.trim()"
    :image-url="ogImage"
    :fallback-label="t('pages.seo.ogImageFallback')"
    :action-label="actionLabel"
    :recommended-lines="[t('pages.seo.recommendedImage')]"
    :show-alt-caption="false"
    :show-caption="false"
    @choose="openPicker"
    @remove="handleRemove"
  />

  <MediaPickerDialog
    v-model:open="isPickerOpen"
    :title="t('pages.seo.ogImageDialogTitle')"
    :description="t('pages.seo.ogImageDialogDescription')"
    media-type="image"
    @select="handleMediaSelect"
  />
</template>
