<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useCapabilities } from "@/composables/useCapabilities";
import { useSiteSettings } from "@/composables/useSiteSettings";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import { useDebouncedSettingsSave } from "../composables/useDebouncedSettingsSave";
import { useSettingsDialog } from "../composables/useSettingsDialog";
import { useSettingsTabHydrate } from "../composables/useSettingsTabHydrate";
import { useSettingsTabReset } from "../composables/useSettingsTabReset";
import SettingsRow from "./SettingsRow.vue";
import SettingsReadOnlyNotice from "./SettingsReadOnlyNotice.vue";

interface SeoFormPayload {
  seoTitle: string;
  seoDescription: string;
  ogImage: string;
}

const { seoDefaults, loadSettings, updateSeoDefaults } = useSiteSettings();
const { hasCapability } = useCapabilities();
const canEditSiteSeo = computed(() => hasCapability("editSiteSettings"));
const settingsDialog = useSettingsDialog();
const { t } = useStudioI18n();

const isLoading = ref(false);
const isMediaPickerOpen = ref(false);

const metaTitle = ref("");
const metaDescription = ref("");
const ogImage = ref("");

function getSeoPayload(): SeoFormPayload {
  return {
    seoTitle: metaTitle.value,
    seoDescription: metaDescription.value,
    ogImage: ogImage.value,
  };
}

function normalizeSeoPayload(payload: SeoFormPayload): SeoFormPayload {
  return {
    seoTitle: payload.seoTitle.trim(),
    seoDescription: payload.seoDescription.trim(),
    ogImage: payload.ogImage.trim(),
  };
}

const debouncedSave = useDebouncedSettingsSave<SeoFormPayload>({
  getPayload: getSeoPayload,
  serialize: (payload) => JSON.stringify(normalizeSeoPayload(payload)),
  save: async (payload) => {
    if (!canEditSiteSeo.value) return;
    const normalized = normalizeSeoPayload(payload);
    await updateSeoDefaults({
      seoTitle: normalized.seoTitle,
      seoDescription: normalized.seoDescription,
      ogImage: normalized.ogImage,
    });
  },
  onError: (error) => {
    toast.error(
      error instanceof Error ? error.message : t("settings.seo.saveFailed"),
    );
  },
});

watch(
  seoDefaults,
  (nextValue) => {
    if (!debouncedSave.shouldSyncFromRemote()) {
      return;
    }

    metaTitle.value = nextValue.seoTitle;
    metaDescription.value = nextValue.seoDescription;
    ogImage.value = nextValue.ogImage;
    debouncedSave.markSaved(getSeoPayload());
  },
  { immediate: true },
);

async function hydrateSeoTab(): Promise<void> {
  isLoading.value = true;
  try {
    await loadSettings({ force: true });
    if (debouncedSave.shouldSyncFromRemote()) {
      debouncedSave.markSaved(getSeoPayload());
    }
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : t("settings.seo.loadFailed"),
    );
  } finally {
    isLoading.value = false;
  }
}

useSettingsTabHydrate({
  tabId: "seo",
  hydrate: hydrateSeoTab,
});

onMounted(() => {
  const unregisterFlush = settingsDialog.registerFlushCallback(
    debouncedSave.flushSave,
  );
  onUnmounted(unregisterFlush);
});

const handleOgImageSelect = (asset: MediaAsset): void => {
  ogImage.value = asset.deliveryUrl || asset.url;
  debouncedSave.scheduleSave();
  isMediaPickerOpen.value = false;
};

const clearOgImage = (): void => {
  ogImage.value = "";
  debouncedSave.scheduleSave();
};

useSettingsTabReset({
  tabId: "seo",
  enabled: canEditSiteSeo,
  title: t("settings.seo.reset.title"),
  description: t("settings.seo.reset.description"),
  warning: t("settings.seo.reset.warning"),
  items: [
    t("settings.seo.title"),
    t("settings.seo.description"),
    t("settings.seo.openGraphImage"),
  ],
  reset: async () => {
    if (!canEditSiteSeo.value) {
      throw new Error(t("settings.seo.noPermission"));
    }

    await debouncedSave.flushSave();
    await updateSeoDefaults({
      seoTitle: "",
      seoDescription: "",
      ogImage: "",
    });
  },
});
</script>

<template>
  <div class="space-y-10" role="form" :aria-label="t('settings.seo.formLabel')">
    <SettingsReadOnlyNotice v-if="!canEditSiteSeo" />
    <SettingsRow
      :label="t('settings.seo.title')"
      :description="t('settings.seo.titleDescription')"
      full-width
      input-id="seo-title"
    >
      <Input
        id="seo-title"
        v-model="metaTitle"
        aria-describedby="seo-title-description"
        type="text"
        :placeholder="t('settings.seo.titlePlaceholder')"
        class="w-full h-9.5! hover:bg-background! bg-input! border-border/50"
        :disabled="isLoading || !canEditSiteSeo"
        :readonly="debouncedSave.isSaving.value || !canEditSiteSeo"
        @blur="debouncedSave.onBlur"
      />
    </SettingsRow>

    <SettingsRow
      :label="t('settings.seo.description')"
      :description="t('settings.seo.descriptionDescription')"
      full-width
      input-id="seo-description"
    >
      <Textarea
        id="seo-description"
        v-model="metaDescription"
        aria-describedby="seo-description-description"
        rows="3"
        :placeholder="t('settings.seo.descriptionPlaceholder')"
        class="w-full resize-none hover:bg-background! bg-input! border-border/50"
        :disabled="isLoading || !canEditSiteSeo"
        :readonly="debouncedSave.isSaving.value || !canEditSiteSeo"
        @blur="debouncedSave.onBlur"
      />
    </SettingsRow>

    <SettingsRow
      :label="t('settings.seo.openGraphImage')"
      :description="t('settings.seo.openGraphImageDescription')"
      full-width
      input-id="seo-og-image"
    >
      <div class="space-y-2">
        <div class="flex flex-col items-start gap-2">
          <div
            class="w-100 aspect-video shrink-0 rounded-md overflow-hidden border border-border bg-input flex items-center justify-center"
            :class="ogImage ? 'border-solid' : 'border-dashed'"
          >
            <img
              v-if="ogImage"
              :src="ogImage"
              :alt="t('settings.seo.imagePreview')"
              class="size-full object-cover"
            />
            <span
              v-else
              :class="[studioIcons.image, 'size-5 text-muted-foreground/50']"
            />
          </div>
          <Button
            type="button"
            :variant="ogImage ? 'destructive' : 'outline'"
            :disabled="isLoading || !canEditSiteSeo"
            :aria-label="
              ogImage
                ? t('settings.seo.clearImage')
                : t('settings.seo.chooseImage')
            "
            @click="ogImage ? clearOgImage() : (isMediaPickerOpen = true)"
          >
            {{ ogImage ? t("settings.seo.clearImage") : t("settings.seo.selectImage") }}
          </Button>
        </div>
      </div>

      <MediaPickerDialog
        v-model:open="isMediaPickerOpen"
        :title="t('settings.seo.selectImage')"
        :description="t('settings.seo.mediaPickerDescription')"
        media-type="image"
        @select="handleOgImageSelect"
      />
    </SettingsRow>
  </div>
</template>
