<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { z } from "zod";
import { toast } from "vue-sonner";
import { actions } from "astro:actions";
import { log } from "@/lib/utils/logger";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DesignAssetImportDialog from "../dialogs/DesignAssetImportDialog.vue";
import { TYPOGRAPHY_FONTS_UPDATED_EVENT } from "../composables/useTypography";
import {
  CustomFontActionSuccessSchema,
  EnabledGoogleFontActionSuccessSchema,
  FontConfigActionSuccessSchema,
  FontMutationActionSuccessSchema,
  GoogleFontListActionSuccessSchema,
  type CustomFontRecord,
  type EnabledGoogleFontRecord,
  type GoogleFontRecord,
  unwrapFontActionResult,
} from "../composables/typographyActionResults";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import ExpandableSearchInput from "@/features/Studio/core/components/ExpandableSearchInput.vue";
import HeaderActionDropdownTooltip from "@/features/Studio/core/components/HeaderActionDropdownTooltip.vue";
import DesignHeaderTeleport from "../components/DesignHeaderTeleport.vue";

const FONTS_TABS = [
  { id: "google" },
  { id: "custom" },
] as const;

type FontTab = (typeof FONTS_TABS)[number]["id"];

const activeTab = ref<FontTab>("google");

type CustomFont = CustomFontRecord;
type GoogleFont = GoogleFontRecord;
type EnabledGoogleFont = EnabledGoogleFontRecord;

const GoogleFontCategorySchema = z.enum([
  "all",
  "sans-serif",
  "serif",
  "display",
  "monospace",
]);

type GoogleFontCategory = z.infer<typeof GoogleFontCategorySchema>;

const googleFontCategory = ref<GoogleFontCategory>("all");
const googleFontSearch = ref("");
const googleFonts = ref<GoogleFont[]>([]);
const enabledGoogleFonts = ref<EnabledGoogleFont[]>([]);
const customFonts = ref<CustomFont[]>([]);
const isLoading = ref(false);
const isImportDialogOpen = ref(false);
const isUploading = ref(false);
const isEnabling = ref<string | null>(null);
const isDeletingCustomFont = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const fontPendingDelete = ref<CustomFont | null>(null);
const { t } = useStudioI18n();

// Custom font preview (FontFace-based inline loader)
const customFontPreviewFamilies = ref<Record<string, string>>({});
const customFontPreviewStatus = ref<
  Record<string, "loading" | "ready" | "error">
>({});

const GOOGLE_FONTS_PAGE_SIZE = 32;
const GOOGLE_FONT_SEARCH_DEBOUNCE_MS = 250;
const GOOGLE_FONT_PREVIEW_BATCH_SIZE = 30;
const GOOGLE_FONT_PREVIEW_IDLE_TIMEOUT_MS = 750;
const sentinelRef = ref<HTMLDivElement | null>(null);
const loadedPreviewFamilies = ref(new Set<string>());
const googleFontsTotal = ref(0);
const isLoadingMoreGoogleFonts = ref(false);

let sentinelObserver: IntersectionObserver | null = null;
let googleFontsRequestSeq = 0;
let googleFontSearchTimer: ReturnType<typeof setTimeout> | null = null;
let previewLoadTimer: ReturnType<typeof setTimeout> | null = null;
let sentinelIsIntersecting = false;

const enabledFontIds = computed(
  () => new Set(enabledGoogleFonts.value.map((font) => font.id)),
);

const allFilteredGoogleFonts = computed(() => {
  return googleFonts.value
    .slice()
    .sort((left, right) => {
      const leftEnabled = isGoogleFontEnabled(left) ? 0 : 1;
      const rightEnabled = isGoogleFontEnabled(right) ? 0 : 1;

      return (
        leftEnabled - rightEnabled || left.family.localeCompare(right.family)
      );
    });
});

const filteredGoogleFonts = computed(() => allFilteredGoogleFonts.value);

const hasMoreGoogleFonts = computed(
  () => googleFonts.value.length < googleFontsTotal.value,
);

