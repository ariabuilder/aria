<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSiteSettings } from "@/composables/useSiteSettings";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import {
  ContentLocalizationSettingsSchema,
  resolveContentLocaleDirection,
  type ContentLocaleDefinition,
} from "../../../../../lib/localization/contentLocale";
import LocalizationConfirmationDialog from "../../core/components/LocalizationConfirmationDialog.vue";
import { useSettingsTabHydrate } from "../composables/useSettingsTabHydrate";
import { addContentLocaleIfMissing } from "../lib/contentLocaleList";
import SettingsRow from "./SettingsRow.vue";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

const LOCALE_CATALOG = [
  { code: "ar", label: "Arabic", direction: "rtl" as const },
  { code: "de", label: "German", direction: "ltr" as const },
  {
    code: "en-GB",
    label: "English (United Kingdom)",
    direction: "ltr" as const,
  },
  {
    code: "en-US",
    label: "English (United States)",
    direction: "ltr" as const,
  },
  { code: "es", label: "Spanish", direction: "ltr" as const },
  { code: "fr", label: "French", direction: "ltr" as const },
  { code: "fr-CA", label: "French (Canada)", direction: "ltr" as const },
  { code: "he", label: "Hebrew", direction: "rtl" as const },
  { code: "it", label: "Italian", direction: "ltr" as const },
  { code: "ja", label: "Japanese", direction: "ltr" as const },
  { code: "ko", label: "Korean", direction: "ltr" as const },
  { code: "nl", label: "Dutch", direction: "ltr" as const },
  { code: "pt-BR", label: "Portuguese (Brazil)", direction: "ltr" as const },
  { code: "zh-CN", label: "Chinese (Simplified)", direction: "ltr" as const },
];

const {
  contentLocalization,
  isLoading,
  isSaving,
  loadSettings,
  updateContentLocalization,
} = useSiteSettings();
const { t } = useStudioI18n();

const defaultLocale = ref("en");
const locales = ref<ContentLocaleDefinition[]>([]);
const persistedLocaleCodes = ref(new Set<string>());
const selectedLocaleCode = ref<string | null>(null);
const localePickerOpen = ref(false);
const localePendingRemoval = ref<ContentLocaleDefinition | null>(null);
const initialSnapshot = ref("");

const localeSnapshot = () =>
  JSON.stringify({
    defaultLocale: defaultLocale.value,
    locales: locales.value,
  });

function applySettings(next: typeof contentLocalization.value): void {
  defaultLocale.value = next.defaultLocale;
  locales.value = next.locales.map((locale) => ({
    ...locale,
    direction: resolveContentLocaleDirection(locale),
    fallbacks: [...locale.fallbacks],
  }));
  persistedLocaleCodes.value = new Set(
    next.locales.map((locale) => locale.code),
  );
  selectedLocaleCode.value = locales.value.some(
    (locale) => locale.code === selectedLocaleCode.value,
  )
    ? selectedLocaleCode.value
    : next.defaultLocale;
  initialSnapshot.value = localeSnapshot();
}

watch(
  contentLocalization,
  (next) => {
    if (!isSaving.value) applySettings(next);
  },
  { immediate: true },
);

const selectedLocale = computed(
  () =>
    locales.value.find((locale) => locale.code === selectedLocaleCode.value) ??
    null,
);
const activeLocaleCount = computed(
  () => locales.value.filter((locale) => locale.enabled).length,
);
const disabledLocaleCount = computed(
  () => locales.value.filter((locale) => !locale.enabled).length,
);
const isDirty = computed(() => initialSnapshot.value !== localeSnapshot());
const validationIssues = computed(() => {
  const parsed = ContentLocalizationSettingsSchema.safeParse({
    defaultLocale: defaultLocale.value,
    locales: locales.value,
  });
  return parsed.success
    ? []
    : [...new Set(parsed.error.issues.map((issue) => issue.message))];
});
const availableLocaleOptions = computed(() =>
  LOCALE_CATALOG.filter(
    (option) => !locales.value.some((locale) => locale.code === option.code),
  ),
);

