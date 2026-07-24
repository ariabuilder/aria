<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onMounted,
  onActivated,
  onUnmounted,
  nextTick,
} from "vue";
import { useRoute } from "vue-router";
import { useForm } from "vee-validate";
import { z } from "zod";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Breadcrumbs,
  ComposerButton,
  DeleteConfirmDialog,
  PageHeader,
} from "@/features/Studio/core/components";
import PagePublishSplitButton from "@/features/Publishing/components/PagePublishSplitButton.vue";
import PagePublishOverflowMenu from "@/features/Publishing/components/PagePublishOverflowMenu.vue";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import {
  buildContentPreviewUrl,
  getPreviewDisabledReason,
} from "@/features/Publishing/lib/buildContentPreviewUrl";
import { formatScheduleDisplay } from "@/features/Publishing/composables/useSchedulePublish";
import PageSnapshotPreviewFrame from "./components/PagePreviewFrame.vue";
import PageCoverImage from "./components/PageCoverImage.vue";
import {
  PageStructureList,
  PageOgImageCard,
  SeoPreviewCard,
  SocialPreviewCard,
} from "./components";
import ActivityTimeline from "@/features/Core/components/ActivityTimeline.vue";
import PageDetailOverviewTab from "./components/detail/PageDetailOverviewTab.vue";
import PageDetailTypeTab from "./components/detail/PageDetailTypeTab.vue";
import PageDetailSeoTab from "./components/detail/PageDetailSeoTab.vue";
import PageDetailAccessTab from "./components/detail/PageDetailAccessTab.vue";
import PageDetailMediaTab from "./components/detail/PageDetailMediaTab.vue";
import PageDetailLocalizationTab from "./components/detail/PageDetailLocalizationTab.vue";
import PreviewMediaDialog from "@/features/Studio/media/dialogs/PreviewMediaDialog.vue";
import {
  setPageDetailRemoteLoadMerge,
  usePageDetailState,
} from "./composables/usePageDetailState";
import { usePageDeleteWithRoutingGuard } from "./composables/usePageDeleteWithRoutingGuard";
import PageDeleteRoutingBlockedDialog from "./dialogs/PageDeleteRoutingBlockedDialog.vue";
import { useBuilderData } from "@/composables/useBuilderData";
import type { Page } from "@/composables/useBuilderData";
import { useStudioRouter } from "@/features/Studio/core/composables";
import { useDialogState } from "@/features/Studio/core/composables";
import { useStudioActions } from "@/features/Studio/composer/composables/useStudioActions";
import { useStudioCrudHistory } from "@/features/Studio/composer/composables/useStudioCrudHistory";
import { unwrapStudioCrudActionResult } from "@/features/Studio/composer/composables/studioCrudActionResults";
import { markPageThumbnailStale } from "./composables/pageThumbnailInvalidation";
import { usePageActions } from "./composables/usePageActions";
import { PageDSLSchema } from "@/lib/schemas/nodes";
import { isJsonObject, type JsonObject } from "@/lib/types/nodes";
import type { SectionInfo } from "./components";
import { studioIcons } from "@/lib/icons";
import { usePageSeo } from "./composables/usePageSeo";
import { useDebouncedPageSeoSave } from "./composables/useDebouncedPageSeoSave";
import type { SeoFieldValues } from "./composables/useSeoState";
import { usePageRevert } from "./composables/usePageRevert";
import { usePageActivity } from "./composables/usePageActivity";
import { buildPageActivityItems } from "./lib/pageActivity";
import { usePageDetailTabs } from "./composables/usePageDetailTabs";
import { usePageDetailMedia } from "./composables/usePageDetailMedia";
import {
  toMediaAssetForPreview,
  type PageMediaDisplayItem,
} from "@/lib/schemas/pageMedia";
import { usePageAccessState } from "./composables/usePageAccessState";
import { usePageCmsTemplateAssignments } from "./composables/usePageCmsTemplateAssignments";
import {
  PageDetailFormSchema,
  PAGE_DETAIL_FORM_INITIAL,
} from "./schemas/pageDetailForm";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import { useCanonicalBreakpoints } from "@/composables/useCanonicalBreakpoints";
import { getBreakpointIconClass } from "@/composables/breakpointIcons";
import { useSlugChangeRedirect } from "@/features/Studio/settings/composables/useSlugChangeRedirect";
import { useCapabilities } from "@/composables/useCapabilities";
import { resolvePublicPagePath } from "@/lib/pages/publicPaths";
import { formatRelativeTime } from "@/features/Core/utils/formatting";
import { updatePageLayout } from "./utils/updatePageLayout";
import { resolvePagePreviewStage } from "./composables/resolvePagePreviewStage";
import { AGENT_PAGE_SEO_UPDATED_EVENT } from "@/features/Agent/lib/constants";
import { STATUS_SURFACE } from "@/lib/statusTokens";
import { usePageResourceBank } from "./composables/usePageResourceBank";
import { dispatchCmsPageUsageUpdated } from "./lib/cmsPageUsageEvents";
import { applySectionLabel } from "./lib/sectionLabel";
import { useStudioI18n } from "@/i18n";
import StudioPresenceNotice from "@/features/Studio/realtime/StudioPresenceNotice.vue";
import { useStudioLive } from "@/features/Studio/realtime/useStudioLive";

const route = useRoute();
const router = useStudioRouter();
const { t } = useStudioI18n();
const { pages, layouts, refreshPages, refreshPagesNow } = useBuilderData();
const pageActions = usePageActions();
const pageResourceBank = usePageResourceBank();
const studioCrud = useStudioActions();
const { executeStudioOperation } = useStudioCrudHistory();
const studioLive = useStudioLive();

const pageSlug = computed(() => route.params.slug as string);

watch(
  pages,
  (nextPages) => {
    pageResourceBank.seedInventory(nextPages);
  },
  { immediate: true },
);

const {
  canEditInComposer,
  canEditPageSeo,
  canManagePagePolicy,
  canEditPageStructure,
  canRevertPageVersion,
  canDeletePageVersion,
  canPublish,
  canUnpublish,
  canArchive,
  canUnarchive,
  canSchedule,
  canDeletePage,
  getForbiddenMessage,
} = useStudioCapabilities();

const { hasCapability, canOperation } = useCapabilities();
const { offerRedirectAfterSlugChange } = useSlugChangeRedirect();

const isSaving = ref(false);
const isPublishing = ref(false);
const isPageStructureSaving = ref(false);
const previewRefreshToken = ref<string | null>(null);
const deleteDialog = useDialogState();
const versionDeleteDialog = useDialogState();
const pageToDelete = ref<string | null>(null);
const versionPendingDelete = ref<{
  versionId: string;
  displayVersion: number;
} | null>(null);

const pageDetailState = usePageDetailState();
const {
  page: composablePage,
  isLoading,
  isLoaded,
  currentError,
  clearError,
  analytics,
  loadPage: composableLoadPage,
} = pageDetailState;

// Re-export composable page as 'page' for template convenience
// (vee-validate owns title/slug/status for the form tabs)
const page = composablePage;

const {
  blockedDialogOpen,
  blockedImpact,
  blockedMessagePageLabel,
  canUnbindCollections,
  isUnbinding,
  deletePageWithGuard,
  confirmUnbindAndDelete,
  cancelBlockedDelete,
} = usePageDeleteWithRoutingGuard({
  deletePage: studioCrud.deletePage,
  resolvePageId: (slug) => {
    if (page.value?.slug === slug) {
      return page.value.id;
    }
    return pages.value.find((entry) => entry.slug === slug)?.id;
  },
  onDeleted: async () => {
    await refreshPagesNow();
  },
});

const pageEditorName = computed(() => {
  const author = page.value?.author;
  if (author?.name?.trim()) {
    return author.name.trim();
  }
  if (author?.id) {
    return author.id;
  }
  return "";
});

const pageLastEdited = computed(() => {
  const updatedAt = page.value?.updatedAt;
  if (!updatedAt) {
    return "";
  }
  return formatRelativeTime(updatedAt);
});

const isEditingTitle = ref(false);
const editingTitle = ref("");
const titleInputRef = ref<HTMLInputElement | null>(null);

function startTitleEdit(): void {
  editingTitle.value = title.value || page.value?.title || "";
  isEditingTitle.value = true;
  nextTick(() => {
    titleInputRef.value?.focus();
    titleInputRef.value?.select();
  });
}