watch([googleFontSearch, googleFontCategory], () => {
  if (googleFontSearchTimer) {
    clearTimeout(googleFontSearchTimer);
  }

  googleFontSearchTimer = setTimeout(() => {
    void loadGoogleFonts({ append: false });
  }, GOOGLE_FONT_SEARCH_DEBOUNCE_MS);
});

watch(filteredGoogleFonts, () => {
  scheduleVisibleGoogleFontPreviews();
});

function injectFontPreviewCSS(families: string[]): void {
  const toLoad = families.filter((f) => !loadedPreviewFamilies.value.has(f));
  if (toLoad.length === 0) return;

  const encoded = toLoad
    .map((f) => `family=${encodeURIComponent(f)}:wght@400`)
    .join("&");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${encoded}&display=swap`;
  document.head.appendChild(link);
  toLoad.forEach((f) => loadedPreviewFamilies.value.add(f));
}

function scheduleIdleWork(callback: () => void): void {
  if (previewLoadTimer) {
    clearTimeout(previewLoadTimer);
    previewLoadTimer = null;
  }

  const run = () => {
    previewLoadTimer = null;
    callback();
  };

  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(run, {
      timeout: GOOGLE_FONT_PREVIEW_IDLE_TIMEOUT_MS,
    });
    return;
  }

  previewLoadTimer = setTimeout(run, 0);
}

function scheduleVisibleGoogleFontPreviews(): void {
  const families = filteredGoogleFonts.value
    .map((font) => font.family)
    .filter((family) => !loadedPreviewFamilies.value.has(family))
    .slice(0, GOOGLE_FONT_PREVIEW_BATCH_SIZE);

  if (families.length === 0) {
    return;
  }

  scheduleIdleWork(() => injectFontPreviewCSS(families));
}

function setupSentinelObserver(): void {
  if (sentinelObserver) {
    sentinelObserver.disconnect();
  }

  sentinelObserver = new IntersectionObserver(
    (entries) => {
      sentinelIsIntersecting = Boolean(entries[0]?.isIntersecting);
      if (sentinelIsIntersecting) {
        void loadGoogleFonts({ append: true });
      }
    },
    { threshold: 0.1 },
  );

  if (sentinelRef.value) {
    sentinelObserver.observe(sentinelRef.value);
  }
}

watch(sentinelRef, (el) => {
  if (el) setupSentinelObserver();
});

onMounted(async () => {
  isLoading.value = true;
  try {
    await Promise.all([loadGoogleFonts(), loadEnabledFonts()]);
  } finally {
    isLoading.value = false;
    void nextTick(scheduleVisibleGoogleFontPreviews);
  }

  window.addEventListener(TYPOGRAPHY_FONTS_UPDATED_EVENT, handleFontsUpdated);
});

onBeforeUnmount(() => {
  sentinelObserver?.disconnect();
  sentinelIsIntersecting = false;
  if (googleFontSearchTimer) {
    clearTimeout(googleFontSearchTimer);
  }
  if (previewLoadTimer) {
    clearTimeout(previewLoadTimer);
  }
  window.removeEventListener(
    TYPOGRAPHY_FONTS_UPDATED_EVENT,
    handleFontsUpdated,
  );
});

async function handleFontsUpdated() {
  await loadEnabledFonts();
}

async function loadGoogleFonts(options: { append?: boolean } = {}) {
  const append = Boolean(options.append);

  if (options.append) {
    if (isLoadingMoreGoogleFonts.value || !hasMoreGoogleFonts.value) {
      return;
    }

    isLoadingMoreGoogleFonts.value = true;
  } else {
    isLoading.value = true;
  }

  const requestSeq = ++googleFontsRequestSeq;
  const search = googleFontSearch.value.trim();
  const offset = append ? googleFonts.value.length : 0;

  try {
    const result = unwrapFontActionResult(
      await actions.fonts.listGoogle({
        search: search || undefined,
        category: googleFontCategory.value,
        limit: GOOGLE_FONTS_PAGE_SIZE,
        offset,
      }),
      GoogleFontListActionSuccessSchema,
      t("design.fonts.loadGoogleFailed"),
      {
        source: "FontView.loadGoogleFonts",
      },
    );

    if (requestSeq !== googleFontsRequestSeq || !result.success) {
      return;
    }

    const nextFonts = append
      ? [...googleFonts.value, ...result.data.fonts]
      : result.data.fonts;

    googleFonts.value = Array.from(
      new Map(nextFonts.map((font) => [font.family, font])).values(),
    );
    googleFontsTotal.value = result.data.total ?? googleFonts.value.length;
    void nextTick(() => {
      scheduleVisibleGoogleFontPreviews();
      if (sentinelIsIntersecting && hasMoreGoogleFonts.value) {
        void loadGoogleFonts({ append: true });
      }
    });
  } finally {
    if (append) {
      isLoadingMoreGoogleFonts.value = false;
    } else if (requestSeq === googleFontsRequestSeq) {
      isLoading.value = false;
    }
  }
}

async function loadEnabledFonts() {
  const result = unwrapFontActionResult(
    await actions.fonts.getConfig({}),
    FontConfigActionSuccessSchema,
    t("design.fonts.loadLibraryFailed"),
    {
      source: "FontView.loadEnabledFonts",
    },
  );

  if (!result.success) {
    return;
  }

  customFonts.value = result.data.data.customFonts;
  enabledGoogleFonts.value = result.data.data.enabledGoogleFonts;
}

function notifyFontLibraryUpdated() {
  window.dispatchEvent(new Event(TYPOGRAPHY_FONTS_UPDATED_EVENT));
}

function getGoogleFontId(font: GoogleFont): string {
  return `google-${font.family.toLowerCase().replace(/\s+/g, "-")}`;
}

function isGoogleFontEnabled(font: GoogleFont): boolean {
  return enabledFontIds.value.has(getGoogleFontId(font));
}

function setGoogleFontCategory(value: string) {
  const parsedCategory = GoogleFontCategorySchema.safeParse(value);
  if (!parsedCategory.success) {
    return;
  }

  googleFontCategory.value = parsedCategory.data;
}

async function enableGoogleFont(font: GoogleFont) {
  const fontId = getGoogleFontId(font);
  isEnabling.value = fontId;

  try {
    const result = unwrapFontActionResult(
      await actions.fonts.enableGoogle({
        family: font.family,
        variants: font.variants.slice(0, 4),
      }),
      EnabledGoogleFontActionSuccessSchema,
      t("design.fonts.enableFailed"),
      {
        source: "FontView.enableGoogleFont",
        family: font.family,
      },
    );

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    enabledGoogleFonts.value.push(result.data.font);
    notifyFontLibraryUpdated();
  } catch (error) {
    log("error", "[FontView] Failed to enable font", { error });
    toast.error(t("design.fonts.enableFailed"));
  } finally {
    isEnabling.value = null;
  }
}

async function disableGoogleFont(fontId: string) {
  isEnabling.value = fontId;

  try {
    const result = unwrapFontActionResult(
      await actions.fonts.disableGoogle({ fontId }),
      FontMutationActionSuccessSchema,
      t("design.fonts.disableFailed"),
      {
        source: "FontView.disableGoogleFont",
        fontId,
      },
    );

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    enabledGoogleFonts.value = enabledGoogleFonts.value.filter(
      (font) => font.id !== fontId,
    );
    notifyFontLibraryUpdated();
  } catch (error) {
    log("error", "[FontView] Failed to disable font", { error });
    toast.error(t("design.fonts.disableFailed"));
  } finally {
    isEnabling.value = null;
  }
}

function triggerFilePicker() {
  fileInputRef.value?.click();
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  activeTab.value = "custom";
  void uploadFont(file);
}

async function uploadFont(file: File) {
  const validExtensions = new Set(["woff2", "woff", "ttf", "otf", "eot"]);
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (!validExtensions.has(extension)) {
    toast.error(t("design.fonts.invalidFileType"));
    return;
  }

  isUploading.value = true;

  try {
    const formData = new FormData();
    formData.append("file", file);

    const result = unwrapFontActionResult(
      await actions.fonts.uploadCustom(formData),
      CustomFontActionSuccessSchema,
      t("design.fonts.uploadFailed"),
      {
        source: "FontView.uploadFont",
        fileName: file.name,
      },
    );

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    customFonts.value.unshift(result.data.font);
    notifyFontLibraryUpdated();
  } catch (error) {
    log("error", "[FontView] Failed to upload font", { error });
    toast.error(t("design.fonts.uploadFailed"));
  } finally {
    isUploading.value = false;
    if (fileInputRef.value) {
      fileInputRef.value.value = "";
    }
  }
}

function openDeleteCustomFontDialog(font: CustomFont) {
  fontPendingDelete.value = font;
}

function closeDeleteCustomFontDialog() {
  if (isDeletingCustomFont.value) {
    return;
  }

  fontPendingDelete.value = null;
}

async function confirmDeleteCustomFont() {
  const font = fontPendingDelete.value;
  if (!font) {
    return;
  }

  isDeletingCustomFont.value = font.id;

  try {
    const result = unwrapFontActionResult(
      await actions.fonts.deleteCustom({ fontId: font.id }),
      FontMutationActionSuccessSchema,
      t("design.fonts.deleteFailed"),
      {
        source: "FontView.deleteCustomFont",
        fontId: font.id,
      },
    );

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    customFonts.value = customFonts.value.filter(
      (registeredFont) => registeredFont.id !== font.id,
    );
    fontPendingDelete.value = null;
    notifyFontLibraryUpdated();
    toast.success(t("design.fonts.deleted"));
  } catch (error) {
    log("error", "[FontView] Failed to delete font", { error });
    toast.error(t("design.fonts.deleteFailed"));
  } finally {
    isDeletingCustomFont.value = null;
  }
}

function getFontSourceLabel(font: CustomFont): string {
  const format = font.format || font.formats?.[0]?.format || "custom";
  return format.toUpperCase();
}

function fontTabLabel(tabId: FontTab): string {
  return tabId === "google"
    ? t("design.fonts.googleTab")
    : t("design.fonts.customTab");
}

function googleCategoryLabel(category: GoogleFontCategory): string {
  switch (category) {
    case "all":
      return t("design.fonts.category.all");
    case "sans-serif":
      return t("design.fonts.category.sansSerif");
    case "serif":
      return t("design.fonts.category.serif");
    case "display":
      return t("design.fonts.category.display");
    case "monospace":
      return t("design.fonts.category.monospace");
  }
}

function getCustomFontUrl(font: CustomFont): string | null {
  return font.url || font.formats?.[0]?.url || null;
}

function getCustomFontFormat(font: CustomFont): string {
  return font.format || font.formats?.[0]?.format || "woff2";
}

function mapFormatForFontFace(format: string): string {
  switch (format) {
    case "ttf":
      return "truetype";
    case "otf":
      return "opentype";
    case "eot":
      return "embedded-opentype";
    default:
      return format; // woff2, woff
  }
}

async function loadCustomFontPreview(font: CustomFont): Promise<void> {
  const url = getCustomFontUrl(font);
  if (!url) {
    customFontPreviewStatus.value = {
      ...customFontPreviewStatus.value,
      [font.id]: "error",
    };
    return;
  }

  const familyName = `custom-font-${font.id}`;

  if (customFontPreviewFamilies.value[font.id] === familyName) {
    return;
  }

  customFontPreviewStatus.value = {
    ...customFontPreviewStatus.value,
    [font.id]: "loading",
  };

  try {
    const format = getCustomFontFormat(font);
    const fontFace = new FontFace(
      familyName,
      `url("${encodeURI(url)}") format("${mapFormatForFontFace(format)}")`,
      {
        style: font.style || "normal",
        weight: font.weight || "400",
        display: "swap",
      },
    );

    const loadedFont = await fontFace.load();
    document.fonts.add(loadedFont);

    customFontPreviewFamilies.value = {
      ...customFontPreviewFamilies.value,
      [font.id]: familyName,
    };
    customFontPreviewStatus.value = {
      ...customFontPreviewStatus.value,
      [font.id]: "ready",
    };
  } catch {
    customFontPreviewStatus.value = {
      ...customFontPreviewStatus.value,
      [font.id]: "error",
    };
  }
}

function loadAllCustomFontPreviews(): void {
  for (const font of customFonts.value) {
    void loadCustomFontPreview(font);
  }
}

watch(customFonts, () => loadAllCustomFontPreviews(), { immediate: true });
</script>

<template>
  <div class="min-w-0 space-y-0 px-0 page-card-enter z-10 bg-background">
    <!-- Teleport search & filter into DesignView PageHeader -->
    <DesignHeaderTeleport target="search">
      <ExpandableSearchInput
        v-if="activeTab === 'google'"
        :model-value="googleFontSearch"
        :placeholder="t('design.fonts.searchPlaceholder')"
        @update:model-value="(val: string) => (googleFontSearch = val)"
      />
    </DesignHeaderTeleport>
    <DesignHeaderTeleport target="toolbar">
      <HeaderActionDropdownTooltip
        v-if="activeTab === 'google'"
        :label="t('design.fonts.categoryButton')"
      >
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              variant="headerAction"
              size="icon-header"
              :class="
                googleFontCategory !== 'all'
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              "
              :aria-label="t('design.fonts.filterByCategory')"
            >
              <span
                :class="[
                  googleFontCategory !== 'all'
                    ? studioIcons.filterRemove
                    : studioIcons.filter,
                  'size-3.5 shrink-0',
                ]"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-36">
            <DropdownMenuItem
              :class="
                googleFontCategory === 'all' ? 'bg-input text-primary' : ''
              "
              @select="setGoogleFontCategory('all')"
              >{{ googleCategoryLabel("all") }}</DropdownMenuItem
            >
            <DropdownMenuItem
              :class="
                googleFontCategory === 'sans-serif'
                  ? 'bg-input text-primary'
                  : ''
              "
              @select="setGoogleFontCategory('sans-serif')"
              >{{ googleCategoryLabel("sans-serif") }}</DropdownMenuItem
            >
            <DropdownMenuItem
              :class="
                googleFontCategory === 'serif' ? 'bg-input text-primary' : ''
              "
              @select="setGoogleFontCategory('serif')"
              >{{ googleCategoryLabel("serif") }}</DropdownMenuItem
            >
            <DropdownMenuItem
              :class="
                googleFontCategory === 'display' ? 'bg-input text-primary' : ''
              "
              @select="setGoogleFontCategory('display')"
              >{{ googleCategoryLabel("display") }}</DropdownMenuItem
            >
            <DropdownMenuItem
              :class="
                googleFontCategory === 'monospace'
                  ? 'bg-input text-primary'
                  : ''
              "
              @select="setGoogleFontCategory('monospace')"
              >{{ googleCategoryLabel("monospace") }}</DropdownMenuItem
            >
          </DropdownMenuContent>
        </DropdownMenu>
      </HeaderActionDropdownTooltip>
    </DesignHeaderTeleport>
    <DesignHeaderTeleport target="importExport">
      <HeaderActionDropdownTooltip :label="t('design.moreActions')">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              variant="headerAction"
              size="icon-header"
              :aria-label="t('design.moreActions')"
            >
              <span :class="[studioIcons.moreHorizontal, 'size-3.5 shrink-0']" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-44">
            <DropdownMenuGroup>
              <DropdownMenuItem @select="isImportDialogOpen = true">
                {{ t("design.importAssets") }}
              </DropdownMenuItem>
              <DropdownMenuItem @select="triggerFilePicker">
                {{ t("design.fonts.uploadFont") }}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </HeaderActionDropdownTooltip>
    </DesignHeaderTeleport>

    <input
      ref="fileInputRef"
      type="file"
      accept=".woff2,.woff,.ttf,.otf,.eot"
      class="hidden"
      @change="handleFileSelect"
    />

    <!-- Tab Navigation -->
    <div
      class="sticky top-0 z-10 flex h-12 shrink-0 items-stretch gap-1 border-b border-dashed border-border bg-background px-7 inset-shadow-xs"
    >
      <Button
        v-for="tab in FONTS_TABS"
        :key="tab.id"
        type="button"
        size="tab"
        :variant="activeTab === tab.id ? 'tab-active' : 'tab'"
        @click="activeTab = tab.id"
      >
        {{ fontTabLabel(tab.id) }}
      </Button>
    </div>

    <div v-if="activeTab === 'google'" class="space-y-5 px-7 pt-8">
      <section class="min-w-0 space-y-5">
        <!-- Font grid -->
        <section class="min-w-0 space-y-3">
          <div v-if="isLoading" class="flex h-40 items-center justify-center">
            <span
              :class="[
                studioIcons.loading,
                'size-5 animate-spin text-muted-foreground',
              ]"
            />
          </div>

          <div
            v-else-if="googleFontsTotal === 0"
            class="flex h-40 flex-col items-center justify-center gap-2"
          >
            <span
              :class="[studioIcons.search, 'size-8 text-muted-foreground/30']"
            />
            <p class="text-sm text-muted-foreground/60">
              {{ t("design.fonts.noSearchResults") }}
            </p>
          </div>

          <div
            v-else
            class="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4"
          >
            <div
              v-for="font in filteredGoogleFonts"
              :key="font.family"
              :class="[
                'group relative flex flex-col justify-between gap-6 rounded-md border border-solid border-border px-5 py-5 transition-colors hover:bg-card/50',
                isGoogleFontEnabled(font)
                  ? 'border-primary/50 bg-primary/2 hover:border-dashed'
                  : 'border-solid border-border/50 hover:border-border hover:bg-card',
              ]"
            >
              <!-- Header row -->
              <div class="flex items-start justify-between gap-2">
                <p
                  class="min-w-0 truncate text-lg font-medium text-muted-foreground m-0"
                >
                  {{ font.family }}
                </p>

                <Button
                  v-if="isGoogleFontEnabled(font)"
                  variant="ghost"
                  size="xs"
                  class="h-5.5 shrink-0 rounded border border-primary/30 bg-primary/10 px-2 text-[10px] uppercase tracking-[0.14em] text-primary hover:bg-primary/20"
                  :disabled="isEnabling === getGoogleFontId(font)"
                  @click="disableGoogleFont(getGoogleFontId(font))"
                >
                  <span
                    v-if="isEnabling === getGoogleFontId(font)"
                    :class="[studioIcons.loading, 'mr-1 size-3 animate-spin']"
                  />
                  {{ t("design.fonts.active") }}
                </Button>

                <Button
                  v-else
                  variant="ghost"
                  size="xs"
                  class="shrink-0 rounded border border-dashed border-border/50 px-2 text-2xs! uppercase tracking-[0.14em] text-muted-foreground/60 hover:border-primary/40 hover:text-primary"
                  :disabled="isEnabling === getGoogleFontId(font)"
                  @click="enableGoogleFont(font)"
                >
                  <span
                    v-if="isEnabling === getGoogleFontId(font)"
                    :class="[studioIcons.loading, 'mr-1 size-3 animate-spin']"
                  />
                  {{ t("design.fonts.enable") }}
                </Button>
              </div>

              <!-- Specimen -->
              <div
                class="min-w-0 select-none leading-none"
                :style="{ fontFamily: font.family }"
              >
                <span class="text-4xl text-muted-foreground m-0">Aa</span>
                <p
                  class="mt-1 truncate text-sm text-balance m-0 text-muted-foreground/40"
                >
                  {{ t("design.fonts.specimen") }}
                </p>
              </div>
            </div>
          </div>

          <!-- Sentinel for lazy load -->
          <div
            v-if="hasMoreGoogleFonts"
            ref="sentinelRef"
            class="flex h-10 items-center justify-center"
          >
            <span
              :class="[
                studioIcons.loading,
                isLoadingMoreGoogleFonts ? 'animate-spin' : '',
                'size-4 text-muted-foreground/40',
              ]"
            />
          </div>

          <!-- Count -->
          <p
            v-if="googleFontsTotal > 0"
            class="pb-4 text-center text-[10px] text-muted-foreground/40"
          >
            {{
              t("design.fonts.countSummary", {
                loaded: googleFonts.length,
                total: googleFontsTotal,
              })
            }}
          </p>
        </section>
      </section>
    </div>

    <div
      v-else-if="activeTab === 'custom'"
      class="space-y-6 px-7 pt-7 page-card-enter max-w-4xl mx-auto"
    >
      <div class="flex items-center justify-between gap-3">
        <h1
          class="text-2xl font-serif font-medium tracking-tight text-foreground"
        >
          {{ t("design.fonts.customFontsTitle") }}
        </h1>
        <Button
          variant="outline"
          size="default"
          :disabled="isUploading"
          @click="triggerFilePicker"
          class="h-9! px-4 text-xs uppercase"
        >
          <span
            :class="[
              isUploading
                ? [studioIcons.loading, 'animate-spin']
                : studioIcons.upload,
              'size-4 mr-2',
            ]"
          />
          {{ t("design.fonts.uploadFont") }}
        </Button>
      </div>

      <div>
        <ScrollArea class="h-72 rounded-md">
          <div
            v-if="customFonts.length === 0"
            class="flex h-72 flex-col items-center justify-center gap-2 text-center"
          >
            <span
              :class="[
                studioIcons.textFontSize,
                'size-8 text-muted-foreground/40',
              ]"
            />
            <p class="text-sm text-muted-foreground/70">
              {{ t("design.fonts.noCustomFonts") }}
            </p>
          </div>

          <div v-else class="space-y-1.5">
            <div
              v-for="font in customFonts"
              :key="font.id"
              class="group flex items-center justify-between gap-3 rounded-md border border-dashed border-border/50 bg-sidebar/50 px-4 py-1 hover:bg-sidebar/80"
            >
              <div class="flex min-w-0 flex-1 items-center gap-4">
                <span
                  class="shrink-0 select-none text-4xl leading-none text-muted-foreground/60"
                  :style="
                    customFontPreviewFamilies[font.id]
                      ? { fontFamily: customFontPreviewFamilies[font.id] }
                      : undefined
                  "
                >
                  {{
                    customFontPreviewStatus[font.id] === "ready"
                      ? "Aa"
                      : customFontPreviewStatus[font.id] === "error"
                        ? ""
                        : ""
                  }}
                </span>
                <p
                  class="truncate text-sm font-medium text-foreground capitalize"
                >
                  {{ font.name }}
                </p>
              </div>
              <div
                class="flex items-center gap-2 text-3xs uppercase tracking-[0.18em] text-muted-foreground"
              >
                <div class="relative h-7 w-24">
                  <span
                    class="absolute inset-0 flex items-center justify-center rounded-full border border-border bg-card px-2 py-0.5 transition-opacity duration-150"
                    :class="[
                      'group-hover:opacity-0',
                      isDeletingCustomFont === font.id ? 'opacity-0' : '',
                    ]"
                  >
                    {{ getFontSourceLabel(font) }}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="absolute inset-0 h-7 w-full rounded-full text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-destructive! group-hover:opacity-100"
                    :class="
                      isDeletingCustomFont === font.id ? 'opacity-100' : ''
                    "
                    :disabled="Boolean(isDeletingCustomFont)"
                    @click="openDeleteCustomFontDialog(font)"
                  >
                    <span :class="[studioIcons.closeCircleBold, 'size-4']" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>

    <DesignAssetImportDialog
      :open="isImportDialogOpen"
      @update:open="isImportDialogOpen = $event"
    />

    <Dialog
      :open="Boolean(fontPendingDelete)"
      @update:open="(open) => !open && closeDeleteCustomFontDialog()"
    >
      <DialogContent class="sm:max-w-[525px]">
        <DialogHeader class="gap-0">
          <DialogTitle>{{ t("design.fonts.deleteDialog.title") }}</DialogTitle>
          <DialogDescription>
            {{ t("design.fonts.deleteDialog.descriptionStart") }}
            <span class="text-foreground font-medium">{{
              fontPendingDelete?.name
            }}</span>
            {{ t("design.fonts.deleteDialog.descriptionEnd") }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="destructive"
            size="default"
            :disabled="Boolean(isDeletingCustomFont)"
            @click="closeDeleteCustomFontDialog"
          >
            {{ t("common.cancel") }}
          </Button>
          <Button
            variant="default"
            size="default"
            :disabled="Boolean(isDeletingCustomFont)"
            @click="confirmDeleteCustomFont"
          >
            <span
              v-if="isDeletingCustomFont"
              :class="[studioIcons.loading, 'mr-1.5 size-3.5 animate-spin']"
            />
            {{
              isDeletingCustomFont
                ? t("common.deleting")
                : t("design.fonts.deleteDialog.deleteFont")
            }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