function isPersistedLocale(locale: ContentLocaleDefinition): boolean {
  return persistedLocaleCodes.value.has(locale.code);
}

function isDefaultLocale(locale: ContentLocaleDefinition): boolean {
  return locale.code === defaultLocale.value;
}

function statusFor(locale: ContentLocaleDefinition): {
  label: string;
  variant: BadgeVariant;
} {
  if (isDefaultLocale(locale))
    return { label: t("localization.statusDefault"), variant: "default" };
  if (locale.enabled)
    return { label: t("localization.statusActive"), variant: "secondary" };
  return { label: t("localization.statusDisabled"), variant: "outline" };
}

function fallbackLabel(locale: ContentLocaleDefinition): string {
  return locale.fallbacks.length
    ? locale.fallbacks.join("  →  ")
    : t("localization.none");
}

function selectLocale(code: string): void {
  selectedLocaleCode.value = code;
}

function addLocale(option: (typeof LOCALE_CATALOG)[number]): void {
  addContentLocaleIfMissing(locales.value, {
    code: option.code,
    label: option.label,
    enabled: true,
    fallbacks: [defaultLocale.value],
    direction: option.direction,
  });
  selectedLocaleCode.value = option.code;
  localePickerOpen.value = false;
}

function fallbackText(locale: ContentLocaleDefinition): string {
  return locale.fallbacks.join(", ");
}

function setFallbackText(value: string): void {
  if (!selectedLocale.value) return;
  selectedLocale.value.fallbacks = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function disableLocale(locale: ContentLocaleDefinition): void {
  if (isDefaultLocale(locale)) return;
  locale.enabled = false;
  for (const candidate of locales.value) {
    candidate.fallbacks = candidate.fallbacks.filter(
      (fallback) => fallback !== locale.code,
    );
  }
}

function requestLocaleRemoval(locale: ContentLocaleDefinition): void {
  if (isDefaultLocale(locale)) return;
  localePendingRemoval.value = locale;
}

function confirmLocaleRemoval(): void {
  const locale = localePendingRemoval.value;
  if (!locale) return;
  const index = locales.value.indexOf(locale);
  if (index < 0) return;
  locales.value.splice(index, 1);
  for (const candidate of locales.value) {
    candidate.fallbacks = candidate.fallbacks.filter(
      (fallback) => fallback !== locale.code,
    );
  }
  selectedLocaleCode.value = defaultLocale.value;
  localePendingRemoval.value = null;
}

async function save(): Promise<void> {
  const parsed = ContentLocalizationSettingsSchema.safeParse({
    defaultLocale: defaultLocale.value,
    locales: locales.value,
  });
  if (!parsed.success) {
    toast.error(parsed.error.issues[0]?.message ?? t("common.failed"));
    return;
  }

  try {
    await updateContentLocalization(parsed.data);
    persistedLocaleCodes.value = new Set(
      parsed.data.locales.map((locale) => locale.code),
    );
    initialSnapshot.value = localeSnapshot();
    toast.success(t("localization.saveSuccess"));
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t("common.failed"));
  }
}

function discardChanges(): void {
  applySettings(contentLocalization.value);
}

useSettingsTabHydrate({
  tabId: "localization",
  hydrate: () => loadSettings({ force: true }),
});
</script>