function confirmTitleEdit(): void {
  const trimmed = editingTitle.value.trim();
  if (trimmed) {
    title.value = trimmed;
  }
  isEditingTitle.value = false;
}

function cancelTitleEdit(): void {
  isEditingTitle.value = false;
}

const resolvedPagePath = computed(() => {
  const s = page.value?.slug;
  if (!s) return "";
  return resolvePublicPagePath(s, pages.value);
});

const sections = computed<SectionInfo[]>(() => {
  const p = page.value;
  if (!p?.nodes) return [];
  return p.nodes.map((node, index) => ({
    id: node.id,
    name: node.metadata?.label ?? node.type,
    type: node.type,
    isVisible: node.metadata?.hidden !== true,
    order: node.metadata?.order ?? index,
  }));
});

const seoScoreValue = computed(() => {
  const p = page.value;
  const hasTitle = !!p?.settings?.seo?.title;
  const hasDesc = !!p?.settings?.seo?.description;
  let score = 0;
  if (hasTitle) score += 50;
  if (hasDesc) score += 30;
  if (p?.settings?.seo?.ogImage) score += 20;
  return score;
});

const seoState = usePageSeo(pageDetailState);
const {
  updateField: updateSeoField,
  googlePreview,
  recommendations,
  agentSeoContext,
} = seoState;

const seoNoindex = computed({
  get: () => page.value?.settings?.seo?.noindex ?? false,
  set: (value: boolean) => handleSeoFieldUpdate("noindex", value),
});

const seoNofollow = computed({
  get: () => page.value?.settings?.seo?.nofollow ?? false,
  set: (value: boolean) => handleSeoFieldUpdate("nofollow", value),
});

const seoMetaTitle = computed({
  get: () => page.value?.settings?.seo?.title ?? "",
  set: (value: string) => handleSeoFieldUpdate("title", value),
});

const seoMetaDescription = computed({
  get: () => page.value?.settings?.seo?.description ?? "",
  set: (value: string) => handleSeoFieldUpdate("description", value),
});

const seoOgTitle = computed({
  get: () => page.value?.settings?.seo?.ogTitle ?? "",
  set: (value: string) => handleSeoFieldUpdate("ogTitle", value),
});

const seoOgDescription = computed({
  get: () => page.value?.settings?.seo?.ogDescription ?? "",
  set: (value: string) => handleSeoFieldUpdate("ogDescription", value),
});

const seoOgImage = computed({
  get: () => page.value?.settings?.seo?.ogImage ?? "",
  set: (value: string) => handleSeoFieldUpdate("ogImage", value),
});

const seoCanonical = computed({
  get: () => page.value?.settings?.seo?.canonical ?? "",
  set: (value: string) => handleSeoFieldUpdate("canonical", value),
});

const debouncedSeoSave = useDebouncedPageSeoSave({
  slug: pageSlug,
  getSeo: () => page.value?.settings?.seo,
  canSave: canEditPageSeo,
  onSaved: (savedSeo) => {
    const current = page.value;
    if (!current) return;
    page.value = {
      ...current,
      settings: {
        ...(current.settings ?? {}),
        seo: savedSeo,
      },
    };
    debouncedSeoSave.markSaved(savedSeo);

    const slug = pageSlug.value.trim();
    if (slug) {
      pageResourceBank.updateCachedPage(slug, (entry) => ({
        ...entry,
        page: {
          ...entry.page,
          settings: {
            ...(entry.page.settings ?? {}),
            seo: savedSeo,
          },
        },
      }));
    }
  },
});

function handleSeoFieldUpdate<K extends keyof SeoFieldValues>(
  field: K,
  value: SeoFieldValues[K],
): void {
  updateSeoField(field, value);
  debouncedSeoSave.scheduleSave();
}

const {
  versions,
  protectedVersions,
  isLoading: isHistoryLoading,
  isReverting,
  isDeleting: isDeletingVersion,
  loadVersions,
  revertToVersion,
  deleteVersion,
} = usePageRevert();

const {
  media: pageMedia,
  displayItems: pageMediaDisplayItems,
  isLoading: isPageMediaLoading,
  hasLoadedForSlug: hasLoadedPageMedia,
  loadPageMedia,
  reset: resetPageMedia,
} = usePageDetailMedia();

const isPageMediaPreviewOpen = ref(false);
const pageMediaPreviewItem = ref<PageMediaDisplayItem | null>(null);

const pageMediaPreviewAsset = computed(() => {
  if (!pageMediaPreviewItem.value) {
    return null;
  }
  return toMediaAssetForPreview(pageMediaPreviewItem.value);
});

function openPageMediaPreview(item: PageMediaDisplayItem): void {
  pageMediaPreviewItem.value = item;
  isPageMediaPreviewOpen.value = true;
}

function closePageMediaPreview(): void {
  isPageMediaPreviewOpen.value = false;
  pageMediaPreviewItem.value = null;
}

const protectedVersionList = computed(() => [...protectedVersions.value]);

const pageActivity = usePageActivity();

const pageActivitySourceItems = computed(() => pageActivity.activities.value);

const pageActivityItems = computed(() =>
  buildPageActivityItems({
    items: pageActivitySourceItems.value,
    protectedVersions: protectedVersionList.value,
    canRestore: canRevertPageVersion.value,
    canDelete: canDeletePageVersion.value,
  }),
);

async function loadPageSidebarData(slug: string): Promise<void> {
  await Promise.all([pageActivity.loadActivity(slug), loadVersions(slug)]);
}

const versionDeleteDialogTitle = computed(() => {
  const displayVersion = versionPendingDelete.value?.displayVersion;
  return displayVersion
    ? t("pages.history.deleteRevisionTitle", { version: displayVersion })
    : t("pages.history.deleteRevisionTitleGeneric");
});

const versionDeleteDialogDescription = computed(() => {
  const displayVersion = versionPendingDelete.value?.displayVersion;
  const label = displayVersion
    ? t("pages.history.revisionLabel", { version: displayVersion })
    : t("pages.history.thisRevision");
  return t("pages.history.deleteRevisionDescription", { revision: label });
});

const {
  accessMode: pageAccessMode,
  password: pageAccessPassword,
  promptTitle: pageAccessPromptTitle,
  promptDescription: pageAccessPromptDescription,
  rememberDays: pageAccessRememberDays,
  systemRole: pageAccessSystemRole,
  isPolicyDirty: isPageAccessPolicyDirty,
  isNotFoundRole: isPageNotFoundRole,
  isCmsCollectionRole: isPageCmsCollectionRole,
  isCmsEntryRole: isPageCmsEntryRole,
  isLoading: isPageAccessLoading,
  isSaving: isPageAccessSaving,
  error: pageAccessError,
  clearedAssignments: pageAccessClearedAssignments,
  loadPolicy: loadPageAccessPolicy,
  applyPolicy: applyPageAccessPolicy,
  savePolicy: savePageAccessPolicy,
} = usePageAccessState();

const confirmNotFoundDialogOpen = ref(false);
const pendingNotFoundSave = ref(false);
const hasConfirmedNotFoundOverride = ref(false);
const isPageTypeAssignmentSyncing = ref(false);

const existingNotFoundPage = computed(() => {
  const currentPageId = page.value?.id;
  if (!currentPageId) {
    return null;
  }

  return (
    pages.value.find(
      (entry) => entry.systemRole === "not-found" && entry.id !== currentPageId,
    ) ?? null
  );
});

const isSavedNotFoundPage = computed(
  () =>
    pageAccessSystemRole.value === "not-found" &&
    !isPageAccessPolicyDirty.value &&
    !isPageAccessLoading.value,
);

const pageIdRef = computed(() => page.value?.id);
const isSavedCmsCollectionPage = computed(
  () =>
    pageAccessSystemRole.value === "cms-collection" &&
    !isPageAccessPolicyDirty.value &&
    !isPageAccessLoading.value,
);
const isSavedCmsEntryPage = computed(
  () =>
    pageAccessSystemRole.value === "cms-entry" &&
    !isPageAccessPolicyDirty.value &&
    !isPageAccessLoading.value,
);
const cmsTemplateAssignmentSlot = computed<"list" | "template">(() => {
  if (pageAccessSystemRole.value === "cms-collection") return "list";
  if (pageAccessSystemRole.value === "cms-entry") return "template";
  return isSavedCmsCollectionPage.value ? "list" : "template";
});
const cmsTemplateAssignments = usePageCmsTemplateAssignments({
  pageId: pageIdRef,
  slot: cmsTemplateAssignmentSlot,
  pendingSystemRole: pageAccessSystemRole,
});

