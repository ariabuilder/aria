<template>
  <div
    class="space-y-10"
    role="form"
    :aria-label="t('settings.appearance.formLabel')"
    :aria-busy="isLoading"
  >
    <SettingsRow
      :label="t('settings.appearance.theme')"
      :description="t('settings.appearance.themeDescription')"
      input-id="appearance-theme-id"
    >
      <TooltipProvider :delay-duration="0" :skip-delay-duration="0">
        <div
          id="appearance-theme-id"
          class="grid w-51 grid-cols-3 gap-3"
          role="radiogroup"
          :aria-label="t('settings.appearance.themePalette')"
        >
          <Tooltip v-for="theme in paletteOptions" :key="theme.id">
            <TooltipTrigger as-child>
              <button
                type="button"
                role="radio"
                :disabled="isLoading"
                :aria-checked="themeIdModel === theme.id"
                :aria-label="theme.label"
                class="h-10 w-15 cursor-pointer select-none rounded-sm border transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                :class="
                  themeIdModel === theme.id
                    ? 'border-solid border-primary/80'
                    : 'border-dashed border-border/50 hover:border-solid hover:border-border'
                "
                :style="{ backgroundColor: theme.primaryColor }"
                @click="themeIdModel = theme.id"
              />
            </TooltipTrigger>
            <TooltipContent side="bottom">{{ theme.label }}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </SettingsRow>

    <SettingsRow
      :label="t('settings.appearance.colorMode')"
      :description="t('settings.appearance.colorModeDescription')"
      input-id="appearance-color-scheme"
    >
      <TooltipProvider :delay-duration="0" :skip-delay-duration="0">
        <div
          id="appearance-color-scheme"
          class="grid w-51 grid-cols-3 gap-3"
          role="radiogroup"
          :aria-label="t('settings.appearance.colorMode')"
        >
          <Tooltip v-for="mode in colorModeOptions" :key="mode.value">
            <TooltipTrigger as-child>
              <button
                type="button"
                role="radio"
                :disabled="isLoading"
                :aria-checked="colorSchemeModel === mode.value"
                :aria-label="mode.label"
                class="flex h-10 w-15 cursor-pointer select-none items-center justify-center rounded-sm border bg-input transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                :class="
                  colorSchemeModel === mode.value
                    ? 'border-solid border-primary/80 bg-background! text-foreground'
                    : 'border-dashed border-border/50 text-muted-foreground hover:border-solid hover:border-border hover:bg-background hover:text-foreground'
                "
                @click="colorSchemeModel = mode.value"
              >
                <span :class="[mode.iconClass, 'size-5']" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{{ mode.label }}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </SettingsRow>

    <SettingsRow
      :label="t('appearance.interfaceLanguage')"
      :description="t('appearance.interfaceLanguageDescription')"
      input-id="appearance-interface-language"
    >
      <Select v-model="studioLocaleModel" :disabled="isLoading">
        <SelectTrigger id="appearance-interface-language" class="w-74! bg-input">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">{{ t("appearance.systemLanguage") }}</SelectItem>
          <SelectItem value="en">{{ t("settings.appearance.language.english") }}</SelectItem>
          <SelectItem value="fr">{{ t("settings.appearance.language.french") }}</SelectItem>
        </SelectContent>
      </Select>
    </SettingsRow>

    <SettingsRow
      :label="t('settings.appearance.typography')"
      :description="t('settings.appearance.typographyDescription')"
      input-id="appearance-typography"
    >
      <div class="flex flex-col gap-7">
        <Select v-model="fontFamilyModel" :disabled="isLoading">
          <SelectTrigger
            class="w-74! overflow-hidden rounded-md hover:bg-background! bg-input! border-border/50 hover:border-solid text-sm font-sans"
          >
            <SelectValue :placeholder="t('settings.appearance.selectFont')" />
          </SelectTrigger>
          <SelectContent class="font-sans text-sm">
            <SelectItem value="Outfit">{{ t("settings.appearance.font.outfit") }}</SelectItem>
            <SelectItem value="Inter">Inter</SelectItem>
            <SelectItem value="System">{{ t("settings.appearance.font.system") }}</SelectItem>
            <SelectItem value="Monospace">{{ t("settings.appearance.font.monospace") }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </SettingsRow>

    <SettingsRow
      :label="t('settings.appearance.interfaceScale')"
      :description="t('settings.appearance.interfaceScaleDescription')"
      input-id="appearance-scale"
    >
      <div
        id="appearance-scale"
        class="grid w-70 grid-cols-5 gap-2"
        role="radiogroup"
        :aria-label="t('settings.appearance.interfaceScale')"
      >
        <button
          v-for="zoom in zoomOptions"
          :key="zoom.value"
          type="button"
          role="radio"
          :disabled="isLoading"
          :aria-checked="settings.uiZoom === zoom.value"
          :aria-label="zoom.label"
          class="flex w-full cursor-pointer select-none items-center justify-center rounded-sm border py-2 text-center font-serif text-xs font-medium tracking-wider shadow-none transition-[color,background-color,border-color] duration-100 disabled:cursor-not-allowed disabled:opacity-50"
          :class="
            settings.uiZoom === zoom.value
              ? 'border-solid border-primary bg-background text-foreground'
              : 'border-dashed border-border/50 bg-input text-muted-foreground/80 hover:border-solid hover:border-border/50 hover:bg-background hover:text-foreground'
          "
          @click="uiZoomModel = String(zoom.value)"
        >
          {{ zoom.label }}
        </button>
      </div>
    </SettingsRow>
  </div>
</template>

<script setup lang="ts">
import {
  useAppearance,
  THEME_OPTIONS,
  COLOR_SCHEME_OPTIONS,
  type ColorScheme,
  type FontFamily,
  type ThemeId,
} from "@/features/Design";
import { computed, ref, watch } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import SettingsRow from "./SettingsRow.vue";
import { useSettingsTabReset } from "../composables/useSettingsTabReset";
import { useBuilderData } from "@/composables/useBuilderData";
import { useStudioI18n } from "@/i18n";
import {
  resolveStudioLocale,
  StudioLocalePreferenceSchema,
  type StudioLocalePreference,
} from "../../../../../lib/localization/studioLocale";

const { settings, isLoading, updateAppearance, reset } = useAppearance();
const { userPreferences } = useBuilderData();
const { t, setLocale } = useStudioI18n();
const studioLocalePreference = ref<StudioLocalePreference>("system");

const paletteOptions = THEME_OPTIONS;

const colorModeOptions = computed(() =>
  COLOR_SCHEME_OPTIONS.map((option) => ({
    ...option,
    label:
      option.value === "light"
        ? t("settings.appearance.mode.light")
        : option.value === "dark"
          ? t("settings.appearance.mode.dark")
          : t("settings.appearance.mode.system"),
  })),
);

const zoomOptions = [
  { label: "XS", value: 0.9 },
  { label: "SM", value: 0.95 },
  { label: "MD", value: 1 },
  { label: "LG", value: 1.1 },
  { label: "XL", value: 1.2 },
] as const;

const themeIdModel = computed<ThemeId>({
  get: () => settings.value.themeId,
  set: (value) => {
    void updateAppearance({ themeId: value }, { animate: true });
  },
});

const colorSchemeModel = computed<ColorScheme>({
  get: () => settings.value.colorScheme,
  set: (value) => {
    void updateAppearance({ colorScheme: value }, { animate: true });
  },
});

const fontFamilyModel = computed<FontFamily>({
  get: () => settings.value.fontFamily,
  set: (value) => {
    void updateAppearance({ fontFamily: value }, { animate: false });
  },
});

const uiZoomModel = computed<string>({
  get: () => String(settings.value.uiZoom),
  set: (value) => {
    const match = zoomOptions.find((option) => String(option.value) === value);
    if (match) {
      void updateAppearance({ uiZoom: match.value }, { animate: false });
    }
  },
});

watch(
  userPreferences,
  (preferences) => {
    studioLocalePreference.value = preferences?.studio?.locale ?? "system";
  },
  { immediate: true },
);

const studioLocaleModel = computed<StudioLocalePreference>({
  get: () => studioLocalePreference.value,
  set: (next) => {
    const parsed = StudioLocalePreferenceSchema.parse(next);
    const previous = studioLocalePreference.value;
    studioLocalePreference.value = parsed;
    setLocale(
      resolveStudioLocale({
        preference: parsed,
        acceptedLanguages:
          typeof navigator === "undefined" ? [] : navigator.languages,
      }),
    );
    void actions.auth
      .updatePreferences({ studio: { locale: parsed } })
      .then((result) => {
        if (result.error) throw result.error;
      })
      .catch((error: unknown) => {
        studioLocalePreference.value = previous;
        setLocale(
          resolveStudioLocale({
            preference: previous,
            acceptedLanguages:
              typeof navigator === "undefined" ? [] : navigator.languages,
          }),
        );
        toast.error(error instanceof Error ? error.message : t("common.failed"));
      });
  },
});

useSettingsTabReset({
  tabId: "appearance",
  title: t("settings.appearance.reset.title"),
  description: t("settings.appearance.reset.description"),
  warning: t("settings.appearance.reset.warning"),
  items: [
    t("settings.appearance.themePalette"),
    t("settings.appearance.colorMode"),
    t("settings.appearance.typography"),
    t("settings.appearance.interfaceScale"),
  ],
  reset: async () => {
    reset();
  },
});
</script>
