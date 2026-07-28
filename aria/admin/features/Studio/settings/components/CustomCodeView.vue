<script setup lang="ts">
import { ref, watch } from "vue";
import { toast } from "vue-sonner";
import { Textarea } from "@/components/ui/textarea";
import { useSiteSettings } from "@/composables/useSiteSettings";
import { useStudioI18n } from "@/i18n";
import { useSettingsTabHydrate } from "../composables/useSettingsTabHydrate";
import { useSettingsTabReset } from "../composables/useSettingsTabReset";
import SettingsRow from "./SettingsRow.vue";

const {
  customCode,
  loadSettings,
  setCustomHeadCode,
  setCustomBodyCode,
  setCustomFooterCode,
} = useSiteSettings();
const { t } = useStudioI18n();

const isLoading = ref(false);
const isSaving = ref(false);

const customHeadCode = ref("");
const customBodyCode = ref("");
const customFooterCode = ref("");

watch(
  customCode,
  (nextValue) => {
    if (isSaving.value) return;

    customHeadCode.value = nextValue.head;
    customBodyCode.value = nextValue.body;
    customFooterCode.value = nextValue.footer;
  },
  { immediate: true },
);

async function hydrateCustomCodeTab(): Promise<void> {
  isLoading.value = true;
  try {
    await loadSettings({ force: true });
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.customCode.loadFailed"),
    );
  } finally {
    isLoading.value = false;
  }
}

useSettingsTabHydrate({
  tabId: "custom-code",
  hydrate: hydrateCustomCodeTab,
});

async function onHeadBlur(): Promise<void> {
  isSaving.value = true;
  try {
    await setCustomHeadCode(customHeadCode.value);
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : t("settings.customCode.saveHeadFailed"),
    );
  } finally {
    isSaving.value = false;
  }
}

async function onBodyBlur(): Promise<void> {
  isSaving.value = true;
  try {
    await setCustomBodyCode(customBodyCode.value);
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : t("settings.customCode.saveBodyFailed"),
    );
  } finally {
    isSaving.value = false;
  }
}

async function onFooterBlur(): Promise<void> {
  isSaving.value = true;
  try {
    await setCustomFooterCode(customFooterCode.value);
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : t("settings.customCode.saveFooterFailed"),
    );
  } finally {
    isSaving.value = false;
  }
}

useSettingsTabReset({
  tabId: "custom-code",
  title: t("settings.customCode.reset.title"),
  description: t("settings.customCode.reset.description"),
  warning: t("settings.customCode.reset.warning"),
  items: [
    t("settings.customCode.headLabel"),
    t("settings.customCode.bodyLabel"),
    t("settings.customCode.footerLabel"),
  ],
  reset: async () => {
    await Promise.all([
      setCustomHeadCode(""),
      setCustomBodyCode(""),
      setCustomFooterCode(""),
    ]);
  },
});
</script>

<template>
  <div class="space-y-4" role="form" :aria-label="t('settings.customCode.formLabel')">
    <SettingsRow
      :label="t('settings.customCode.headLabel')"
      :description="t('settings.customCode.headDescription')"
      full-width
      input-id="custom-head-code"
    >
      <Textarea
        id="custom-head-code"
        v-model="customHeadCode"
        aria-describedby="custom-head-code-description"
        :placeholder="t('settings.customCode.placeholder')"
        class="w-full h-36 bg-background! border-border border-dashed! text-xs caret-primary"
        :disabled="isLoading || isSaving"
        @blur="onHeadBlur"
      />
    </SettingsRow>

    <SettingsRow
      :label="t('settings.customCode.bodyLabel')"
      :description="t('settings.customCode.bodyDescription')"
      full-width
      input-id="custom-body-code"
    >
      <Textarea
        id="custom-body-code"
        v-model="customBodyCode"
        aria-describedby="custom-body-code-description"
        :placeholder="t('settings.customCode.placeholder')"
        class="w-full h-36 bg-background! border-border border-dashed! text-xs caret-primary"
        :disabled="isLoading || isSaving"
        @blur="onBodyBlur"
      />
    </SettingsRow>

    <SettingsRow
      :label="t('settings.customCode.footerLabel')"
      :description="t('settings.customCode.footerDescription')"
      full-width
      input-id="custom-footer-code"
    >
      <Textarea
        id="custom-footer-code"
        v-model="customFooterCode"
        aria-describedby="custom-footer-code-description"
        :placeholder="t('settings.customCode.placeholder')"
        class="w-full h-36 bg-background! border-border border-dashed! text-xs caret-primary"
        :disabled="isLoading || isSaving"
        @blur="onFooterBlur"
      />
    </SettingsRow>
  </div>
</template>