const hasAssignedTemplateCollections = computed(
  () => cmsTemplateAssignments.assignedCollections.value.length > 0,
);
const pendingCmsAssignmentClears = computed(
  () => cmsTemplateAssignments.pendingAssignmentClears.value,
);
const pageAssignmentOptions = computed(() =>
  pages.value.map((entry) => ({
    id: entry.id,
    label: entry.title || entry.slug,
  })),
);

const { activeTab, visibleTabs: visibleDetailTabs } = usePageDetailTabs({
  canEditPageSeo,
  canManagePagePolicy,
  onTabActivated: async (tab) => {
    if (tab === "seo") {
      await debouncedSeoSave.flushSave();
      debouncedSeoSave.markSaved(page.value?.settings?.seo);
    }
    if ((tab === "type" || tab === "access") && pageSlug.value) {
      await refreshPagesNow();
      await loadPageAccessPolicy(pageSlug.value);
    }
    if (tab === "media" && page.value?.slug) {
      await loadPageMedia(page.value.slug);
    }
  },
});

watch(activeTab, async (tab, previousTab) => {
  if (previousTab === "seo" && tab !== "seo") {
    await debouncedSeoSave.flushSave();
  }
});

onUnmounted(() => {
  setPageDetailRemoteLoadMerge(null);
  void debouncedSeoSave.flushSave();
  window.removeEventListener(
    AGENT_PAGE_SEO_UPDATED_EVENT,
    handleAgentPageSeoUpdated,
  );
});

type FormValues = z.infer<typeof PageDetailFormSchema>;

const { handleSubmit, defineField, values, setValues } = useForm<FormValues>({
  validationSchema: (vals: unknown) => {
    const result = PageDetailFormSchema.safeParse(vals);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = issue.message;
      }
      return fieldErrors;
    }
    return true;
  },
  initialValues: PAGE_DETAIL_FORM_INITIAL,
});

const [title] = defineField("title");
const [slug] = defineField("slug");
const [description] = defineField("description");
const [layout] = defineField("layout");
const [parent] = defineField("parent");

const isDirty = ref(false);
const initialValues = ref<Record<string, unknown>>({});

function checkDirty() {
  if (!isLoaded.value) return;
  const curr = { ...values } as Record<string, unknown>;
  const init = initialValues.value as Record<string, unknown>;
  for (const key of Object.keys(curr)) {
    if (curr[key] !== init[key]) {
      isDirty.value = true;
      return;
    }
  }
  isDirty.value = false;
}

watch(() => ({ ...values }), checkDirty, { deep: true });

watch(
  () => [isLoaded.value, page.value?.slug] as const,
  async ([loaded, slug]) => {
    if (loaded && slug) {
      await loadPageSidebarData(slug);
    }
  },
  { immediate: true },
);

watch(pageSlug, async (slug, previousSlug) => {
  if (slug !== previousSlug) {
    setValues(PAGE_DETAIL_FORM_INITIAL);
    initialValues.value = {};
    isDirty.value = false;
    resetPageMedia();
    hasConfirmedNotFoundOverride.value = false;
    pendingNotFoundSave.value = false;
  }
  if (slug && slug !== previousSlug && slug !== "new") {
    await reloadPageDetail();
    applyRouteTabQuery();
  }
});

function applyRouteTabQuery(): void {
  const tab = route.query.tab;
  if (tab === "type" && canManagePagePolicy.value) {
    activeTab.value = "type";
    return;
  }
  if (tab === "seo" && canEditPageSeo.value) {
    activeTab.value = "seo";
    return;
  }
  if (tab === "access" && canManagePagePolicy.value) {
    activeTab.value = "access";
    return;
  }
  if (tab === "media" || tab === "overview" || tab === "content") {
    activeTab.value = tab;
    return;
  }
  if (tab === "history") {
    activeTab.value = "overview";
  }
}

watch(
  () => route.query.tab,
  () => {
    applyRouteTabQuery();
  },
);

const currentBuilderPage = computed<Page | undefined>(() =>
  pages.value.find((p) => p.slug === pageSlug.value),
);

const pagePresenceId = computed(
  () => page.value?.id ?? currentBuilderPage.value?.id ?? pageSlug.value,
);

watch(
  [pagePresenceId, isDirty],
  ([resourceId, dirty]) => {
    if (!resourceId) return;
    studioLive.setPresence({
      surface: "studio",
      resourceType: "page",
      resourceId,
      state: dirty ? "editing" : "viewing",
      dirty,
    });
  },
  { immediate: true },
);

const pageStatus = computed<
  "draft" | "published" | "scheduled" | "archived"
>(() => currentBuilderPage.value?.status ?? "draft");

const pageScheduledFor = computed(
  () => currentBuilderPage.value?.scheduledFor ?? null,
);

const canDuplicatePage = computed(() => canOperation("crud.duplicateItem"));

const publishDisabledReason = computed(() => {
  if (!canPublish.value) {
    return getForbiddenMessage("publishing.publish");
  }
  return null;
});

const saveTooltip = computed(() => {
  if (isSaving.value) return t("pages.detail.saving");
  if (!isDirty.value) return t("pages.detail.noChanges");
  return pageStatus.value === "published"
    ? t("pages.detail.saveChanges")
    : t("pages.detail.saveDraft");
});

const isSaveDisabled = computed(() => isSaving.value || !isDirty.value);

const previewUrl = computed(() => {
  const slug = page.value?.slug ?? pageSlug.value;
  if (!slug) return null;
  const base = buildContentPreviewUrl({
    kind: "page",
    slug,
    status: pageStatus.value,
  });
  if (!base) return null;
  const needsCmsEntryPreview =
    pageAccessSystemRole.value === "cms-entry" ||
    currentBuilderPage.value?.systemRole === "cms-entry";
  if (needsCmsEntryPreview && !base.includes("preview=1")) {
    const url = new URL(base, "https://preview.local");
    url.searchParams.set("preview", "1");
    return `${url.pathname}${url.search}`;
  }
  return base;
});

const previewDisabledReason = computed(() => {
  const slug = page.value?.slug ?? pageSlug.value;
  if (!slug) return t("pages.detail.notLoaded");
  return getPreviewDisabledReason({
    kind: "page",
    slug,
    status: pageStatus.value,
  });
});

const previewPageStatus = computed(() => {
  const builderPage = currentBuilderPage.value;
  if (!builderPage) {
    return "draft" as const;
  }
  return resolvePagePreviewStage(builderPage);
});

const statusPresentation = computed(() => {
  switch (pageStatus.value) {
    case "published":
      return {
        label: t("pages.status.published"),
        description: t("pages.detail.status.published.description"),
        dotClass: "bg-emerald-500 dark:bg-emerald-400",
        surfaceClass: STATUS_SURFACE.success,
      };
    case "archived":
      return {
        label: t("pages.status.archived"),
        description: t("pages.detail.status.archived.description"),
        dotClass: "bg-muted-foreground",
        surfaceClass: "border-border bg-muted/20 text-muted-foreground",
      };
    case "scheduled":
      return {
        label: t("pages.status.scheduled"),
        description: pageScheduledFor.value
          ? t("pages.detail.status.scheduledAt", {
              date: formatScheduleDisplay(pageScheduledFor.value),
            })
          : t("pages.detail.status.scheduled.description"),
        dotClass: "bg-sky-500 dark:bg-sky-400",
        surfaceClass: STATUS_SURFACE.info,
      };
    case "draft":
    default:
      return {
        label: t("pages.status.draft"),
        description: t("pages.detail.status.draft.description"),
        dotClass: "bg-amber-500 dark:bg-amber-400",
        surfaceClass: STATUS_SURFACE.warning,
      };
  }
});

function bumpPreviewRefreshToken(): void {
  previewRefreshToken.value = String(Date.now());
}

const previewBreakpoints = useCanonicalBreakpoints({ autoLoad: true });
const pagePreviewViewport = ref("base");
const pagePreviewViewportOptions = computed(() =>
  previewBreakpoints.activeViewports.value,
);

