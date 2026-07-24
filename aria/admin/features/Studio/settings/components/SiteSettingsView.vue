<script setup lang="ts">
import { ref, watch } from "vue";
import { toast } from "vue-sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSiteSettings } from "@/composables/useSiteSettings";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import { studioIcons } from "@/lib/icons";
import { syncStudioFavicon } from "@/lib/studioFavicon";
import { useStudioI18n } from "@/i18n";
import { useSettingsTabHydrate } from "../composables/useSettingsTabHydrate";
import { useSettingsTabReset } from "../composables/useSettingsTabReset";
import SettingsRow from "./SettingsRow.vue";
import {
  DEFAULT_SITE_TIME_ZONE,
  SITE_TIME_ZONE_OPTIONS,
  isValidTimeZone,
} from "../../../../../lib/datetime/timeZone";

const { generalSettings, loadSettings, updateGeneralSettings } =
  useSiteSettings();
const { t } = useStudioI18n();

const isLoading = ref(false);
const isSaving = ref(false);
const isMediaPickerOpen = ref(false);

const siteName = ref("");
const timeZone = ref(DEFAULT_SITE_TIME_ZONE);
const siteDescription = ref("");
const siteUrl = ref("");
const favicon = ref("");
const faviconMediaTypes = ["image", "icon"] as const;

watch(
  generalSettings,
  (nextValue) => {
    if (isSaving.value) return;

    siteName.value = nextValue.siteName;
    timeZone.value = nextValue.timeZone;
    siteDescription.value = nextValue.siteDescription;
    siteUrl.value = nextValue.siteUrl;
    favicon.value = nextValue.favicon;
  },
  { immediate: true },
);

async function hydrateGeneralTab(): Promise<void> {
  isLoading.value = true;
  try {
    await loadSettings({ force: true });
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : t("settings.general.loadFailed"),
    );
  } finally {
    isLoading.value = false;
  }
}

useSettingsTabHydrate({
  tabId: "general",
  hydrate: hydrateGeneralTab,
});

async function saveGeneralSettings(): Promise<void> {
  if (!isValidTimeZone(timeZone.value)) {
    toast.error(t("settings.general.invalidTimeZone"));
    return;
  }

  if (siteUrl.value.trim()) {
    try {
      new URL(siteUrl.value.trim());
    } catch {
      toast.error(t("settings.general.invalidUrl"));
      return;
    }
  }

  isSaving.value = true;
  try {
    await updateGeneralSettings({
      siteName: siteName.value,
      timeZone: timeZone.value,
      siteDescription: siteDescription.value,
      siteUrl: siteUrl.value,
      favicon: favicon.value,
    });
    syncStudioFavicon(favicon.value);
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : t("settings.general.saveFailed"),
    );
  } finally {
    isSaving.value = false;
  }
}

function handleTimeZoneChange(value: unknown): void {
  if (typeof value !== "string") return;
  timeZone.value = value;
  void saveGeneralSettings();
}

const handleFaviconSelect = (asset: MediaAsset): void => {
  favicon.value = asset.deliveryUrl || asset.url;
  void saveGeneralSettings();
};

const clearFavicon = (): void => {
  favicon.value = "";
  void saveGeneralSettings();
};

useSettingsTabReset({
  tabId: "general",
  title: t("settings.general.reset.title"),
  description: t("settings.general.reset.description"),
  warning: t("settings.general.reset.warning"),
  items: [
    t("settings.general.siteName"),
    t("settings.general.siteDescription"),
    t("settings.general.siteUrl"),
    t("settings.general.timeZone"),
    t("settings.general.favicon"),
  ],
  reset: async () => {
    await updateGeneralSettings({
      siteName: "",
      timeZone: DEFAULT_SITE_TIME_ZONE,
      siteDescription: "",
      siteUrl: "",
      favicon: "",
    });
    syncStudioFavicon();
  },
});
</script>