<template>
  <div class="space-y-10" role="form" :aria-label="t('localization.title')">
    <section
      class="pt-3"
      :aria-label="t('localization.defaultLocale')"
    >
      <SettingsRow
        :label="t('localization.defaultLocale')"
        :description="t('localization.defaultLocaleDescription')"
        input-id="content-default-locale"
      >
        <Select v-model="defaultLocale" :disabled="isLoading || isSaving">
          <SelectTrigger id="content-default-locale" class="w-64 bg-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="locale in locales.filter((item) => item.enabled)"
              :key="locale.code"
              :value="locale.code"
            >
              {{ locale.label }} ({{ locale.code }})
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
    </section>

    <Alert
      v-if="validationIssues.length"
      variant="destructive"
      class="rounded-md"
    >
      <span :class="[studioIcons.warning, 'size-4']" aria-hidden="true" />
      <AlertTitle>{{
        t("localization.configurationNeedsAttention")
      }}</AlertTitle>
      <AlertDescription>{{ validationIssues[0] }}</AlertDescription>
    </Alert>

    <section class="space-y-3" :aria-labelledby="'content-languages-heading'">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <h4
              id="content-languages-heading"
              class="m-0 text-sm font-semibold text-foreground"
            >
              {{ t("localization.enabledLocales") }}
            </h4>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ t("localization.languageListDescription") }}
          </p>
        </div>

        <Popover v-model:open="localePickerOpen">
          <PopoverTrigger as-child>
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="isLoading || isSaving"
            >
              <span :class="[studioIcons.plus, 'mr-1 size-3.5']" />
              {{ t("localization.addLocale") }}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-80 p-0">
            <Command>
              <CommandInput :placeholder="t('localization.searchLanguages')" />
              <CommandList class="max-h-72">
                <CommandEmpty>{{
                  t("localization.noLanguagesFound")
                }}</CommandEmpty>
                <CommandGroup :heading="t('localization.availableLanguages')">
                  <CommandItem
                    v-for="option in availableLocaleOptions"
                    :key="option.code"
                    :value="`${option.label} ${option.code}`"
                    class="gap-2"
                    @select="addLocale(option)"
                  >
                    <span
                      :class="[
                        studioIcons.globe,
                        'size-3.5 text-muted-foreground',
                      ]"
                    />
                    <span class="min-w-0 flex-1 truncate">{{
                      option.label
                    }}</span>
                    <span class="font-mono text-2xs text-muted-foreground">{{
                      option.code
                    }}</span>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div
        class="overflow-hidden rounded-sm border border-border/50 border-solid bg-background"
      >
        <Table class="w-full table-auto border-collapse">
          <TableHeader class="border-b border-border border-dashed bg-card/50!">
            <TableRow class="hover:bg-transparent">
              <TableHead
                class="w-full text-xs font-medium text-muted-foreground"
                >{{ t("localization.language") }}</TableHead
              >
              <TableHead
                class="whitespace-nowrap text-xs font-medium text-muted-foreground"
                >{{ t("localization.status") }}</TableHead
              >
              <TableHead
                class="hidden whitespace-nowrap text-xs font-medium text-muted-foreground md:table-cell"
                >{{ t("localization.fallbacks") }}</TableHead
              >
              <TableHead
                class="hidden whitespace-nowrap text-xs font-medium text-muted-foreground lg:table-cell"
                >{{ t("localization.direction") }}</TableHead
              >
              <TableHead class="w-12"
                ><span class="sr-only">{{
                  t("localization.actions")
                }}</span></TableHead
              >
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="locale in locales"
              :key="locale.code || `new-${locales.indexOf(locale)}`"
              class="group border-b border-border last:border-0 hover:bg-muted/50"
              :tabindex="0"
              @click="selectLocale(locale.code)"
              @keydown.enter.prevent="selectLocale(locale.code)"
              @keydown.space.prevent="selectLocale(locale.code)"
            >
              <TableCell class="min-w-0 py-3">
                <div class="flex items-baseline gap-2">
                  <span class="truncate text-sm font-medium text-foreground">
                    {{ locale.label || t("localization.unnamedLanguage") }}
                  </span>
                  <span
                    class="shrink-0 font-mono text-xs text-muted-foreground"
                  >
                    {{ locale.code || t("localization.newLocale") }}
                  </span>
                </div>
              </TableCell>
              <TableCell class="whitespace-nowrap py-3">
                <Badge :variant="statusFor(locale).variant" size="xs">{{
                  statusFor(locale).label
                }}</Badge>
              </TableCell>
              <TableCell
                class="hidden max-w-64 whitespace-nowrap py-3 md:table-cell"
              >
                <span
                  class="truncate font-mono text-xs text-muted-foreground"
                  >{{ fallbackLabel(locale) }}</span
                >
              </TableCell>
              <TableCell class="hidden whitespace-nowrap py-3 lg:table-cell">
                <span class="text-xs text-muted-foreground">{{
                  locale.direction === "rtl"
                    ? t("localization.directionRtl")
                    : t("localization.directionLtr")
                }}</span>
              </TableCell>
              <TableCell class="py-3 text-right" @click.stop>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      :aria-label="t('localization.actions')"
                    >
                      <span :class="[studioIcons.moreHorizontal, 'size-4']" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-44">
                    <DropdownMenuItem @select="selectLocale(locale.code)">
                      <span :class="[studioIcons.edit, 'size-3.5']" />
                      {{ t("localization.editLanguage") }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="isPersistedLocale(locale)"
                      :disabled="isDefaultLocale(locale)"
                      @select="disableLocale(locale)"
                    >
                      <span :class="[studioIcons.close, 'size-3.5']" />
                      {{ t("localization.disableLocale") }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      :disabled="isDefaultLocale(locale)"
                      @select="requestLocaleRemoval(locale)"
                    >
                      <span :class="[studioIcons.trash, 'size-3.5']" />
                      {{ t("localization.removeLocale") }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </section>

    <section
      v-if="selectedLocale"
      class="pt-5"
      aria-labelledby="language-configuration-heading"
    >
      <div>
        <div class="flex items-start justify-between gap-3">
          <div>
            <h4
              id="language-configuration-heading"
              class="m-0 text-sm font-semibold"
            >
              {{ t("localization.languageConfiguration") }}
            </h4>
            <p class="mt-1 text-xs text-muted-foreground">
              {{
                selectedLocale.label || t("localization.newLanguageDescription")
              }}
              <span v-if="selectedLocale.code" class="font-mono"
                >· {{ selectedLocale.code }}</span
              >
            </p>
          </div>
          <Badge :variant="statusFor(selectedLocale).variant" size="xs">{{
            statusFor(selectedLocale).label
          }}</Badge>
        </div>
      </div>

      <div class="max-w-3xl space-y-5 pt-5">
        <SettingsRow
          :label="t('localization.fallbacks')"
          :description="t('localization.fallbackDescription')"
          input-id="locale-fallbacks"
        >
          <Input
            id="locale-fallbacks"
            :model-value="fallbackText(selectedLocale)"
            :disabled="isLoading || isSaving"
            class="w-72 bg-input font-mono"
            placeholder="en"
            @update:model-value="setFallbackText(String($event))"
          />
        </SettingsRow>

        <SettingsRow
          :label="t('localization.direction')"
          input-id="locale-direction"
        >
          <Select
            v-model="selectedLocale.direction"
            :disabled="isLoading || isSaving"
          >
            <SelectTrigger id="locale-direction" class="w-56 bg-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ltr">{{
                t("localization.directionLtr")
              }}</SelectItem>
              <SelectItem value="rtl">{{
                t("localization.directionRtl")
              }}</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
      </div>
    </section>

    <LocalizationConfirmationDialog
      :open="localePendingRemoval !== null"
      :title="t('localization.removeConfirmationTitle')"
      :description="
        t('localization.removeConfirmationDescription', {
          language:
            localePendingRemoval?.label ?? localePendingRemoval?.code ?? '',
        })
      "
      :confirm-label="t('localization.removeLocale')"
      destructive
      @update:open="
        (open) => {
          if (!open) localePendingRemoval = null;
        }
      "
      @confirm="confirmLocaleRemoval"
    />

    <Teleport defer to="#settings-tab-footer-left">
      <p class="text-xs text-muted-foreground">
        <template v-if="isDirty">{{
          t("localization.unsavedChanges")
        }}</template>
        <template v-else>{{ t("localization.allChangesSaved") }}</template>
      </p>
    </Teleport>

    <Teleport defer to="#settings-tab-footer-actions">
      <div class="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="md"
          :disabled="isLoading || isSaving || !isDirty"
          @click="discardChanges"
        >
          {{ t("localization.discardChanges") }}
        </Button>
        <Button
          type="button"
          size="md"
          :disabled="
            isLoading || isSaving || !isDirty || validationIssues.length > 0
          "
          @click="save"
        >
          {{ isSaving ? t("common.saving") : t("common.save") }}
        </Button>
      </div>
    </Teleport>
  </div>
</template>