const orderedPagePreviewViewportOptions = computed(() => {
  const selected = pagePreviewViewportOptions.value.find(
    (option) => option.id === pagePreviewViewport.value,
  );
  const rest = pagePreviewViewportOptions.value.filter(
    (option) => option.id !== pagePreviewViewport.value,
  );
  return selected ? [selected, ...rest] : rest;
});

watch(
  pagePreviewViewportOptions,
  (options) => {
    if (options.length === 0) {
      pagePreviewViewport.value = "base";
      return;
    }

    if (!options.some((option) => option.id === pagePreviewViewport.value)) {
      pagePreviewViewport.value =
        options.find((option) => option.id === "base")?.id ?? options[0]!.id;
    }
  },
  { immediate: true },
);

onActivated(() => {
  void (async () => {
    await refreshPages();
    bumpPreviewRefreshToken();
  })();
});

function openPreview(): void {
  const reason = previewDisabledReason.value;
  if (reason) {
    toast.error(reason);
    return;
  }
  const url = previewUrl.value;
  if (!url) {
    toast.error(t("pages.detail.previewUnavailable"));
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function getPublishPayload():
  | {
      id: string;
      slug: string;
      title: string | undefined;
      layout: string | undefined;
      nodes: NonNullable<typeof page.value>["nodes"];
      settings: NonNullable<typeof page.value>["settings"];
    }
  | null {
  const builderPage = currentBuilderPage.value;
  if (!builderPage || !page.value) return null;
  return {
    id: builderPage.id,
    slug: builderPage.slug,
    title: page.value.title,
    layout: page.value.layout ?? undefined,
    nodes: page.value.nodes ?? [],
    settings: page.value.settings ?? {},
  };
}

async function refreshAfterPublishMutation(slug: string): Promise<void> {
  pageResourceBank.invalidatePage(slug);
  await refreshPagesNow();
  await composableLoadPage(slug);
  bumpPreviewRefreshToken();
  if (page.value?.id) {
    markPageThumbnailStale(page.value.id);
  }
}

async function refreshAfterAgentSeoUpdate(slug: string): Promise<void> {
  if (!slug || slug !== pageSlug.value) {
    return;
  }

  pageResourceBank.invalidatePage(slug);
  await refreshPagesNow();
  await composableLoadPage(slug);
  debouncedSeoSave.markSaved(page.value?.settings?.seo);
}

function handleAgentPageSeoUpdated(event: Event): void {
  if (!(event instanceof CustomEvent)) {
    return;
  }

  const detail = event.detail;
  if (
    typeof detail !== "object" ||
    detail === null ||
    !("slug" in detail) ||
    typeof detail.slug !== "string"
  ) {
    return;
  }

  if (activeTab.value !== "seo") {
    return;
  }

  void refreshAfterAgentSeoUpdate(detail.slug);
}

async function reloadPageDetail(): Promise<void> {
  const targetSlug = pageSlug.value;
  if (!targetSlug || targetSlug === "new") return;

  if (debouncedSeoSave.isDirty()) {
    await debouncedSeoSave.flushSave();
  }
  await composableLoadPage(targetSlug);
  await populateFormFromPage();
}

onMounted(async () => {
  setPageDetailRemoteLoadMerge((current, incoming) => ({
    ...incoming,
    settings: {
      ...incoming.settings,
      seo:
        debouncedSeoSave.isDirty() || debouncedSeoSave.hasPendingSave.value
          ? current.settings?.seo
          : incoming.settings?.seo,
    },
  }));

  window.addEventListener(AGENT_PAGE_SEO_UPDATED_EVENT, handleAgentPageSeoUpdated);
  await reloadPageDetail();
  applyRouteTabQuery();
});

/**
 * Populate vee-validate form fields and local state from the loaded page
 * DSL and the access policy endpoint. Keeps the legacy form-driven.
 */
async function populateFormFromPage() {
  const p = page.value;
  if (!p || !pageSlug.value) return;
  if ((p.slug ?? p.id) !== pageSlug.value && p.id !== pageSlug.value) return;

  // Populate basic fields from the page DSL
  setValues({
    title: p.title,
    slug: p.slug,
    description: p.description ?? "",
    layout: p.layout || "",
    status: p.status ?? "draft",
    parent: p.parent ?? null,
  });

  const cachedResource = pageResourceBank.getCachedPage(pageSlug.value);
  if (cachedResource?.policy) {
    applyPageAccessPolicy(cachedResource.policy);
  } else {
    await loadPageAccessPolicy(pageSlug.value);
  }

  if (cachedResource?.activity) {
    pageActivity.applyActivity(cachedResource.activity);
  }

  debouncedSeoSave.markSaved(p.settings?.seo);

  // Snapshot for dirty checking
  initialValues.value = { ...values } as Record<string, unknown>;
  isLoaded.value = true;
}

async function fetchRestoreData(currentSlug: string): Promise<JsonObject> {
  const { data } = await actions.getItem({
    collection: "pages",
    slug: currentSlug,
  });
  const parsed = PageDSLSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Failed to load page data for save");
  }
  const serialized: unknown = JSON.parse(JSON.stringify(parsed.data));
  if (!isJsonObject(serialized)) {
    throw new Error("Invalid page payload for save");
  }
  return serialized;
}

async function refreshPageDetailAfterMutation(slug: string): Promise<void> {
  pageResourceBank.invalidatePage(slug);
  await Promise.all([composableLoadPage(), refreshPagesNow()]);
  await populateFormFromPage();
  bumpPreviewRefreshToken();
  if (page.value?.id) {
    markPageThumbnailStale(page.value.id);
  }
  await loadPageSidebarData(slug);
  if (activeTab.value === "media" && hasLoadedPageMedia.value) {
    await loadPageMedia(slug, { force: true });
  }
}

async function handleRevertVersion(versionId: string): Promise<void> {
  const slug = page.value?.slug;
  if (!slug) return;

  const entry = versions.value.find((v) => v.version === versionId);
  const versionLabel = entry ? `v${entry.displayVersion}` : versionId;

  let restoreData: JsonObject;
  try {
    restoreData = await fetchRestoreData(slug);
  } catch {
    toast.error("Failed to load page data before restore");
    return;
  }

  const succeeded = await executeStudioOperation(
    {
      type: "restore-page-version",
      description: `Restore page to ${versionLabel}`,
    },
    {
      redo: async () => {
        const ok = await revertToVersion(slug, versionId);
        if (!ok) {
          throw new Error("Failed to restore page version");
        }
        await refreshPageDetailAfterMutation(slug);
      },
      undo: async () => {
        const updateResult = unwrapStudioCrudActionResult(
          "update",
          await actions.updateItem({
            collection: "pages",
            slug,
            data: restoreData,
          }),
          {
            collection: "pages",
            slug,
            source: "PageDetailView.handleRevertVersion.undo",
          },
        );

        if (!updateResult.success) {
          throw new Error(updateResult.error);
        }

        await refreshPageDetailAfterMutation(slug);
      },
    },
  );

  if (succeeded) {
    toast.success("Version restored");
  }
}

function handlePageActivityAction(itemId: string, actionId: string): void {
  const version = pageActivitySourceItems.value.find(
    (item) => item.id === itemId,
  )?.version;
  if (!version) {
    return;
  }
  if (actionId === "restore") {
    void handleRevertVersion(version);
  }
  if (actionId === "delete") {
    requestDeleteVersion(version);
  }
}

function requestDeleteVersion(versionId: string): void {
  const entry = versions.value.find((v) => v.version === versionId);
  versionPendingDelete.value = {
    versionId,
    displayVersion: entry?.displayVersion ?? 0,
  };
  versionDeleteDialog.open();
}

async function confirmDeleteVersion(): Promise<void> {
  const pending = versionPendingDelete.value;
  const slug = page.value?.slug;
  if (!pending || !slug) {
    return;
  }

  const success = await deleteVersion(slug, pending.versionId);
  versionDeleteDialog.close();
  versionPendingDelete.value = null;

  if (success) {
    toast.success("Revision deleted");
    await refreshPageDetailAfterMutation(slug);
  }
}

const onSubmit = handleSubmit(async (formData) => {
  isSaving.value = true;
  const currentSlug = pageSlug.value;

  try {
    const full = await fetchRestoreData(currentSlug);
    Object.assign(full, {
      title: formData.title,
      slug: formData.slug,
      description: formData.description?.trim() || undefined,
      layout: formData.layout || undefined,
      status: formData.status,
      parent: formData.parent || undefined,
    });
    // Page-level regions are legacy data. Header and footer are owned by the
    // selected layout; a page without a layout has no shared chrome.
    delete full.regions;

    const { error } = await actions.updateItem({
      collection: "pages",
      slug: currentSlug,
      data: full,
    });
    if (error) {
      toast.error(t("pages.detail.pageSaveFailed"));
      return;
    }

    pageResourceBank.invalidatePage(currentSlug);
    if (formData.slug !== currentSlug) {
      pageResourceBank.invalidatePage(formData.slug);
    }

    let policySaveError: string | null = null;
    if (isPageAccessPolicyDirty.value) {
      try {
        await savePageAccessPolicy(currentSlug);
      } catch (err) {
        policySaveError =
          err instanceof Error ? err.message : "Failed to save access settings";
      }
    }

    if (policySaveError) {
      toast.error(`Page saved, but access settings failed: ${policySaveError}`);
    } else {
      toast.success(t("pages.detail.pageSaved"));
    }

    if (formData.slug !== currentSlug && hasCapability("manageRedirects")) {
      offerRedirectAfterSlugChange({
        pages: pages.value.map((page) => ({
          slug: page.slug,
          parent: page.parent,
        })),
        oldSlug: currentSlug,
        newSlug: formData.slug,
        pageTitle: formData.title,
      });
    }

    await composableLoadPage(formData.slug || currentSlug);
    await refreshPagesNow();
  } catch {
    toast.error(t("common.failed"));
  } finally {
    isSaving.value = false;
  }
});

async function handlePublishNow(): Promise<void> {
  const builderPage = currentBuilderPage.value;
  const payload = getPublishPayload();
  if (!builderPage || !payload || isPublishing.value) return;

  isPublishing.value = true;
  try {
    if (builderPage.status === "archived") {
      const unarchiveResult = await actions.publishing.unarchive({
        id: builderPage.id,
        slug: builderPage.slug,
      });
      if (unarchiveResult.error) {
        throw new Error(unarchiveResult.error.message);
      }
    }

    const result = await actions.publishing.publish(payload);
    if (result.error) throw new Error(result.error.message);
    await refreshAfterPublishMutation(builderPage.slug);
    toast.success(t("pages.detail.pagePublished"));
  } catch {
    toast.error(t("pages.detail.pagePublishFailed"));
  } finally {
    isPublishing.value = false;
  }
}

async function handleSchedulePublish(scheduledFor?: string): Promise<void> {
  const builderPage = currentBuilderPage.value;
  const payload = getPublishPayload();
  if (!builderPage || !payload || isPublishing.value) return;
  if (!canSchedule.value) {
    toast.error(getForbiddenMessage("publishing.publish"));
    return;
  }

  isPublishing.value = true;
  try {
    const result = await actions.publishing.publish({
      ...payload,
      scheduledFor,
    });
    if (result.error) throw new Error(result.error.message);
    await refreshAfterPublishMutation(builderPage.slug);
    toast.success(
      scheduledFor ? t("pages.detail.pageScheduled") : t("pages.detail.pagePublished"),
    );
  } catch {
    toast.error(scheduledFor ? t("pages.detail.pageScheduleFailed") : t("pages.detail.pagePublishFailed"));
  } finally {
    isPublishing.value = false;
  }
}

async function handleUnpublish(): Promise<void> {
  const builderPage = currentBuilderPage.value;
  if (!builderPage || isPublishing.value) return;
  if (!canUnpublish.value) {
    toast.error(getForbiddenMessage("publishing.unpublish"));
    return;
  }

  isPublishing.value = true;
  try {
    const result = await actions.publishing.unpublish({
      id: builderPage.id,
      slug: builderPage.slug,
    });
    if (result.error) throw new Error(result.error.message);
    await refreshAfterPublishMutation(builderPage.slug);
    toast.success(
      builderPage.status === "scheduled"
        ? t("pages.detail.scheduleCancelled")
        : t("pages.detail.setAsDraft"),
    );
  } catch {
    toast.error(t("pages.detail.pageUnpublishFailed"));
  } finally {
    isPublishing.value = false;
  }
}

async function handleArchiveFromHeader(): Promise<void> {
  const builderPage = currentBuilderPage.value;
  if (!builderPage?.slug || isPublishing.value) return;

  if (builderPage.status === "archived") {
    if (!canUnarchive.value) {
      toast.error(getForbiddenMessage("publishing.unarchive"));
      return;
    }
    pageResourceBank.invalidatePage(builderPage.slug);
    await pageActions.unarchivePage(builderPage.slug);
    await composableLoadPage(builderPage.slug);
    return;
  }

  if (!canArchive.value) {
    toast.error(getForbiddenMessage("publishing.archive"));
    return;
  }
  pageResourceBank.invalidatePage(builderPage.slug);
  await pageActions.archivePage(builderPage.slug);
  await composableLoadPage(builderPage.slug);
}

function handleBack() {
  router.navigateTo("/pages");
}

const pageBreadcrumbs = computed(() => [
  { label: t("pages.title"), href: "/pages" },
  {
    label:
      page.value?.title || currentBuilderPage.value?.title || t("pages.detail.loading"),
  },
]);

async function executeDelete() {
  if (!pageToDelete.value) return;

  const slug = pageToDelete.value;
  const pageLabel = page.value?.title ?? slug;
  pageResourceBank.invalidatePage(slug);
  deleteDialog.close();

  const deleted = await deletePageWithGuard({
    slug,
    pageLabel,
    silent: true,
  });

  if (deleted) {
    handleBack();
  }
}

const isModified = computed(
  () =>
    currentBuilderPage.value?.status === "published" &&
    currentBuilderPage.value?.isModifiedSincePublish,
);

async function handleDuplicateClick(): Promise<void> {
  if (!page.value?.slug) return;
  const newSlug = await pageActions.duplicatePage(page.value.slug);
  if (newSlug) {
    router.navigateTo(`/pages/${newSlug}`);
  }
}

async function handleLayoutChange(newLayout: string): Promise<void> {
  if (!page.value?.slug || isSaving.value) return;

  isSaving.value = true;
  try {
    const result = await updatePageLayout({
      page: page.value,
      nextLayoutSlug: newLayout,
      canEdit: canEditPageStructure.value,
    });

    if (
      !result.success ||
      !result.nextPage ||
      result.previousLayout === result.nextLayout
    ) {
      return;
    }

    page.value = result.nextPage;
    pageResourceBank.invalidatePage(page.value.slug ?? pageSlug.value);
    layout.value = result.nextLayout ?? "";
    initialValues.value = {
      ...values,
      layout: result.nextLayout ?? "",
    } as Record<string, unknown>;
    isDirty.value = false;
    bumpPreviewRefreshToken();
    await refreshPagesNow();
    toast.success(t("pages.detail.layoutUpdated"));
  } finally {
    isSaving.value = false;
  }
}

async function persistPageStructure(
  nextNodes: NonNullable<typeof page.value>["nodes"],
  successMessage: string,
): Promise<void> {
  const currentPage = page.value;
  const currentSlug = pageSlug.value;

  if (!currentPage?.slug || !currentSlug || isPageStructureSaving.value) {
    return;
  }

  if (!canEditPageStructure.value) {
    toast.error(getForbiddenMessage("pages.reorderSections"));
    return;
  }

  const previousNodes = currentPage.nodes ?? [];
  isPageStructureSaving.value = true;
  page.value = {
    ...currentPage,
    nodes: nextNodes,
  };
  bumpPreviewRefreshToken();

  try {
    const full = await fetchRestoreData(currentSlug);
    const serializedNodes: unknown = JSON.parse(JSON.stringify(nextNodes));
    Object.assign(full, { nodes: serializedNodes });

    const { error } = await actions.updateItem({
      collection: "pages",
      slug: currentSlug,
      data: full,
    });

    if (error) {
      throw new Error(error.message ?? "Failed to update page structure");
    }

    pageResourceBank.invalidatePage(currentSlug);
    await refreshPagesNow();
    if (page.value?.id) {
      markPageThumbnailStale(page.value.id);
    }
    toast.success(successMessage);
  } catch (err) {
    page.value = {
      ...currentPage,
      nodes: previousNodes,
    };
    bumpPreviewRefreshToken();
    toast.error(
      err instanceof Error ? err.message : "Failed to update page structure",
    );
  } finally {
    isPageStructureSaving.value = false;
  }
}

function handleToggleSectionVisibility(sectionId: string): void {
  const currentNodes = page.value?.nodes ?? [];
  if (!sectionId || currentNodes.length === 0) return;

  const nextNodes = currentNodes.map((node) => {
    if (node.id !== sectionId) {
      return node;
    }

    const isHidden = node.metadata?.hidden === true;
    return {
      ...node,
      metadata: {
        ...(node.metadata ?? {}),
        hidden: !isHidden,
      },
    };
  });

  void persistPageStructure(nextNodes, "Section visibility updated");
}

function handleMoveSection(
  sectionId: string,
  direction: "up" | "down",
): void {
  const currentNodes = page.value?.nodes ?? [];
  const currentIndex = currentNodes.findIndex((node) => node.id === sectionId);
  if (currentIndex < 0) return;

  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= currentNodes.length) return;

  const reordered = [...currentNodes];
  const [movedNode] = reordered.splice(currentIndex, 1);
  if (!movedNode) return;
  reordered.splice(nextIndex, 0, movedNode);

  const nextNodes = reordered.map((node, index) => ({
    ...node,
    metadata: {
      ...(node.metadata ?? {}),
      order: index,
    },
  }));

  void persistPageStructure(nextNodes, "Page structure reordered");
}