<template>
  <div class="space-y-6" role="form" :aria-label="t('settings.general.formLabel')">
    <SettingsRow
      :label="t('settings.general.siteName')"
      :description="t('settings.general.siteNameDescription')"
      full-width
      input-id="site-name"
    >
      <Input
        id="site-name"
        v-model="siteName"
        aria-describedby="site-name-description"
        type="text"
        :placeholder="t('settings.general.siteName')"
        class="w-full h-9.5! hover:bg-background! bg-input! border-border/50"
        :readonly="isLoading || isSaving"
        @blur="saveGeneralSettings"
      />
    </SettingsRow>

    <SettingsRow
      :label="t('settings.general.siteDescription')"
      :description="t('settings.general.siteDescriptionDescription')"
      full-width
      input-id="site-description"
    >
      <Textarea
        id="site-description"
        v-model="siteDescription"
        aria-describedby="site-description-description"
        rows="1"
        auto-grow
        :placeholder="t('settings.general.siteDescriptionPlaceholder')"
        class="w-full resize-none hover:bg-background! bg-input! border-border/50"
        :readonly="isLoading || isSaving"
        @blur="saveGeneralSettings"
      />
    </SettingsRow>

    <SettingsRow
      :label="t('settings.general.siteUrl')"
      :description="t('settings.general.siteUrlDescription')"
      full-width
      input-id="site-url"
    >
      <Input
        id="site-url"
        v-model="siteUrl"
        type="url"
        aria-describedby="site-url-description"
        placeholder="https://example.com"
        class="w-full h-9.5! hover:bg-background! bg-input! border-border/50"
        :readonly="isLoading || isSaving"
        @blur="saveGeneralSettings"
      />
    </SettingsRow>

    <SettingsRow
      :label="t('settings.general.timeZone')"
      :description="t('settings.general.timeZoneDescription')"
      full-width
      input-id="site-time-zone"
    >
      <Select
        :model-value="timeZone"
        :disabled="isLoading || isSaving"
        @update:model-value="handleTimeZoneChange"
      >
        <SelectTrigger
          id="site-time-zone"
          class="w-full h-9.5! hover:bg-background! bg-input! border-border/50"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent class="max-h-80">
          <SelectItem
            v-for="option in SITE_TIME_ZONE_OPTIONS"
            :key="option"
            :value="option"
          >
            {{ option }}
          </SelectItem>
        </SelectContent>
      </Select>
    </SettingsRow>

    <SettingsRow
      :label="t('settings.general.favicon')"
      :description="t('settings.general.faviconDescription')"
      full-width
      input-id="site-favicon"
    >
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <!-- Favicon preview -->
          <div
            class="size-9 shrink-0 rounded-md overflow-hidden border border-border bg-card/30 flex items-center justify-center"
            :class="favicon ? 'border-solid' : 'border-dashed'"
          >
            <img
              v-if="favicon"
              :src="favicon"
              :alt="t('settings.general.faviconPreview')"
              class="size-full object-contain"
            />
            <span
              v-else
              :class="[studioIcons.image, 'size-4 text-muted-foreground/50']"
            />
          </div>
          <Button
            type="button"
            :variant="favicon ? 'ghost' : 'ghost'"
            size="xs"
            :disabled="isLoading || isSaving"
            :aria-label="
              favicon
                ? t('settings.general.clearFavicon')
                : t('settings.general.chooseFavicon')
            "
            @click="favicon ? clearFavicon() : (isMediaPickerOpen = true)"
          >
            {{ favicon ? t("settings.general.clear") : t("settings.general.selectFavicon") }}
          </Button>
        </div>
      </div>

      <MediaPickerDialog
        v-model:open="isMediaPickerOpen"
        :title="t('settings.general.selectFavicon')"
        :description="t('settings.general.mediaPickerDescription')"
        :media-types="faviconMediaTypes"
        @select="handleFaviconSelect"
      />
    </SettingsRow>
  </div>
</template>
