<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { actions } from "astro:actions";
import { log } from "@/lib/utils/logger";
import { studioIcons } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import { unwrapLayoutInventoryActionResult } from "../../../composables/layoutInventoryActionResults";
import type { PagePolicyResult } from "../../../../lib/pages/policy";
import { JsonObjectSchema } from "../../../../lib/schemas/json";
import type { JsonObject, PageDSL } from "../../../../lib/types/nodes";
import {
  unwrapPageSettingsPageResult,
  unwrapPageSettingsPolicyResult,
  unwrapPageSettingsUpdateResult,
} from "../composables/pageSettingsActionResults";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import { useStudioI18n } from "@/i18n";

interface LayoutInfo {
  id?: string;
  name?: string;
  slots?: Array<{
    name: string;
    label?: string;
    description?: string;
    isDefault?: boolean;
  }>;
}

interface LayoutOption {
  id: string;
  name?: string;
  description?: string;
}

const ALLOWED_TWITTER_CARDS = [
  "summary_large_image",
  "summary",
  "app",
  "player",
] as const;

const TWITTER_CARD_SELECT_EMPTY_VALUE = "__default__";

type TwitterCardValue = (typeof ALLOWED_TWITTER_CARDS)[number];

interface Props {
  page: PageDSL | null;
  currentLayout?: LayoutInfo | null;
  mode?: "layout" | "metadata";
  showSaveSection?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  mode: "metadata",
  showSaveSection: true,
});
const { t } = useStudioI18n();

const emit = defineEmits<{
  pageSaved: [page: PageDSL];
  updateLayout: [layoutSlug: string];
}>();

const { canEditPageStructure } = useStudioCapabilities();

const isSaving = ref(false);
const error = ref<string | null>(null);
const layoutError = ref<string | null>(null);
const isMediaPickerOpen = ref(false);
const isLayoutPickerOpen = ref(false);
const availableLayouts = ref<LayoutOption[]>([]);
const isLoadingLayouts = ref(false);
const isSocialOpen = ref(false);
const isAdvancedOpen = ref(false);
const isRoutingAccessOpen = ref(true);
const isLoadingPolicy = ref(false);
const policyError = ref<string | null>(null);

const title = ref("");
const seoTitle = ref("");
const seoDescription = ref("");
const keywords = ref("");
const canonical = ref("");
const ogImage = ref("");
const ogTitle = ref("");
const ogDescription = ref("");
const ogType = ref("");
const twitterCard = ref("");
const twitterSite = ref("");
const twitterCreator = ref("");
const structuredData = ref("");
const noIndex = ref(false);
const noFollow = ref(false);
const systemRole = ref<PagePolicyResult["systemRole"]>("standard");
const accessMode = ref<PagePolicyResult["accessMode"]>("public");
const promptTitle = ref("");
const promptDescription = ref("");
const rememberForDays = ref("");
const newPassword = ref("");
const hasPassword = ref(false);
const clearPassword = ref(false);

const canEdit = computed(() => Boolean(props.page?.slug));
const showLayoutSection = computed(
  () => props.mode === "layout" && canEditPageStructure.value,
);
const showMetadataSections = computed(() => props.mode === "metadata");
const isNotFoundRole = computed(() => systemRole.value === "not-found");
const isPasswordAccess = computed(() => accessMode.value === "password");
const combinedError = computed(() => error.value ?? policyError.value);
const currentLayoutId = computed(() => props.currentLayout?.id || "");
const selectedLayoutName = computed(() => {
  if (!currentLayoutId.value) return t("composer.pageSettings.noLayout");

  const matched = availableLayouts.value.find(
    (layout) => layout.id === currentLayoutId.value,
  );

  return matched?.name || props.currentLayout?.name || currentLayoutId.value;
});

const selectedLayoutDescription = computed(() => {
  if (!currentLayoutId.value) {
    return t("composer.pageSettings.noLayoutDescription");
  }

  const matched = availableLayouts.value.find(
    (layout) => layout.id === currentLayoutId.value,
  );

  return matched?.description || t("composer.pageSettings.sharedLayoutDescription");
});

const resetPolicyState = (): void => {
  systemRole.value = "standard";
  accessMode.value = "public";
  promptTitle.value = "";
  promptDescription.value = "";
  rememberForDays.value = "";
  newPassword.value = "";
  hasPassword.value = false;
  clearPassword.value = false;
};

const applyPolicy = (policy: PagePolicyResult): void => {
  systemRole.value = policy.systemRole;
  accessMode.value = policy.accessMode;
  promptTitle.value = policy.promptTitle ?? "";
  promptDescription.value = policy.promptDescription ?? "";
  rememberForDays.value =
    typeof policy.rememberForDays === "number"
      ? String(policy.rememberForDays)
      : "";
  hasPassword.value = policy.hasPassword;
  newPassword.value = "";
  clearPassword.value = false;
};

const parseRememberForDays = (value: string): number | null => {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 30) {
    throw new Error(t("composer.pageSettings.rememberDaysInvalid"));
  }

  return parsed;
};

const parseKeywords = (value: string): string[] =>
  value
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);

const parseStructuredData = (value: string): JsonObject | undefined => {
  const normalized = value.trim();
  if (!normalized) return undefined;

  try {
    return JsonObjectSchema.parse(JSON.parse(normalized));
  } catch {
    throw new Error(t("composer.pageSettings.structuredDataInvalid"));
  }
};