function handleRenameSection(sectionId: string, newName: string): void {
  const currentNodes = page.value?.nodes ?? [];
  if (!sectionId || currentNodes.length === 0) return;

  const nextNodes = applySectionLabel(currentNodes, sectionId, newName);
  if (!nextNodes) return;

  void persistPageStructure(nextNodes, "Section renamed");
}

function handleParentChange(newParent: string): void {
  parent.value = newParent;
}

function handleVisibilityChange(
  newVisibility: "public" | "private" | "unlisted",
): void {
  pageAccessMode.value = newVisibility;
}

/**
 * Handle cover image update
 * The server save already happened in PageCoverImage — we just sync the
 * local reactive state so the UI reflects the change immediately.
 */
async function handleUpdateCover(
  src: string,
  alt?: string,
  caption?: string,
): Promise<void> {
  if (!page.value) return;
  page.value = {
    ...page.value,
    featuredImage: {
      src,
      alt: alt || undefined,
      caption: caption || undefined,
    },
  };
}

/**
 * Handle cover image removal
 * The server save already happened in PageCoverImage — we just sync the
 * local reactive state so the UI reflects the change immediately.
 */
async function handleRemoveCover(): Promise<void> {
  if (!page.value) return;
  const updated = { ...page.value };
  delete updated.featuredImage;
  page.value = updated;
}

watch(
  [pageAccessSystemRole, isPageAccessPolicyDirty, isPageAccessLoading],
  ([role, dirty, loading]) => {
    if (!loading && role === "not-found" && !dirty) {
      hasConfirmedNotFoundOverride.value = true;
    }
  },
);

function needsNotFoundOverrideConfirmation(): boolean {
  return (
    pageAccessSystemRole.value === "not-found" &&
    Boolean(existingNotFoundPage.value) &&
    !hasConfirmedNotFoundOverride.value
  );
}

function openNotFoundOverrideDialog(fromSave: boolean): void {
  pendingNotFoundSave.value = fromSave;
  confirmNotFoundDialogOpen.value = true;
}

function handleSelectStandardRole(): void {
  hasConfirmedNotFoundOverride.value = false;
  pageAccessSystemRole.value = "standard";
}

function handleSelectNotFoundRole(): void {
  if (pageAccessSystemRole.value === "not-found") {
    return;
  }

  if (existingNotFoundPage.value) {
    openNotFoundOverrideDialog(false);
    return;
  }

  pageAccessSystemRole.value = "not-found";
  pageAccessMode.value = "public";
}

function handleSelectCmsCollectionRole(): void {
  if (pageAccessSystemRole.value === "cms-collection") {
    return;
  }

  pageAccessSystemRole.value = "cms-collection";
}

function handleSelectCmsEntryRole(): void {
  if (pageAccessSystemRole.value === "cms-entry") {
    return;
  }

  pageAccessSystemRole.value = "cms-entry";
  pageAccessMode.value = "public";
}

async function handleTypeTabCollectionAssigned(): Promise<void> {
  isPageTypeAssignmentSyncing.value = true;
  try {
    await cmsTemplateAssignments.refresh();
    await refreshPagesNow();
    dispatchCmsPageUsageUpdated();
    if (pageSlug.value) {
      await loadPageAccessPolicy(pageSlug.value);
    }
  } finally {
    isPageTypeAssignmentSyncing.value = false;
  }
}

function cancelNotFoundOverride(): void {
  confirmNotFoundDialogOpen.value = false;
  pendingNotFoundSave.value = false;
}

async function confirmNotFoundOverride(): Promise<void> {
  confirmNotFoundDialogOpen.value = false;
  hasConfirmedNotFoundOverride.value = true;
  pageAccessSystemRole.value = "not-found";
  pageAccessMode.value = "public";

  if (!pendingNotFoundSave.value) {
    return;
  }

  pendingNotFoundSave.value = false;

  try {
    await persistAccessPolicy();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save access settings";
    toast.error(message);
  }
}

async function persistAccessPolicy(): Promise<void> {
  if (!pageSlug.value) return;

  await savePageAccessPolicy(pageSlug.value);
  pageResourceBank.invalidatePage(pageSlug.value);
  toast.success(
    pageAccessSystemRole.value === "not-found"
      ? "404 page assigned"
      : pageAccessSystemRole.value === "cms-collection"
        ? "CMS Collection settings saved"
        : pageAccessSystemRole.value === "cms-entry"
          ? "CMS Entry settings saved"
          : "Access settings saved",
  );
  if (pageAccessClearedAssignments.value?.length) {
    const summary = pageAccessClearedAssignments.value
      .map((clear) => clear.collectionLabel)
      .join(", ");
    toast.info(`Cleared collection assignment for ${summary}`);
  }
  await cmsTemplateAssignments.refresh();
  await refreshPagesNow();
  dispatchCmsPageUsageUpdated();
}

async function handleSaveAccessPolicy(): Promise<void> {
  if (!pageSlug.value) return;

  if (needsNotFoundOverrideConfirmation()) {
    openNotFoundOverrideDialog(true);
    return;
  }

  try {
    await persistAccessPolicy();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save access settings";

    if (
      message.toLowerCase().includes("404") ||
      message.toLowerCase().includes("only one page")
    ) {
      await refreshPagesNow();
      openNotFoundOverrideDialog(true);
      return;
    }

    toast.error(message);
  }
}