const parseTwitterCard = (value: string): TwitterCardValue | undefined => {
  const normalized = value.trim();
  if (!normalized) return undefined;

  if ((ALLOWED_TWITTER_CARDS as readonly string[]).includes(normalized)) {
    return normalized as TwitterCardValue;
  }

  throw new Error(
    t("composer.pageSettings.twitterCardInvalid"),
  );
};

const pagePath = computed(() => {
  const slug = props.page?.slug?.trim();

  if (!slug || slug === "/" || slug === "index") {
    return "/";
  }

  return slug.startsWith("/") ? slug : `/${slug}`;
});

const keywordList = computed(() => parseKeywords(keywords.value));

const previewDomain = computed(() => {
  const canonicalValue = canonical.value.trim();

  if (canonicalValue) {
    try {
      return new URL(canonicalValue).hostname.replace(/^www\./, "");
    } catch {
      return (
        canonicalValue.replace(/^https?:\/\//, "").split("/")[0] ||
        "your-site.com"
      );
    }
  }

  return "your-site.com";
});

const searchTitlePreview = computed(
  () => seoTitle.value.trim() || title.value.trim() || t("composer.pageSettings.untitledPreview"),
);

const searchDescriptionPreview = computed(
  () =>
    seoDescription.value.trim() ||
    t("composer.pageSettings.searchPreviewFallback"),
);

const socialTitlePreview = computed(
  () => ogTitle.value.trim() || searchTitlePreview.value,
);

const socialDescriptionPreview = computed(
  () =>
    ogDescription.value.trim() ||
    seoDescription.value.trim() ||
    t("composer.pageSettings.socialPreviewFallback"),
);

const socialImagePreview = computed(() => ogImage.value.trim());
const openGraphTypePreview = computed(() => ogType.value.trim() || "website");
const twitterCardPreview = computed(
  () => twitterCard.value.trim() || "summary_large_image",
);
const searchTitleLength = computed(() => searchTitlePreview.value.length);
const searchDescriptionLength = computed(
  () => seoDescription.value.trim().length,
);
const robotsPreview = computed(() => {
  if (noIndex.value && noFollow.value) return t("pages.seo.robots.both");
  if (noIndex.value) return t("pages.seo.robots.noindex");
  if (noFollow.value) return t("pages.seo.robots.nofollow");

  return t("pages.seo.robots.all");
});

const twitterCardSelectValue = computed({
  get: () => twitterCard.value.trim() || TWITTER_CARD_SELECT_EMPTY_VALUE,
  set: (value: string) => {
    twitterCard.value = value === TWITTER_CARD_SELECT_EMPTY_VALUE ? "" : value;
  },
});

const hasSocialOverrides = computed(() => {
  return Boolean(
    ogImage.value.trim() ||
    ogTitle.value.trim() ||
    ogDescription.value.trim() ||
    ogType.value.trim() ||
    twitterCard.value.trim() ||
    twitterSite.value.trim() ||
    twitterCreator.value.trim(),
  );
});

const hasAdvancedOverrides = computed(() => {
  return Boolean(
    keywordList.value.length ||
    structuredData.value.trim() ||
    noIndex.value ||
    noFollow.value,
  );
});

const accessSummary = computed(() => {
  if (isNotFoundRole.value) {
    return t("composer.pageSettings.notFoundAccessSummary");
  }

  switch (accessMode.value) {
    case "password":
      return hasPassword.value
        ? t("composer.pageSettings.passwordAccessWithCurrent")
        : t("composer.pageSettings.passwordAccess");
    case "private":
      return t("composer.pageSettings.privateAccess");
    case "unlisted":
      return t("composer.pageSettings.unlistedAccess");
    default:
      return t("composer.pageSettings.publicAccessSummary");
  }
});

const rememberForDaysSummary = computed(() => {
  const normalized = rememberForDays.value.trim();
  if (!normalized) {
    return t("pages.access.sessionOnly");
  }

  return normalized === "1"
    ? t("pages.access.oneDay")
    : t("pages.access.days", { days: normalized });
});

const canSaveMetadata = computed(
  () =>
    Boolean(props.page?.slug) &&
    !isSaving.value &&
    !isLoadingPolicy.value &&
    !policyError.value,
);

watch(
  () => props.page,
  (page) => {
    title.value = page?.title || "";
    seoTitle.value = page?.settings?.seo?.title || "";
    seoDescription.value = page?.settings?.seo?.description || "";
    keywords.value = (page?.settings?.seo?.keywords || []).join(", ");
    canonical.value = page?.settings?.seo?.canonical || "";
    ogImage.value = page?.settings?.seo?.ogImage || "";
    ogTitle.value = page?.settings?.seo?.ogTitle || "";
    ogDescription.value = page?.settings?.seo?.ogDescription || "";
    ogType.value = page?.settings?.seo?.ogType || "";
    twitterCard.value = page?.settings?.seo?.twitterCard || "";
    twitterSite.value = page?.settings?.seo?.twitterSite || "";
    twitterCreator.value = page?.settings?.seo?.twitterCreator || "";
    structuredData.value = page?.settings?.seo?.structuredData
      ? JSON.stringify(page.settings.seo.structuredData, null, 2)
      : "";
    noIndex.value = Boolean(page?.settings?.seo?.noindex);
    noFollow.value = Boolean(page?.settings?.seo?.nofollow);
    error.value = null;

    if (page?.slug) {
      void loadPolicy(page.slug);
    } else {
      policyError.value = null;
      resetPolicyState();
    }
  },
  { immediate: true },
);

watch(systemRole, (nextRole) => {
  if (nextRole === "not-found") {
    accessMode.value = "public";
    clearPassword.value = false;
  }
});

watch(accessMode, (nextAccessMode) => {
  if (nextAccessMode !== "password") {
    clearPassword.value = false;
    newPassword.value = "";
  }
});

async function loadPolicy(slug: string): Promise<void> {
  isLoadingPolicy.value = true;
  policyError.value = null;

  try {
    const result = await actions.pages.getPolicy({ slug });
    const parsed = unwrapPageSettingsPolicyResult(
      result,
      t("composer.pageSettings.loadPolicyFailed"),
      {
        source: "PageSettingsPanel.loadPolicy",
        slug,
      },
    );
    if (!parsed.success) {
      throw new Error(parsed.error);
    }

    applyPolicy(parsed.data);
  } catch (loadError) {
    policyError.value =
      loadError instanceof Error
        ? loadError.message
        : t("composer.pageSettings.loadPolicyFailed");
    resetPolicyState();
  } finally {
    isLoadingPolicy.value = false;
  }
}

const fetchLayouts = async (): Promise<void> => {
  isLoadingLayouts.value = true;
  layoutError.value = null;

  try {
    const { data, error: initError } = await actions.init();
    const parsed = unwrapLayoutInventoryActionResult(
      {
        data,
        error: initError,
      },
      t("composer.pageSettings.loadLayoutsFailed"),
      {
        source: "PageSettingsPanel.fetchLayouts",
      },
    );
    if (!parsed.success) {
      throw new Error(parsed.error);
    }

    availableLayouts.value = parsed.data.map((layout) => ({
      id: layout.id,
      name: layout.name,
      description: layout.description,
    }));
  } catch (fetchError) {
    layoutError.value =
      fetchError instanceof Error
        ? fetchError.message
        : t("composer.pageSettings.loadLayoutsFailed");
    availableLayouts.value = [];
    log("error", "Failed to fetch layouts for page settings", {
      error:
        fetchError instanceof Error ? fetchError.message : String(fetchError),
    });
  } finally {
    isLoadingLayouts.value = false;
  }
};

const handleOgImageSelect = (asset: MediaAsset): void => {
  ogImage.value = asset.url;
};

const handleLayoutChange = (layoutSlug: string): void => {
  isLayoutPickerOpen.value = false;
  emit("updateLayout", layoutSlug);
};

const handleSave = async (): Promise<void> => {
  if (!props.page?.slug) return;

  if (policyError.value) {
    error.value = policyError.value;
    return;
  }

  isSaving.value = true;
  error.value = null;

  try {
    const { data: policyData, error: policyUpdateError } =
      await actions.pages.updatePolicy({
        slug: props.page.slug,
        systemRole: systemRole.value,
        accessMode: accessMode.value,
        newPassword:
          isPasswordAccess.value && newPassword.value.trim().length > 0
            ? newPassword.value
            : undefined,
        clearPassword:
          isPasswordAccess.value && clearPassword.value
            ? clearPassword.value
            : undefined,
        promptTitle: isPasswordAccess.value ? promptTitle.value : undefined,
        promptDescription: isPasswordAccess.value
          ? promptDescription.value
          : undefined,
        rememberForDays: isPasswordAccess.value
          ? parseRememberForDays(rememberForDays.value)
          : null,
      });

    const policyResult = unwrapPageSettingsPolicyResult(
      {
        data: policyData,
        error: policyUpdateError,
      },
      t("composer.pageSettings.savePolicyFailed"),
      {
        source: "PageSettingsPanel.handleSave.updatePolicy",
        slug: props.page.slug,
      },
    );
    if (!policyResult.success) {
      throw new Error(policyResult.error);
    }

    applyPolicy(policyResult.data);

    const { data, error: fetchError } = await actions.getItem({
      collection: "pages",
      slug: props.page.slug,
    });

    const currentResult = unwrapPageSettingsPageResult(
      {
        data,
        error: fetchError,
      },
      t("composer.pageSettings.loadPageFailed"),
      {
        source: "PageSettingsPanel.handleSave.getItem",
        slug: props.page.slug,
      },
    );
    if (!currentResult.success) {
      throw new Error(currentResult.error);
    }

    const current = currentResult.data;
    const nextPage: PageDSL = {
      ...current,
      title: title.value.trim() || current.slug,
      settings: {
        ...current.settings,
        seo: {
          ...current.settings?.seo,
          title: seoTitle.value.trim() || undefined,
          description: seoDescription.value.trim() || undefined,
          keywords: parseKeywords(keywords.value),
          canonical: canonical.value.trim() || undefined,
          ogImage: ogImage.value.trim() || undefined,
          ogTitle: ogTitle.value.trim() || undefined,
          ogDescription: ogDescription.value.trim() || undefined,
          ogType: ogType.value.trim() || undefined,
          twitterCard: parseTwitterCard(twitterCard.value),
          twitterSite: twitterSite.value.trim() || undefined,
          twitterCreator: twitterCreator.value.trim() || undefined,
          structuredData: parseStructuredData(structuredData.value),
          noindex: noIndex.value,
          nofollow: noFollow.value,
        },
      },
      updatedAt: new Date().toISOString(),
    };

    const { data: saveData, error: saveError } = await actions.updateItem({
      collection: "pages",
      slug: current.slug,
      data: nextPage,
      expectedVersion: current.version,
    });

    const saveResult = unwrapPageSettingsUpdateResult(
      {
        data: saveData,
        error: saveError,
      },
      t("composer.pageSettings.saveFailed"),
      {
        source: "PageSettingsPanel.handleSave.updateItem",
        slug: current.slug,
      },
    );
    if (!saveResult.success) {
      throw new Error(saveResult.error);
    }

    // updateItem creates a new page revision. Keep Composer's optimistic-save
    // token in sync so a settings save cannot conflict with the next content save.
    emit("pageSaved", { ...nextPage, version: saveResult.version });
  } catch (err) {
    error.value = err instanceof Error ? err.message : t("composer.pageSettings.saveFailed");
  } finally {
    isSaving.value = false;
  }
};

defineExpose({
  saveMetadata: handleSave,
  isSaving,
  errorMessage: combinedError,
});

onMounted(() => {
  void fetchLayouts();
});
</script>

<template>
  <div class="space-y-2 px-2 pb-4 pt-1">
    <div
      v-if="!canEdit"
      class="rounded-lg border border-dashed border-border/50 bg-background/30 px-3 py-4 text-sm text-foreground/55"
    >
      {{ t("composer.pageSettings.unavailable") }}
    </div>

    <template v-else>
      <section v-if="showLayoutSection" class="overflow-hidden bg-background">
        <div
          class="flex flex-col gap-3 border-b border-dashed border-border/50 px-4 py-2 md:flex-row md:items-start md:justify-between md:px-5"
        >
          <div class="space-y-1.5">
            <p class="max-w-2xl text-sm leading-6 text-foreground/55">
              {{ t("composer.pageSettings.layoutIntro") }}
            </p>
          </div>
        </div>

        <div
          class="grid gap-4 px-4 py-4 md:px-5 xl:grid-cols-[minmax(0,1fr)_280px]"
        >
          <div class="space-y-2.5">
            <label class="text-xs font-medium text-foreground/70">{{ t("pages.layout") }}</label>

            <Popover v-model:open="isLayoutPickerOpen">
              <PopoverTrigger as-child>
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-[20px] border border-border/50 bg-background/80 px-3.5 py-3 text-left shadow-sm transition-colors hover:bg-background"
                >
                  <span
                    class="flex size-10 items-center justify-center rounded-xl border border-border/50 bg-background text-foreground/65"
                  >
                    <span :class="[studioIcons.windowFrame, 'size-4.5']" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-sm font-medium text-foreground"
                    >
                      {{ selectedLayoutName }}
                    </span>
                    <span
                      class="mt-1 block truncate text-[11px] text-foreground/45"
                    >
                      {{
                        currentLayoutId ? t("composer.pageSettings.assignedLayout") : t("composer.pageSettings.noSharedLayout")
                      }}
                    </span>
                  </span>
                  <span
                    :class="[studioIcons.chevronDown, 'size-4 text-foreground/40']"
                  />
                </button>
              </PopoverTrigger>

              <PopoverContent align="start" class="w-[280px] p-1.5">
                <div
                  v-if="isLoadingLayouts"
                  class="rounded-md px-3 py-4 text-center text-xs text-foreground/50"
                >
                  {{ t("composer.pageSettings.loadingLayouts") }}
                </div>

                <div
                  v-else-if="layoutError"
                  class="rounded-md px-3 py-4 text-xs text-destructive"
                >
                  {{ layoutError }}
                </div>

                <ScrollArea v-else class="max-h-72">
                  <div class="space-y-1 pr-1">
                    <button
                      type="button"
                      @click="handleLayoutChange('')"
                      :class="[
                        'flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                        !currentLayoutId
                          ? 'bg-secondary text-foreground'
                          : 'text-foreground/72 hover:bg-muted/25',
                      ]"
                    >
                      <span
                        class="mt-0.5 flex size-7 items-center justify-center rounded-md border border-border/50 bg-background text-foreground/65"
                      >
                        <span
                          :class="[studioIcons.sidebarMinimal, 'size-3.5']"
                        />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span
                          class="flex items-center justify-between gap-2 text-xs font-medium"
                        >
                          <span>{{ t("composer.pageSettings.noLayout") }}</span>
                          <span
                            v-if="!currentLayoutId"
                            :class="[studioIcons.checkCircleBold, 'size-4 text-primary']"
                          />
                        </span>
                        <span
                          class="mt-1 block text-[11px] leading-4 text-foreground/45"
                        >
                          {{ t("composer.pageSettings.renderDirectly") }}
                        </span>
                      </span>
                    </button>

                    <button
                      v-for="layout in availableLayouts"
                      :key="layout.id"
                      type="button"
                      @click="handleLayoutChange(layout.id)"
                      :class="[
                        'flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                        currentLayoutId === layout.id
                          ? 'bg-secondary text-foreground'
                          : 'text-foreground/72 hover:bg-muted/25',
                      ]"
                    >
                      <span
                        class="mt-0.5 flex size-7 items-center justify-center rounded-md border border-border/50 bg-background text-foreground/65"
                      >
                        <span :class="[studioIcons.windowFrame, 'size-3.5']" />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span
                          class="flex items-center justify-between gap-2 text-xs font-medium"
                        >
                          <span class="truncate">{{
                            layout.name || layout.id
                          }}</span>
                          <span
                            v-if="currentLayoutId === layout.id"
                            :class="[studioIcons.checkCircleBold, 'size-4 text-primary']"
                          />
                        </span>
                        <span
                          class="mt-1 block line-clamp-2 text-[11px] leading-4 text-foreground/45"
                        >
                          {{ layout.description || t("composer.pageSettings.layoutFallback") }}
                        </span>
                      </span>
                    </button>

                    <div
                      v-if="availableLayouts.length === 0"
                      class="rounded-md px-3 py-4 text-center text-xs text-foreground/45"
                    >
                      {{ t("composer.pageSettings.noLayouts") }}
                    </div>
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>

            <p class="text-xs leading-5 text-foreground/45">
              {{ t("composer.pageSettings.layoutAppliesImmediately") }}
            </p>
          </div>
        </div>
      </section>

      <template v-if="showMetadataSections">
        <section
          class="overflow-hidden rounded-xl border border-border/50 bg-background/70 shadow-sm"
        >
          <div
            class="grid gap-4 px-4 py-4 md:px-5 lg:grid-cols-[minmax(0,1fr)_220px]"
          >
            <div class="space-y-4">
              <div class="space-y-2">
                <div class="flex items-center justify-between gap-3">
                  <label class="text-sm font-medium text-foreground">
                    {{ t("pages.overview.titlePlaceholder") }}
                  </label>
                  <span class="text-2xs text-foreground/35">
                    {{ t("composer.pageSettings.internalName") }}
                  </span>
                </div>
                <Input
                  v-model="title"
                  :placeholder="t('pages.overview.titlePlaceholder')"
                  class="h-10 rounded-md border border-border/50 bg-background/80"
                />
              </div>

              <div class="space-y-2">
                <div class="flex items-center justify-between gap-3">
                  <label class="text-sm font-medium text-foreground">
                    {{ t("pages.seo.searchTitle") }}
                  </label>
                  <span
                    class="text-2xs"
                    :class="
                      searchTitleLength > 60
                        ? 'text-amber-600'
                        : 'text-foreground/35'
                    "
                  >
                    {{ searchTitleLength }}/60
                  </span>
                </div>
                <Input
                  v-model="seoTitle"
                  :placeholder="t('composer.pageSettings.metaTitle')"
                  class="h-10 rounded-md border border-border/50 bg-background/80"
                />
              </div>

              <div class="space-y-2">
                <div class="flex items-center justify-between gap-3">
                  <label class="text-sm font-medium text-foreground">
                    {{ t("pages.seo.searchDescription") }}
                  </label>
                  <span
                    class="text-2xs"
                    :class="
                      searchDescriptionLength > 160
                        ? 'text-amber-600'
                        : 'text-foreground/35'
                    "
                  >
                    {{ searchDescriptionLength }}/160
                  </span>
                </div>
                <Textarea
                  v-model="seoDescription"
                  rows="4"
                  :placeholder="t('composer.pageSettings.searchDescriptionPlaceholder')"
                  class="rounded-md border border-border/50 bg-background/80"
                />
              </div>

              <div class="space-y-2">
                <label class="text-sm font-medium text-foreground">
                  {{ t("pages.seo.canonical") }}
                </label>
                <Input
                  v-model="canonical"
                  placeholder="https://example.com/page"
                  class="h-10 rounded-md border border-border/50 bg-background/80"
                />
              </div>
            </div>

            <div
              class="space-y-3 rounded-lg border border-dashed border-border/50 bg-sidebar/35 p-4"
            >
              <div>
                <p
                  class="text-[11px] uppercase tracking-[0.14em] text-foreground/35"
                >
                  {{ t("composer.pageSettings.route") }}
                </p>
                <p class="mt-2 font-mono text-sm text-foreground">
                  {{ pagePath }}
                </p>
              </div>

              <div>
                <p
                  class="text-[11px] uppercase tracking-[0.14em] text-foreground/35"
                >
                  {{ t("pages.layout") }}
                </p>
                <p class="mt-2 text-sm text-foreground">
                  {{ selectedLayoutName }}
                </p>
              </div>

              <div>
                <p
                  class="text-[11px] uppercase tracking-[0.14em] text-foreground/35"
                >
                  {{ t("composer.pageSettings.robots") }}
                </p>
                <p class="mt-2 text-sm text-foreground">
                  {{ robotsPreview }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <Collapsible
          v-model:open="isRoutingAccessOpen"
          class="overflow-hidden rounded-xl border border-border/50 bg-background/70 shadow-sm"
        >
          <CollapsibleTrigger as-child>
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left md:px-5"
            >
              <div>
                <p class="text-sm font-medium text-foreground">
                  {{ t("composer.pageSettings.routingAccess") }}
                </p>
                <p class="text-xs text-foreground/45">
                  {{ t("composer.pageSettings.routingAccessDescription") }}
                </p>
              </div>

              <div class="flex items-center gap-3">
                <span class="text-xs text-foreground/35">
                  {{ isLoadingPolicy ? t("common.loading") : accessMode }}
                </span>
                <span
                  aria-hidden="true"
                  :class="[
                    [studioIcons.chevronDown, 'size-4 text-foreground/40 transition-transform'],
                    isRoutingAccessOpen ? 'rotate-180' : '',
                  ]"
                />
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div
              class="grid gap-4 border-t border-dashed border-border/50 px-4 py-4 md:px-5 lg:grid-cols-[minmax(0,1fr)_260px]"
            >
              <div
                v-if="isLoadingPolicy"
                class="rounded-lg border border-dashed border-border/50 bg-background/50 px-4 py-6 text-sm text-foreground/55"
              >
                {{ t("composer.pageSettings.loadingAccess") }}
              </div>

              <template v-else>
                <div class="space-y-4">
                  <div class="grid gap-4 md:grid-cols-2">
                    <div class="space-y-2">
                      <label class="text-sm font-medium text-foreground">
                        {{ t("composer.pageSettings.role") }}
                      </label>
                      <select
                        v-model="systemRole"
                        class="h-10 w-full rounded-md border border-border/50 bg-background/80 px-3 text-sm text-foreground"
                      >
                        <option value="standard">{{ t("composer.pageSettings.standardPage") }}</option>
                        <option value="not-found">{{ t("composer.pageSettings.notFoundOwner") }}</option>
                      </select>
                      <p class="text-xs leading-5 text-foreground/45">
                        {{ t("composer.pageSettings.notFoundRoleHelp") }}
                      </p>
                    </div>

                    <div class="space-y-2">
                      <label class="text-sm font-medium text-foreground">
                        {{ t("composer.pageSettings.publicAccess") }}
                      </label>
                      <select
                        v-model="accessMode"
                        :disabled="isNotFoundRole"
                        class="h-10 w-full rounded-md border border-border/50 bg-background/80 px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="public">{{ t("pages.access.public") }}</option>
                        <option value="password">{{ t("pages.access.passwordProtected") }}</option>
                        <option value="private">{{ t("pages.access.private") }}</option>
                        <option value="unlisted">{{ t("pages.access.unlisted") }}</option>
                      </select>
                      <p class="text-xs leading-5 text-foreground/45">
                        {{
                          isNotFoundRole
                            ? t("composer.pageSettings.notFoundAlwaysPublic")
                            : accessSummary
                        }}
                      </p>
                    </div>
                  </div>

                  <div
                    v-if="isPasswordAccess"
                    class="space-y-4 rounded-lg border border-border/50 bg-background/60 p-4"
                  >
                    <div class="space-y-2">
                      <div class="flex items-center justify-between gap-3">
                        <label class="text-sm font-medium text-foreground">
                          {{ t("composer.pageSettings.pagePassword") }}
                        </label>
                        <Button
                          v-if="hasPassword"
                          size="sm"
                          type="button"
                          variant="ghost"
                          class="h-7 rounded-md px-2 text-[11px]"
                          @click="clearPassword = !clearPassword"
                        >
                          {{
                            clearPassword
                              ? t("composer.pageSettings.keepPassword")
                              : t("composer.pageSettings.resetPassword")
                          }}
                        </Button>
                      </div>

                      <Input
                        v-model="newPassword"
                        type="password"
                        :placeholder="
                          hasPassword && !clearPassword
                            ? t('composer.pageSettings.keepPasswordPlaceholder')
                            : t('composer.pageSettings.newPasswordPlaceholder')
                        "
                        class="h-10 rounded-md border border-border/50 bg-background/80"
                      />

                      <p class="text-xs leading-5 text-foreground/45">
                        {{
                          clearPassword
                            ? t("composer.pageSettings.replacePassword")
                            : hasPassword
                              ? t("composer.pageSettings.currentPasswordHelp")
                              : t("composer.pageSettings.newPasswordHelp")
                        }}
                      </p>
                    </div>

                    <div class="grid gap-4 md:grid-cols-2">
                      <div class="space-y-2">
                        <label class="text-sm font-medium text-foreground">
                          {{ t("composer.pageSettings.promptTitle") }}
                        </label>
                        <Input
                          v-model="promptTitle"
                          :placeholder="t('composer.pageSettings.promptTitle')"
                          class="h-10 rounded-md border border-border/50 bg-background/80"
                        />
                      </div>

                      <div class="space-y-2">
                        <label class="text-sm font-medium text-foreground">
                          {{ t("composer.pageSettings.rememberAccess") }}
                        </label>
                        <select
                          v-model="rememberForDays"
                          class="h-10 w-full rounded-md border border-border/50 bg-background/80 px-3 text-sm text-foreground"
                        >
                          <option value="">{{ t("pages.access.sessionOnly") }}</option>
                          <option value="1">{{ t("pages.access.oneDay") }}</option>
                          <option value="3">{{ t("pages.access.days", { days: 3 }) }}</option>
                          <option value="7">{{ t("pages.access.days", { days: 7 }) }}</option>
                          <option value="14">{{ t("pages.access.days", { days: 14 }) }}</option>
                          <option value="30">{{ t("pages.access.days", { days: 30 }) }}</option>
                        </select>
                      </div>
                    </div>

                    <div class="space-y-2">
                      <label class="text-sm font-medium text-foreground">
                        {{ t("composer.pageSettings.promptDescription") }}
                      </label>
                      <Textarea
                        v-model="promptDescription"
                        rows="3"
                        :placeholder="t('composer.pageSettings.passwordPromptPlaceholder')"
                        class="rounded-md border border-border/50 bg-background/80"
                      />
                    </div>
                  </div>

                  <div
                    v-if="policyError"
                    class="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-3 text-xs text-destructive"
                  >
                    {{ policyError }}
                  </div>
                </div>

                <div
                  class="space-y-3 rounded-lg border border-dashed border-border/50 bg-sidebar/35 p-4"
                >
                  <div>
                    <p
                      class="text-[11px] uppercase tracking-[0.14em] text-foreground/35"
                    >
                      {{ t("composer.pageSettings.effectiveRole") }}
                    </p>
                    <p class="mt-2 text-sm font-medium text-foreground">
                      {{ isNotFoundRole ? t("composer.pageSettings.notFoundOwner") : t("composer.pageSettings.standardPage") }}
                    </p>
                  </div>

                  <div>
                    <p
                      class="text-[11px] uppercase tracking-[0.14em] text-foreground/35"
                    >
                      {{ t("composer.pageSettings.effectiveAccess") }}
                    </p>
                    <p class="mt-2 text-sm text-foreground">
                      {{ isNotFoundRole ? t("pages.access.public") : accessMode }}
                    </p>
                  </div>

                  <div>
                    <p
                      class="text-[11px] uppercase tracking-[0.14em] text-foreground/35"
                    >
                      {{ t("composer.pageSettings.passwordGrant") }}
                    </p>
                    <p class="mt-2 text-sm text-foreground">
                      {{
                        isPasswordAccess
                          ? rememberForDaysSummary
                          : t("composer.pageSettings.notApplicable")
                      }}
                    </p>
                  </div>

                  <p class="text-xs leading-5 text-foreground/45">
                    {{ accessSummary }}
                  </p>
                </div>
              </template>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible
          v-model:open="isSocialOpen"
          class="overflow-hidden rounded-xl border border-border/50 bg-background/70 shadow-sm"
        >
          <CollapsibleTrigger as-child>
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left md:px-5"
            >
              <div>
                <p class="text-sm font-medium text-foreground">{{ t("pages.seo.social") }}</p>
                <p class="text-xs text-foreground/45">
                  {{ t("composer.pageSettings.socialDescription") }}
                </p>
              </div>

              <div class="flex items-center gap-3">
                <span class="text-xs text-foreground/35">
                  {{ hasSocialOverrides ? t("composer.pageSettings.configured") : t("composer.pageSettings.optional") }}
                </span>
                <span
                  aria-hidden="true"
                  :class="[
                    [studioIcons.chevronDown, 'size-4 text-foreground/40 transition-transform'],
                    isSocialOpen ? 'rotate-180' : '',
                  ]"
                />
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div
              class="grid gap-4 border-t border-dashed border-border/50 px-4 py-4 md:px-5 lg:grid-cols-[minmax(0,1fr)_240px]"
            >
              <div class="space-y-4">
                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-3">
                    <label class="text-sm font-medium text-foreground">
                      {{ t("pages.seo.ogImage") }}
                    </label>
                    <Button
                      v-if="socialImagePreview"
                      size="sm"
                      type="button"
                      variant="ghost"
                      class="h-7 rounded-md px-2 text-[11px]"
                      @click="ogImage = ''"
                    >
                      {{ t("common.clear") }}
                    </Button>
                  </div>

                  <div class="flex gap-2">
                    <Input
                      v-model="ogImage"
                      placeholder="/uploads/image.png"
                      class="h-10 flex-1 rounded-md border border-border/50 bg-background/80"
                    />
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      class="h-10 rounded-md border-border/50 bg-background/80 px-3.5"
                      @click="isMediaPickerOpen = true"
                    >
                      {{ t("pages.seo.selectOgImage") }}
                    </Button>
                  </div>
                </div>

                <div class="space-y-2">
                  <label class="text-sm font-medium text-foreground">
                    {{ t("pages.seo.ogTitle") }}
                  </label>
                  <Input
                    v-model="ogTitle"
                    :placeholder="t('pages.seo.openGraphTitle')"
                    class="h-10 rounded-md border border-border/50 bg-background/80"
                  />
                </div>

                <div class="space-y-2">
                  <label class="text-sm font-medium text-foreground">
                    {{ t("pages.seo.ogDescription") }}
                  </label>
                  <Textarea
                    v-model="ogDescription"
                    rows="4"
                    :placeholder="t('pages.seo.openGraphDescription')"
                    class="rounded-md border border-border/50 bg-background/80"
                  />
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <div class="space-y-2">
                    <label class="text-sm font-medium text-foreground">
                    {{ t("composer.pageSettings.twitterCard") }}
                    </label>
                    <Select v-model="twitterCardSelectValue">
                      <SelectTrigger
                        class="h-10 rounded-md border border-border/50 bg-background/80"
                      >
                        <SelectValue :placeholder="t('composer.pageSettings.useDefault')" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem :value="TWITTER_CARD_SELECT_EMPTY_VALUE">
                          {{ t("composer.pageSettings.useDefault") }}
                        </SelectItem>
                        <SelectItem
                          v-for="card in ALLOWED_TWITTER_CARDS"
                          :key="card"
                          :value="card"
                        >
                          {{ card }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div class="space-y-2">
                    <label class="text-sm font-medium text-foreground">
                    {{ t("composer.pageSettings.ogType") }}
                    </label>
                    <Input
                      v-model="ogType"
                      placeholder="website"
                      class="h-10 rounded-md border border-border/50 bg-background/80"
                    />
                  </div>
                </div>
              </div>

              <div
                class="space-y-3 rounded-lg border border-dashed border-border/50 bg-sidebar/35 p-4"
              >
                <div>
                  <p
                    class="text-[11px] uppercase tracking-[0.14em] text-foreground/35"
                  >
                    {{ t("composer.pageSettings.previewTitle") }}
                  </p>
                  <p class="mt-2 text-sm font-medium text-foreground">
                    {{ socialTitlePreview }}
                  </p>
                </div>

                <div>
                  <p
                    class="text-[11px] uppercase tracking-[0.14em] text-foreground/35"
                  >
                    {{ t("composer.pageSettings.previewDescription") }}
                  </p>
                  <p class="mt-2 text-xs leading-5 text-foreground/55">
                    {{ socialDescriptionPreview }}
                  </p>
                </div>

                <div>
                  <p
                    class="text-[11px] uppercase tracking-[0.14em] text-foreground/35"
                  >
                    {{ t("composer.pageSettings.previewImage") }}
                  </p>
                  <p class="mt-2 text-sm text-foreground">
                    {{ socialImagePreview ? t("composer.pageSettings.selected") : t("composer.pageSettings.notSet") }}
                  </p>
                </div>

                <div class="flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    size="sm"
                    class="border-border/50 bg-background/60"
                  >
                    {{ twitterCardPreview }}
                  </Badge>
                  <Badge
                    variant="outline"
                    size="sm"
                    class="border-border/50 bg-background/60"
                  >
                    {{ previewDomain }}
                  </Badge>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible
          v-model:open="isAdvancedOpen"
          class="overflow-hidden rounded-xl border border-border/50 bg-background/70 shadow-sm"
        >
          <CollapsibleTrigger as-child>
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left md:px-5"
            >
              <div>
                <p class="text-sm font-medium text-foreground">{{ t("pages.seo.advanced") }}</p>
                <p class="text-xs text-foreground/45">
                  {{ t("composer.pageSettings.advancedDescription") }}
                </p>
              </div>

              <div class="flex items-center gap-3">
                <span class="text-xs text-foreground/35">
                  {{ hasAdvancedOverrides ? t("composer.pageSettings.configured") : t("composer.pageSettings.optional") }}
                </span>
                <span
                  aria-hidden="true"
                  :class="[
                    [studioIcons.chevronDown, 'size-4 text-foreground/40 transition-transform'],
                    isAdvancedOpen ? 'rotate-180' : '',
                  ]"
                />
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div
              class="grid gap-4 border-t border-dashed border-border/50 px-4 py-4 md:px-5 lg:grid-cols-[minmax(0,1fr)_280px]"
            >
              <div class="space-y-4">
                <div class="space-y-2">
                  <label class="text-sm font-medium text-foreground">
                    {{ t("composer.pageSettings.keywords") }}
                  </label>
                  <Input
                    v-model="keywords"
                    placeholder="keyword1, keyword2"
                    class="h-10 rounded-md border border-border/50 bg-background/80"
                  />
                </div>

                <div class="space-y-2">
                  <label class="text-sm font-medium text-foreground">
                    {{ t("pages.seo.structuredData") }}
                  </label>
                  <Textarea
                    v-model="structuredData"
                    rows="8"
                    placeholder='{"@context":"https://schema.org","@type":"WebPage"}'
                    class="rounded-md border border-border/50 bg-background/80 font-mono text-xs"
                  />
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <div class="space-y-2">
                    <label class="text-sm font-medium text-foreground">
                    {{ t("composer.pageSettings.twitterSite") }}
                    </label>
                    <Input
                      v-model="twitterSite"
                      placeholder="@yourbrand"
                      class="h-10 rounded-md border border-border/50 bg-background/80"
                    />
                  </div>

                  <div class="space-y-2">
                    <label class="text-sm font-medium text-foreground">
                    {{ t("composer.pageSettings.twitterCreator") }}
                    </label>
                    <Input
                      v-model="twitterCreator"
                      placeholder="@author"
                      class="h-10 rounded-md border border-border/50 bg-background/80"
                    />
                  </div>
                </div>
              </div>

              <div class="space-y-3">
                <div
                  class="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-background/70 px-4 py-3"
                >
                  <div class="space-y-1">
                    <p class="text-sm font-medium text-foreground">{{ t("pages.seo.noIndex") }}</p>
                    <p class="text-xs text-foreground/45">
                      {{ t("composer.pageSettings.noIndexHelp") }}
                    </p>
                  </div>
                  <Switch
                    :checked="noIndex"
                    @update:checked="(value: boolean) => (noIndex = value)"
                  />
                </div>

                <div
                  class="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-background/70 px-4 py-3"
                >
                  <div class="space-y-1">
                    <p class="text-sm font-medium text-foreground">{{ t("pages.seo.noFollow") }}</p>
                    <p class="text-xs text-foreground/45">
                      {{ t("composer.pageSettings.noFollowHelp") }}
                    </p>
                  </div>
                  <Switch
                    :checked="noFollow"
                    @update:checked="(value: boolean) => (noFollow = value)"
                  />
                </div>

                <div
                  class="rounded-lg border border-dashed border-border/50 bg-sidebar/35 p-4"
                >
                  <p
                    class="text-[11px] uppercase tracking-[0.14em] text-foreground/35"
                  >
                    {{ t("composer.pageSettings.effectiveRobots") }}
                  </p>
                  <p class="mt-2 text-sm font-medium text-foreground">
                    {{ robotsPreview }}
                  </p>
                  <p class="mt-2 text-xs text-foreground/45">
                    {{
                      structuredData.trim()
                        ? t("composer.pageSettings.structuredDataConfigured")
                        : t("composer.pageSettings.noStructuredData")
                    }}
                  </p>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <section
          v-if="showSaveSection"
          class="rounded-xl border border-border/50 bg-background/70 px-4 py-4 shadow-sm md:px-5"
        >
          <div
            class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
          >
            <div class="min-w-0">
              <div
                class="text-xs font-medium uppercase tracking-[0.16em] text-foreground/35"
              >
                Save page settings
              </div>
              <div v-if="combinedError" class="mt-2 text-xs text-destructive">
                {{ combinedError }}
              </div>
            </div>

            <Button
              size="sm"
              class="h-10 rounded-[18px] px-5"
              :disabled="!canSaveMetadata"
              @click="handleSave"
            >
              {{ isSaving ? t("common.saving") : t("composer.pageSettings.saveAction") }}
            </Button>
          </div>
        </section>
      </template>
    </template>

    <MediaPickerDialog
      v-model:open="isMediaPickerOpen"
      :title="t('pages.seo.ogImageDialogTitle')"
      :description="t('pages.seo.ogImageDialogDescription')"
      media-type="image"
      @select="handleOgImageSelect"
    />
  </div>
</template>