function handleDeleteClick() {
  if (!page.value?.slug) return;
  pageToDelete.value = page.value.slug;
  deleteDialog.open();
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-sidebar">
          <!-- Modified banner -->
          <Transition name="banner-slide">
        <div
          v-if="isModified"
          class="flex shrink-0 items-center justify-center gap-2 overflow-hidden px-5 pb-2 text-sm text-primary bg-sidebar"
        >
          <span :class="[studioIcons.warning, 'size-3.5 shrink-0']" />
          <span>{{ t("pages.detail.unpublishedChanges") }}</span>
          <Button
            v-if="canPublish"
            variant="link"
            size="sm"
            class="h-auto p-0 text-sm text-primary/90 underline hover:text-primary"
            :disabled="isPublishing"
            @click="handlePublishNow"
          >
            <span
              v-if="isPublishing"
              class="i-hugeicons:loading-01 mr-1.5 size-3.5 animate-spin"
            />
            {{ isPublishing ? t("pages.action.publishing") : t("pages.detail.publishNow") }}
          </Button>
        </div>
      </Transition>

    <section
      class="relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-solid border-border bg-background"
    >
      <StudioPresenceNotice
        resource-type="page"
        :resource-id="pagePresenceId"
        resource-label="page"
      />
      <header
        class="flex min-w-0 w-full max-w-full items-center justify-between px-3 pt-3 shrink-0 page-card-enter"
      >
        <div class="flex min-w-0 flex-1 items-center gap-1.5">
          <Button
            variant="bread"
            size="icon"
            @click="handleBack"
          >
            <span :class="[studioIcons.chevronLeft, 'size-4']" />
          </Button>
          <Breadcrumbs :items="pageBreadcrumbs" />
        </div>
      </header>

      <PageHeader
        :title="page?.title || currentBuilderPage?.title || t('pages.detail.loading')"
        class="page-card-enter"
        hide-search
        hide-create
      >
        <template #title>
          <div class="min-w-0">
            <Input
              v-if="isEditingTitle"
              ref="titleInputRef"
              v-model="editingTitle"
              class="h-9 w-[min(32rem,48vw)] text-2xl font-medium"
              @blur="confirmTitleEdit"
              @keydown.enter.prevent="confirmTitleEdit"
              @keydown.esc.prevent="cancelTitleEdit"
            />
            <button
              v-else
              type="button"
              class="m-0 block min-w-0 truncate text-left font-serif text-2xl font-medium tracking-tight text-foreground transition-colors hover:text-primary"
              @click="startTitleEdit"
            >
              {{ page?.title || currentBuilderPage?.title || t("pages.detail.loading") }}
            </button>

          </div>
        </template>

        <template #toolbar>
          <HeaderActionTooltip
            :label="previewDisabledReason ?? t('pages.detail.preview')"
            :disabled="Boolean(previewDisabledReason) || isLoading"
          >
            <Button
              variant="headerAction"
              size="icon-header"
              :disabled="Boolean(previewDisabledReason) || isLoading"
              @click="openPreview"
            >
              <span :class="[studioIcons.eye, 'size-3.5 shrink-0']" />
            </Button>
          </HeaderActionTooltip>

          <HeaderActionTooltip :label="saveTooltip" :disabled="isSaveDisabled">
            <Button
              variant="headerAction"
              size="icon-header"
              :disabled="isSaveDisabled"
              @click="() => onSubmit()"
            >
              <span
                v-if="isSaving"
                class="i-hugeicons:loading-01 size-3.5 shrink-0 animate-spin"
              />
              <span v-else :class="[studioIcons.save, 'size-3.5 shrink-0']" />
            </Button>
          </HeaderActionTooltip>

          <PagePublishOverflowMenu
            :status="pageStatus"
            :can-schedule="canSchedule"
            :can-unpublish="canUnpublish"
            :can-archive="pageStatus === 'archived' ? canUnarchive : canArchive"
            :can-delete="canDeletePage && page?.slug !== 'index'"
            :can-duplicate="canDuplicatePage"
            :is-busy="isPublishing"
            :scheduled-for="pageScheduledFor"
            :publish-disabled-reason="publishDisabledReason"
            :unpublish-forbidden-message="getForbiddenMessage('publishing.unpublish')"
            :archive-forbidden-message="
              pageStatus === 'archived'
                ? getForbiddenMessage('publishing.unarchive')
                : getForbiddenMessage('publishing.archive')
            "
            :delete-forbidden-message="getForbiddenMessage('crud.deleteItem')"
            :schedule-forbidden-message="getForbiddenMessage('publishing.publish')"
            @schedule="handleSchedulePublish"
            @reschedule="handleSchedulePublish"
            @cancel-schedule="handleUnpublish"
            @unpublish="handleUnpublish"
            @archive="handleArchiveFromHeader"
            @delete="handleDeleteClick"
            @duplicate="handleDuplicateClick"
          />
        </template>

        <template #actions>
          <ComposerButton
            v-if="page?.slug"
            item-type="page"
            :slug="page.slug"
            class="h-9!"
          />

          <PagePublishSplitButton
            :status="pageStatus"
            :is-modified-since-publish="Boolean(currentBuilderPage?.isModifiedSincePublish)"
            :can-publish="canPublish"
            :is-busy="isPublishing"
            :scheduled-for="pageScheduledFor"
            :publish-disabled-reason="publishDisabledReason"
            @publish-now="handlePublishNow"
          />
        </template>
      </PageHeader>

      <div
        class="flex h-12 shrink-0 items-stretch gap-1 border-b border-dashed border-border bg-background px-7 page-card-enter"
      >
        <Button
          v-for="tab in visibleDetailTabs"
          :key="tab.id"
          type="button"
          size="tab"
          :variant="activeTab === tab.id ? 'tab-active' : 'tab'"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </Button>
      </div>

      <div class="min-h-0 min-w-0 flex-1 overflow-y-auto page-card-enter">
        <div
          class="mx-auto grid w-full max-w-[80rem] gap-8 px-5 py-6 md:px-7 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-10"
        >
          <main class="grid min-w-0 content-start gap-8">
            <PageDetailOverviewTab
              v-if="activeTab === 'overview'"
              v-model:title="title"
              v-model:description="description"
              v-model:slug="slug"
              :current-error="currentError"
              :analytics="analytics"
              :seo-score="seoScoreValue"
              :is-loading="isLoading"
              :is-loaded="isLoaded"
              :page-slug="page?.slug"
              :page-path="resolvedPagePath || '/'"
              :status="pageStatus"
              :status-label="statusPresentation.label"
              :status-description="statusPresentation.description"
              :status-dot-class="statusPresentation.dotClass"
              :status-surface-class="statusPresentation.surfaceClass"
              :current-layout="layout"
              :current-parent="parent ?? ''"
              :current-visibility="
                (page?.visibility as 'public' | 'private' | 'unlisted') ??
                'public'
              "
              :is-saving="isSaving"
              :available-layouts="
                layouts.map((item) => ({ slug: item.id, name: item.name }))
              "
              :available-parents="
                pages
                  .filter((item) => item.slug !== pageSlug)
                  .map((item) => ({ slug: item.slug, title: item.title }))
              "
              :editor-name="pageEditorName"
              :last-edited="pageLastEdited"
              @dismiss-error="clearError"
              @retry-load="composableLoadPage"
              @update-layout="handleLayoutChange"
              @update-parent="handleParentChange"
              @update-visibility="handleVisibilityChange"
            />

            <div
              v-else-if="activeTab === 'content'"
              class="max-w-4xl space-y-5"
            >
              <PageStructureList
                :sections="sections"
                :can-edit="canEditPageStructure"
                :is-loading="isLoading && !isLoaded"
                :is-saving="isPageStructureSaving"
                @toggle-visibility="handleToggleSectionVisibility"
                @move-section="handleMoveSection"
                @rename-section="handleRenameSection"
              />
            </div>

            <PageDetailSeoTab
              v-else-if="activeTab === 'seo'"
              :current-error="currentError"
              :recommendations="recommendations"
              :page-slug="pageSlug"
              :page-title="page?.title"
              :agent-seo-context="agentSeoContext"
              :is-saving="debouncedSeoSave.isSaving.value"
              :has-pending-save="debouncedSeoSave.hasPendingSave.value"
              v-model:meta-title="seoMetaTitle"
              v-model:meta-description="seoMetaDescription"
              v-model:og-title="seoOgTitle"
              v-model:og-description="seoOgDescription"
              v-model:canonical="seoCanonical"
              v-model:noindex="seoNoindex"
              v-model:nofollow="seoNofollow"
              @dismiss-error="clearError"
              @retry-load="composableLoadPage"
            />

            <PageDetailTypeTab
              v-else-if="activeTab === 'type'"
              v-model:system-role="pageAccessSystemRole"
              :page-id="page?.id"
              :page-title="page?.title"
              :page-slug="pageSlug"
              :page-options="pageAssignmentOptions"
              :is-loading="isPageAccessLoading"
              :is-saving="isPageAccessSaving || isPageTypeAssignmentSyncing"
              :error="pageAccessError"
              :is-dirty="isPageAccessPolicyDirty"
              :is-saved-not-found="isSavedNotFoundPage"
              :is-saved-cms-collection="isSavedCmsCollectionPage"
              :is-saved-cms-entry="isSavedCmsEntryPage"
              :has-assigned-collections="hasAssignedTemplateCollections"
              :pending-assignment-clears="pendingCmsAssignmentClears"
              @save="handleSaveAccessPolicy"
              @select-not-found="handleSelectNotFoundRole"
              @select-standard="handleSelectStandardRole"
              @select-cms-collection="handleSelectCmsCollectionRole"
              @select-cms-entry="handleSelectCmsEntryRole"
              @assign-collection="handleTypeTabCollectionAssigned"
              @unassign-collection="handleTypeTabCollectionAssigned"
            />

            <PageDetailAccessTab
              v-else-if="activeTab === 'access'"
              v-model:access-mode="pageAccessMode"
              v-model:password="pageAccessPassword"
              v-model:prompt-title="pageAccessPromptTitle"
              v-model:prompt-description="pageAccessPromptDescription"
              v-model:remember-days="pageAccessRememberDays"
              :is-loading="isPageAccessLoading"
              :is-saving="isPageAccessSaving"
              :error="pageAccessError"
              :is-dirty="isPageAccessPolicyDirty"
              :is-locked-to-public="
                pageAccessSystemRole === 'not-found' ||
                pageAccessSystemRole === 'cms-entry'
              "
              @save="handleSaveAccessPolicy"
            />

            <PageDetailMediaTab
              v-else-if="activeTab === 'media'"
              :current-error="currentError"
              :media="pageMedia"
              :display-items="pageMediaDisplayItems"
              :is-loading="isPageMediaLoading"
              @dismiss-error="clearError"
              @retry-load="
                () => page?.slug && loadPageMedia(page.slug, { force: true })
              "
              @preview="openPageMediaPreview"
            />

            <PageDetailLocalizationTab
              v-else-if="activeTab === 'localization'"
              :page-id="page?.id"
              :page-slug="page?.slug"
              :disabled="!canEditInComposer"
            />
          </main>

          <aside
            class="grid min-w-0 content-start gap-6 xl:sticky xl:top-6 xl:self-start"
          >
            <template v-if="activeTab === 'seo'">
              <PageOgImageCard v-model="seoOgImage" />

              <SocialPreviewCard
                :title="seoOgTitle || googlePreview.title"
                :description="seoOgDescription || googlePreview.description"
                :url="googlePreview.url"
                :image="seoOgImage"
              />

              <SeoPreviewCard
                :title="googlePreview.title"
                :description="googlePreview.description"
                :url="googlePreview.url"
                :title-length-warning="googlePreview.title.length > 60"
              />

            </template>

            <template v-else>
              <div
                v-if="currentBuilderPage"
                class="w-full overflow-hidden rounded-md border border-solid border-border/50 bg-card/40"
              >
                <div class="flex items-center justify-between gap-3 px-5 pt-3">
                  <div class="min-w-0">
                    <p class="m-0 text-sm font-semibold leading-none text-foreground">
                      {{ t("pages.detail.pagePreview") }}
                    </p>
                  </div>

                  <div class="flex shrink-0 items-center gap-1">
                    <div
                      v-if="pagePreviewViewportOptions.length > 1"
                      class="group flex max-w-7 flex-row-reverse items-center gap-1 overflow-hidden transition-[max-width] duration-200 ease-out hover:max-w-40 focus-within:max-w-40"
                    >
                      <HeaderActionTooltip
                        v-for="option in orderedPagePreviewViewportOptions"
                        :key="option.id"
                        :label="`${option.label} · ${option.width ?? option.minWidth}px`"
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          class="shrink-0"
                          :class="
                            option.id === pagePreviewViewport
                              ? 'border-primary/60 bg-sidebar text-foreground'
                              : ''
                          "
                          :aria-label="t('pages.detail.previewViewport', { viewport: option.label })"
                          :aria-pressed="option.id === pagePreviewViewport"
                          @click="pagePreviewViewport = option.id"
                        >
                          <span
                            :class="[
                              getBreakpointIconClass({
                                id: option.id,
                                icon: option.icon,
                                width: option.width ?? option.minWidth,
                              }),
                              'size-4',
                            ]"
                          />
                        </Button>
                      </HeaderActionTooltip>
                    </div>

                    <HeaderActionTooltip
                      :label="previewDisabledReason ?? t('pages.detail.openPreview')"
                      :disabled="Boolean(previewDisabledReason)"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        :disabled="Boolean(previewDisabledReason)"
                        :aria-label="t('pages.detail.openPagePreview')"
                        @click="openPreview"
                      >
                        <span :class="[studioIcons.eye, 'size-4']" />
                      </Button>
                    </HeaderActionTooltip>
                  </div>
                </div>

                <div class="px-3 pb-3 pt-1.5">
                  <button
                    type="button"
                    class="relative block w-full overflow-hidden rounded-lg border border-border bg-muted/20 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
                    :disabled="Boolean(previewDisabledReason)"
                    :title="previewDisabledReason ?? t('pages.detail.openPreview')"
                    @click="openPreview"
                  >
                    <div class="aspect-4/5 w-full">
                      <PageSnapshotPreviewFrame
                        :key="`${currentBuilderPage.slug}:${currentBuilderPage.snapshotUrl ?? ''}:${previewRefreshToken ?? ''}`"
                        :page-id="currentBuilderPage.id"
                        :page-slug="currentBuilderPage.slug"
                        :page-status="previewPageStatus"
                        :snapshot-url="currentBuilderPage.snapshotUrl"
                        :snapshot-refresh-token="previewRefreshToken"
                        :eager="true"
                        :skip-observer="true"
                        fit-to-container
                        :viewport="pagePreviewViewport"
                        class="pointer-events-none h-full w-full !rounded-none !border-0"
                      />
                    </div>
                    <span
                      class="absolute inset-0 z-10"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>

              <PageCoverImage
                v-if="page?.slug"
                :page-slug="page.slug"
                :cover-src="page?.featuredImage?.src"
                :cover-alt="page?.featuredImage?.alt"
                :cover-caption="page?.featuredImage?.caption"
                :is-saving="isSaving || isPublishing"
                @update="handleUpdateCover"
                @remove="handleRemoveCover"
              />
            </template>

            <ActivityTimeline
              :items="pageActivityItems"
              :is-loading="pageActivity.isLoading.value"
              @action="handlePageActivityAction"
            />
          </aside>
        </div>
      </div>
    </section>

    <DeleteConfirmDialog
      :open="deleteDialog.isOpen.value"
      :item-name="pageToDelete ?? undefined"
      @update:open="
        deleteDialog.isOpen.value ? deleteDialog.close() : deleteDialog.open()
      "
      @confirm="executeDelete"
    />

    <PageDeleteRoutingBlockedDialog
      :open="blockedDialogOpen"
      :page-label="blockedMessagePageLabel"
      :impact="blockedImpact"
      :can-unbind="canUnbindCollections"
      :is-loading="isUnbinding"
      @update:open="(open: boolean) => { if (!open) cancelBlockedDelete(); }"
      @cancel="cancelBlockedDelete()"
      @unbind-and-delete="
        void confirmUnbindAndDelete().then((deleted) => {
          if (deleted) {
            handleBack();
          }
        })
      "
    />

    <DeleteConfirmDialog
      :open="versionDeleteDialog.isOpen.value"
      :title="versionDeleteDialogTitle"
      :description="versionDeleteDialogDescription"
      :confirm-label="t('pages.detail.deletePermanently')"
      :is-loading="isDeletingVersion"
      @update:open="
        versionDeleteDialog.isOpen.value
          ? versionDeleteDialog.close()
          : versionDeleteDialog.open()
      "
      @confirm="confirmDeleteVersion"
    />

    <PreviewMediaDialog
      :open="isPageMediaPreviewOpen"
      :asset="pageMediaPreviewAsset"
      @update:open="(open) => !open && closePageMediaPreview()"
    />

    <Dialog v-model:open="confirmNotFoundDialogOpen">
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{{ t("pages.detail.notFoundAssigned") }}</DialogTitle>
          <DialogDescription>
            {{ t("pages.detail.notFoundOverride", {
              page: existingNotFoundPage?.title ?? existingNotFoundPage?.slug ?? "",
            }) }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="cancelNotFoundOverride">
            {{ t("pages.cancel") }}
          </Button>
          <Button
            :disabled="isPageAccessSaving"
            @click="void confirmNotFoundOverride()"
          >
            {{ isPageAccessSaving ? t("pages.detail.saving") : t("pages.detail.overrideNotFound") }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.banner-slide-leave-active {
  transition: all 0.3s ease-in-out;
  overflow: hidden;
}
.banner-slide-enter-active {
  transition: all 0.25s ease-out;
  overflow: hidden;
}
.banner-slide-enter-from {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  margin-bottom: 0;
  border-top-width: 0;
  border-bottom-width: 0;
}
.banner-slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  margin-bottom: 0;
  border-top-width: 0;
  border-bottom-width: 0;
}
.banner-slide-enter-to {
  opacity: 1;
  max-height: 60px;
}
.banner-slide-leave-from {
  opacity: 1;
  max-height: 60px;
}
</style>
