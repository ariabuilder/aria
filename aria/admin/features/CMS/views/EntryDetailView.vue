<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import { useStudioRouter } from "@/features/Studio/core/composables";
import { studioIcons } from "@/lib/icons";
import { useCollectionDetail } from "../composables/useCollectionDetail";
import { useCmsCapabilities } from "../composables/useCmsCapabilities";
import { useCmsEntryActions } from "../composables/useCmsEntryActions";
import { useEditEntryForm } from "../composables/useEditEntryForm";
import { useEntryRevisions } from "../composables/useEntryRevisions";
import type { CmsEntryRow } from "../lib/entryRow";
import CmsFrontmatterField from "../components/CmsFrontmatterField.vue";
import CmsRelationField from "../components/CmsRelationField.vue";
import ActivityTimeline from "@/features/Core/components/ActivityTimeline.vue";
import { buildCmsEntryActivityItems } from "../lib/entryActivity";
import StructuredTextEditor from "../components/StructuredTextEditor.vue";
import {
  collectionSupportsBody,
  collectionSupportsRevisions,
  collectionSupportsScheduling,
} from "../lib/collectionBodySupport";
import EntryPublishOverflowMenu from "@/features/Publishing/components/EntryPublishOverflowMenu.vue";
import PagePublishSplitButton from "@/features/Publishing/components/PagePublishSplitButton.vue";
import {
  buildContentPreviewUrl,
  getPreviewDisabledReason,
} from "@/features/Publishing/lib/buildContentPreviewUrl";
import { isEditableCmsField } from "../lib/frontmatterForm";
import { getOrderedEntryFieldPlacement } from "../lib/entryFieldPlacement";
import { formatCmsActorDisplay } from "../lib/actorDisplay";
import { entryFieldsForCollection } from "../../../../lib/cms/systemFields";
import { normalizeEntryFieldOrder } from "../../../../lib/cms/entryFieldOrder";
import type {
  EntryFieldWidth,
  FieldSchema,
  SystemEntryFieldKey,
} from "../../../../lib/cms/schemas";
import {
  getEntryFieldWidthClass,
  normalizeEntryFieldWidth,
} from "../lib/entryFieldWidth";
import DeleteEntryDialog from "../dialogs/DeleteEntryDialog.vue";
import RestoreEntryRevisionDialog from "../dialogs/RestoreEntryRevisionDialog.vue";
import { useCmsNavigationPreview } from "../lib/cmsNavigationPreview";
import { invalidateEntryMutationCaches } from "../composables/useCmsDataCache";
import { useStudioI18n } from "@/i18n";
import { useAgentPanel } from "@/features/Agent/client/composables/useAgentPanel";
import { getEmptyAgentShellContext } from "@/features/Agent/client/composables/useAgentContext";

const route = useRoute();
const router = useStudioRouter();
const { t } = useStudioI18n();
const { activeEntryPreview } = useCmsNavigationPreview();
const agentPanel = useAgentPanel();

const collectionParam = computed(() => String(route.params.name ?? ""));
const entrySlugOrId = computed(() => String(route.params.entrySlugOrId ?? ""));
const routeLocale = computed(() =>
  typeof route.query?.locale === "string" ? route.query.locale : undefined,
);

const {
  collection,
  isLoading: isCollectionLoading,
  loadError: collectionLoadError,
} = useCollectionDetail(collectionParam);

const {
  canUpdateEntry,
  canPublishEntry,
  canUnpublishEntry,
  canArchiveEntry,
  canDeleteEntry,
  canListRevisions,
  canRestoreRevision,
  getForbiddenMessage,
} = useCmsCapabilities();

const {
  currentEntryRecord,
  title,
  slug,
  status,
  bodyDocument,
  commentsClosed,
  frontmatterDraft,
  relationDraft,
  resolvedEntryId,
  activeLocaleCode,
  isLocalizedVariant,
  availableLocales,
  version,
  authorDisplayName,
  createdByDisplayName,
  updatedByDisplayName,
  publishedByDisplayName,
  createdAt,
  updatedAt,
  publishedAt,
  scheduledFor,
  isLoading: isEntryLoading,
  isSaving,
  hasUnsavedChanges,
  loadError: entryLoadError,
  errors,
  isSlugEdited,
  loadEntry,
  switchActiveLocale,
  checkSlugAvailability,
  updateSlugFromTitle,
  markSlugEdited,
  applyEntryRecord,
  resetForm,
  submitUpdate,
} = useEditEntryForm();

const entryActions = useCmsEntryActions();
const entryRevisions = useEntryRevisions();
const isDeleteDialogOpen = ref(false);
const pendingRestoreRevisionId = ref<string | null>(null);
const isRestoreRevisionDialogOpen = computed(
  () => pendingRestoreRevisionId.value !== null,
);

const collectionId = computed(() => collection.value?.id ?? "");
const sourceLocaleCode = computed(
  () =>
    currentEntryRecord.value?.locales.find((locale) => locale.isSource)
      ?.locale ??
    currentEntryRecord.value?.locales[0]?.locale ??
    "en",
);
const existingLocaleCodes = computed(
  () => currentEntryRecord.value?.locales.map((locale) => locale.locale) ?? [],
);
const missingLocaleCodes = computed(() =>
  availableLocales.value
    .filter((locale) => locale.status === "missing")
    .map((locale) => locale.code),
);
const activeLocaleIsMissing = computed(() =>
  availableLocales.value.some(
    (locale) =>
      locale.code === activeLocaleCode.value &&
      (locale.status === "missing" || locale.status === "unsaved"),
  ),
);
const activeLocaleIsStale = computed(() =>
  availableLocales.value.some(
    (locale) =>
      locale.code === activeLocaleCode.value && locale.status === "stale",
  ),
);
const activeLocaleState = computed<
  "source" | "translated" | "missing" | "stale"
>(() =>
  activeLocaleCode.value === sourceLocaleCode.value
    ? "source"
    : activeLocaleIsMissing.value
      ? "missing"
      : activeLocaleIsStale.value
        ? "stale"
        : "translated",
);
const bodyEnabled = computed(() => collectionSupportsBody(collection.value));
const schedulingEnabled = computed(() =>
  collectionSupportsScheduling(collection.value),
);
const revisionsEnabled = computed(() =>
  collectionSupportsRevisions(collection.value),
);

function generateActiveLocaleTranslation(): void {
  if (
    !collection.value ||
    !resolvedEntryId.value ||
    !version.value ||
    (!activeLocaleIsMissing.value && !activeLocaleIsStale.value)
  ) {
    return;
  }
  const target = availableLocales.value.find(
    (locale) => locale.code === activeLocaleCode.value,
  );
  const context = getEmptyAgentShellContext();
  agentPanel.open({
    seed: `${activeLocaleIsStale.value ? "Regenerate the stale" : "Generate and save the missing"} ${target?.label ?? activeLocaleCode.value} (${activeLocaleCode.value}) translation for this entry. Translate all fields marked translatable from ${sourceLocaleCode.value}; preserve the slug, media, relations, identifiers, placeholders, structured content shape, and current publication status. ${activeLocaleIsStale.value ? "The user explicitly requested updating this existing stale variant; use update_existing." : "Use create_missing."}`,
    autoSend: true,
    composerMode: "agent",
    focusComposer: false,
    shellContext: {
      ...context,
      workspace: "collections",
      routeContext: { path: route.fullPath, section: "cms-entry" },
      cmsEntry: {
        collectionId: collection.value.id,
        collectionName: collection.value.name,
        entryId: resolvedEntryId.value,
        entryVersion: version.value,
        entryTitle: title.value,
        sourceLocale: sourceLocaleCode.value,
        activeLocale: activeLocaleCode.value,
        activeLocaleState: activeLocaleState.value,
        existingLocales: existingLocaleCodes.value,
        missingLocales: missingLocaleCodes.value,
      },
    },
  });
}

function generateAllMissingTranslations(): void {
  if (
    !collection.value ||
    !resolvedEntryId.value ||
    !version.value ||
    missingLocaleCodes.value.length < 2
  ) {
    return;
  }
  const context = getEmptyAgentShellContext();
  agentPanel.open({
    seed: `Generate and save translations for every missing enabled locale on this entry: ${missingLocaleCodes.value.join(", ")}. Read the translation context once, translate each locale independently from the canonical ${sourceLocaleCode.value} source, and use the entry version returned by each save for the next locale. Never overwrite existing variants or change publication status. Preserve slugs, media, relations, identifiers, placeholders, and structured content shape. Report per-locale results.`,
    autoSend: true,
    composerMode: "agent",
    focusComposer: false,
    shellContext: {
      ...context,
      workspace: "collections",
      routeContext: { path: route.fullPath, section: "cms-entry" },
      cmsEntry: {
        collectionId: collection.value.id,
        collectionName: collection.value.name,
        entryId: resolvedEntryId.value,
        entryVersion: version.value,
        entryTitle: title.value,
        sourceLocale: sourceLocaleCode.value,
        activeLocale: activeLocaleCode.value,
        activeLocaleState: activeLocaleState.value,
        existingLocales: existingLocaleCodes.value,
        missingLocales: missingLocaleCodes.value,
      },
    },
  });
}

async function handleTranslationSaved(event: Event): Promise<void> {
  const detail = (
    event as CustomEvent<{
      entry?: { id?: string };
      locales?: Array<{ locale?: string }>;
    }>
  ).detail;
  if (detail?.entry?.id !== resolvedEntryId.value || !collectionId.value)
    return;
  await loadEntry(
    collectionId.value,
    resolvedEntryId.value,
    fields.value,
    activeLocaleCode.value,
  );
  toast.success(t("cms.translationGenerated"));
}

onMounted(() => {
  window.addEventListener(
    "aria:cms-entry-translation-saved",
    handleTranslationSaved,
  );
});

onBeforeUnmount(() => {
  window.removeEventListener(
    "aria:cms-entry-translation-saved",
    handleTranslationSaved,
  );
});
const fields = computed(() =>
  collection.value ? entryFieldsForCollection(collection.value) : [],
);
type EntryFormItem =
  | {
      id: string;
      kind: "system";
      key: SystemEntryFieldKey;
      width: EntryFieldWidth;
    }
  | {
      id: string;
      kind: "frontmatter";
      field: FieldSchema;
      width: EntryFieldWidth;
    }
  | {
      id: string;
      kind: "relation";
      field: FieldSchema & { type: "relation" };
      width: EntryFieldWidth;
    };

const entryFormLayout = computed<{
  main: EntryFormItem[];
  sidebar: EntryFormItem[];
}>(() => {
  if (!collection.value) {
    return { main: [], sidebar: [] };
  }

  const fieldsByKey = new Map(fields.value.map((field) => [field.key, field]));
  const main: EntryFormItem[] = [];
  const sidebar: EntryFormItem[] = [];

  for (const item of normalizeEntryFieldOrder({
    fields: fields.value,
    entryFieldOrder: collection.value.schema.entryFieldOrder,
    supportsBody: bodyEnabled.value,
  })) {
    if (item.kind === "system") {
      if (item.key === "body" && !bodyEnabled.value) {
        continue;
      }
      main.push({
        id: `system:${item.key}`,
        kind: "system",
        key: item.key,
        width: "full",
      });
      continue;
    }

    const field = fieldsByKey.get(item.key);
    if (!field) {
      continue;
    }

    let formItem: EntryFormItem | null = null;
    const width = normalizeEntryFieldWidth(item.width);
    if (field.type === "relation") {
      formItem = {
        id: `relation:${field.key}`,
        kind: "relation",
        field: field as FieldSchema & { type: "relation" },
        width,
      };
    } else if (isEditableCmsField(field)) {
      formItem = {
        id: `frontmatter:${field.key}`,
        kind: "frontmatter",
        field,
        width,
      };
    }

    if (!formItem) {
      continue;
    }

    const placement = getOrderedEntryFieldPlacement(item, field);
    (placement === "sidebar" ? sidebar : main).push(formItem);
  }

  return { main, sidebar };
});
const mainEntryFormItems = computed(() => entryFormLayout.value.main);
const sidebarEntryFormItems = computed(() => entryFormLayout.value.sidebar);
const canScheduleEntry = computed(
  () => canPublishEntry.value && schedulingEnabled.value,
);
const previewUrl = computed(() => {
  if (!collection.value || !slug.value) {
    return null;
  }
  return buildContentPreviewUrl({
    kind: "cms_entry",
    collection: collection.value,
    slug: slug.value,
    status: status.value,
  });
});
const previewDisabledReason = computed(() => {
  if (!collection.value) {
    return t("cms.collectionNotLoaded");
  }
  if (!slug.value.trim()) {
    return t("cms.missingEntrySlug");
  }
  return getPreviewDisabledReason({
    kind: "cms_entry",
    collection: collection.value,
    slug: slug.value,
    status: status.value,
  });
});
const publishDisabledReason = computed(() => {
  if (!canPublishEntry.value) {
    return getForbiddenMessage("cms.entries.publish");
  }
  return null;
});
const saveButtonLabel = computed(() => {
  if (isSaving.value) {
    return t("common.saving");
  }
  if (status.value === "published") {
    return t("cms.saveChanges");
  }
  return t("cms.saveDraft");
});
const saveTooltip = computed(() => {
  if (isSaving.value) return t("common.saving");
  if (isSaveDisabled.value && !hasUnsavedChanges.value) {
    return t("cms.noChanges");
  }
  return saveButtonLabel.value;
});
const isSaveDisabled = computed(
  () =>
    isSaving.value ||
    isLoading.value ||
    !canUpdateEntry.value ||
    !hasUnsavedChanges.value,
);
const entryActivityItems = computed(() => {
  if (revisionsEnabled.value && !entryRevisions.hasLoadedRevisions.value) {
    return [];
  }

  return buildCmsEntryActivityItems({
    revisions: revisionsEnabled.value ? entryRevisions.revisions.value : [],
    createdAt: createdAt.value,
    createdBy: formatEntryActor(
      createdByDisplayName.value || authorDisplayName.value,
    ),
    updatedAt: updatedAt.value,
    updatedBy: formatEntryActor(
      updatedByDisplayName.value || authorDisplayName.value,
    ),
    publishedAt: publishedAt.value,
    publishedBy: formatEntryActor(
      publishedByDisplayName.value || authorDisplayName.value,
    ),
    canRestore: canRestoreRevision.value,
    restoreForbiddenMessage: getForbiddenMessage("cms.revisions.restore"),
  });
});
const isLoading = computed(
  () => isCollectionLoading.value || isEntryLoading.value,
);
const loadError = computed(
  () => collectionLoadError.value ?? entryLoadError.value,
);
const previewEntry = computed(() =>
  activeEntryPreview.value?.id === resolvedEntryId.value ||
  activeEntryPreview.value?.slug === entrySlugOrId.value
    ? activeEntryPreview.value
    : null,
);
const shouldShowPreviewShell = computed(
  () => isLoading.value && previewEntry.value !== null,
);

function formatEntryMetaDate(value: string | null): string {
  if (!value) {
    return t("cms.notSet");
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatEntryActor(value: string): string {
  const display = formatCmsActorDisplay(value);
  return display === "Unknown user" ? "" : display;
}

watch(collection, (loaded) => {
  if (!loaded) return;
  const param = collectionParam.value;
  if (param && param !== loaded.name) {
    router.navigateTo(
      `/collections/${loaded.name}/entries/${entrySlugOrId.value}`,
    );
  }
});

watch(
  () =>
    [
      collectionId.value,
      entrySlugOrId.value,
      fields.value,
      routeLocale.value,
    ] as const,
  async ([
    activeCollectionId,
    activeEntrySlugOrId,
    activeFields,
    requestedLocale,
  ]) => {
    if (!activeCollectionId || !activeEntrySlugOrId) {
      resetForm();
      entryRevisions.resetRevisions();
      return;
    }

    const loaded = await loadEntry(
      activeCollectionId,
      activeEntrySlugOrId,
      activeFields,
      requestedLocale,
    );
    if (!loaded || !resolvedEntryId.value) {
      entryRevisions.resetRevisions();
      return;
    }

    entryRevisions.resetRevisions();
    if (revisionsEnabled.value) {
      void loadRevisionsIfNeeded(true);
    }

    const canonicalSlug = slug.value;
    const collectionName = collection.value?.name ?? collectionParam.value;
    if (
      canonicalSlug &&
      canonicalSlug !== activeEntrySlugOrId &&
      collectionName
    ) {
      router.navigateTo(
        `/collections/${collectionName}/entries/${canonicalSlug}?locale=${encodeURIComponent(activeLocaleCode.value)}`,
      );
    }
  },
  { immediate: true },
);

function handleBack(): void {
  const collectionName = collection.value?.name ?? collectionParam.value;
  router.navigateTo(`/collections/${collectionName}`);
}

function invalidateCurrentEntryCaches(): void {
  if (!collectionId.value) return;
  invalidateEntryMutationCaches(collectionId.value);
}

async function reloadActiveEntry(): Promise<void> {
  const lookup = resolvedEntryId.value || entrySlugOrId.value;
  if (!collectionId.value || !lookup) return;
  const loaded = await loadEntry(
    collectionId.value,
    lookup,
    fields.value,
    activeLocaleCode.value,
  );
  if (!loaded || !resolvedEntryId.value) return;
  if (revisionsEnabled.value && entryRevisions.hasLoadedRevisions.value) {
    await loadRevisionsIfNeeded(true);
  }
}

async function loadRevisionsIfNeeded(force = false): Promise<void> {
  if (!collectionId.value || !resolvedEntryId.value) return;
  if (!revisionsEnabled.value || !canListRevisions.value) {
    entryRevisions.resetRevisions();
    return;
  }
  if (!force && entryRevisions.hasLoadedRevisions.value) {
    return;
  }
  await entryRevisions.loadRevisions({
    collectionId: collectionId.value,
    entryId: resolvedEntryId.value,
  });
}

function handleActivityAction(itemId: string, actionId: string): void {
  if (actionId === "restore") {
    handleRestoreRevision(itemId);
  }
}

async function handleSave(): Promise<void> {
  if (!collectionId.value || !resolvedEntryId.value) return;
  if (!canUpdateEntry.value) {
    toast.error(getForbiddenMessage("cms.entries.update"));
    return;
  }
  const saved = await submitUpdate(
    collectionId.value,
    resolvedEntryId.value,
    fields.value,
    bodyEnabled.value,
  );
  if (saved) {
    invalidateCurrentEntryCaches();
    await reloadActiveEntry();
    const collectionName = collection.value?.name ?? collectionParam.value;
    if (collectionName && slug.value && slug.value !== entrySlugOrId.value) {
      router.navigateTo(
        `/collections/${collectionName}/entries/${slug.value}?locale=${encodeURIComponent(activeLocaleCode.value)}`,
      );
    }
  }
}

const showLocaleSwitcher = computed(() => availableLocales.value.length > 1);
const commentsSupported = computed(() => collection.value?.supports.includes("comments"));

function handleLocaleChange(value: unknown): void {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }
  switchActiveLocale(value, fields.value);
}

function currentRow(): CmsEntryRow | null {
  if (!collectionId.value || !resolvedEntryId.value || !version.value)
    return null;
  return {
    id: resolvedEntryId.value,
    collectionId: collectionId.value,
    title: title.value,
    slug: slug.value,
    status: status.value,
    version: version.value,
    locale: activeLocaleCode.value,
    updatedAt: updatedAt.value || new Date().toISOString(),
    publishedAt: publishedAt.value,
    createdAt: createdAt.value || new Date().toISOString(),
  };
}

async function handlePublishNow(): Promise<void> {
  if (status.value === "published" && hasUnsavedChanges.value) {
    if (!collectionId.value || !resolvedEntryId.value) return;
    if (!canUpdateEntry.value) {
      toast.error(getForbiddenMessage("cms.entries.update"));
      return;
    }
    const saved = await submitUpdate(
      collectionId.value,
      resolvedEntryId.value,
      fields.value,
      bodyEnabled.value,
      { showSuccessToast: false },
    );
    if (!saved) return;
    invalidateCurrentEntryCaches();
    const record = currentEntryRecord.value;
    if (record && canPublishEntry.value) {
      const republished = await entryActions.publishEntry(
        record,
        applyEntryRecord,
      );
      if (!republished) return;
    }
    await reloadActiveEntry();
    return;
  }

  await handlePublish();
}

async function handlePublish(scheduledFor?: string): Promise<void> {
  const record = currentEntryRecord.value;
  if (!record) return;
  if (!canPublishEntry.value) {
    toast.error(getForbiddenMessage("cms.entries.publish"));
    return;
  }
  const ok = scheduledFor
    ? await entryActions.scheduleEntry(record, scheduledFor, applyEntryRecord)
    : await entryActions.publishEntry(record, applyEntryRecord);
  if (ok) {
    invalidateCurrentEntryCaches();
    await reloadActiveEntry();
  }
}

async function handleReschedule(iso: string): Promise<void> {
  await handlePublish(iso);
}

async function handleCancelSchedule(): Promise<void> {
  await handleUnpublish();
}

function openPreview(): void {
  const reason = previewDisabledReason.value;
  if (reason) {
    toast.error(reason);
    return;
  }
  const url = previewUrl.value;
  if (!url) {
    toast.error(t("cms.previewUnavailable"));
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

async function handleUnpublish(): Promise<void> {
  const record = currentEntryRecord.value;
  if (!record) return;
  if (!canUnpublishEntry.value) {
    toast.error(getForbiddenMessage("cms.entries.unpublish"));
    return;
  }
  const ok = await entryActions.unpublishEntry(record, applyEntryRecord);
  if (ok) {
    invalidateCurrentEntryCaches();
    await reloadActiveEntry();
  }
}

async function handleArchive(): Promise<void> {
  const record = currentEntryRecord.value;
  if (!record) return;
  if (!canArchiveEntry.value) {
    toast.error(getForbiddenMessage("cms.entries.archive"));
    return;
  }
  const ok = await entryActions.archiveEntry(record, applyEntryRecord);
  if (ok) {
    invalidateCurrentEntryCaches();
    handleBack();
  }
}

function openDeleteDialog(): void {
  if (!canDeleteEntry.value) {
    toast.error(getForbiddenMessage("cms.entries.remove"));
    return;
  }
  isDeleteDialogOpen.value = true;
}

async function confirmDelete(): Promise<void> {
  const row = currentRow();
  if (!row) return;
  const ok = await entryActions.deleteEntry(row, () => {
    invalidateEntryMutationCaches(row.collectionId);
    isDeleteDialogOpen.value = false;
    handleBack();
  });
  if (!ok) {
    isDeleteDialogOpen.value = false;
  }
}

function handleRestoreRevision(revisionId: string): void {
  if (!collectionId.value || !resolvedEntryId.value || !version.value) return;
  if (!canRestoreRevision.value) {
    toast.error(getForbiddenMessage("cms.revisions.restore"));
    return;
  }

  pendingRestoreRevisionId.value = revisionId;
}

function handleRestoreRevisionDialogOpen(value: boolean): void {
  if (value || entryRevisions.isRestoringRevision.value) return;
  pendingRestoreRevisionId.value = null;
}

async function confirmRestoreRevision(): Promise<void> {
  const revisionId = pendingRestoreRevisionId.value;
  if (!collectionId.value || !resolvedEntryId.value || !version.value) return;
  if (!revisionId) return;
  if (!canRestoreRevision.value) {
    toast.error(getForbiddenMessage("cms.revisions.restore"));
    return;
  }

  const restored = await entryRevisions.restoreRevision({
    collectionId: collectionId.value,
    entryId: resolvedEntryId.value,
    revisionId,
    expectedVersion: version.value,
  });
  if (!restored) return;

  invalidateCurrentEntryCaches();
  pendingRestoreRevisionId.value = null;
  await reloadActiveEntry();
}
</script>

<template>
  <div class="flex h-full min-w-0 flex-col bg-background">
    <header
      class="flex min-w-0 shrink-0 items-center justify-between bg-background px-3 pt-3"
    >
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <Button
          variant="bread"
          size="icon"
          data-testid="collection-detail-back"
          @click="handleBack"
        >
          <span :class="[studioIcons.chevronLeft, 'size-4']" />
        </Button>
        <nav class="mb-0.5 flex min-w-0 items-center gap-2 text-sm">
          <button
            type="button"
            class="shrink-0 text-muted-foreground transition-colors hover:text-primary"
            @click="router.navigateTo('/collections')"
          >
            {{ t("collections.title") }}
          </button>
          <span class="shrink-0 text-muted-foreground/50">/</span>
          <button
            type="button"
            class="min-w-0 truncate text-muted-foreground transition-colors hover:text-primary"
            @click="handleBack"
          >
            {{ collection?.label ?? t("cms.collection") }}
          </button>
          <span class="shrink-0 text-muted-foreground/50">/</span>
          <span class="min-w-0 truncate text-sm font-medium text-foreground">
            {{ title || t("cms.entry") }}
          </span>
        </nav>
      </div>

      <div class="flex shrink-0 items-center">
        <div v-if="showLocaleSwitcher" class="mr-2 hidden shrink-0 sm:block">
          <Select
            :model-value="activeLocaleCode"
            @update:model-value="handleLocaleChange"
          >
            <SelectTrigger
              :class="[
                'h-8 w-[7.5rem] text-xs',
                isLocalizedVariant &&
                  'border-primary/60 bg-primary/10 text-primary',
              ]"
            >
              <SelectValue :placeholder="t('cms.locale')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="locale in availableLocales"
                :key="locale.code"
                :value="locale.code"
              >
                {{ locale.label }} ({{ locale.code }})
                <span v-if="locale.status === 'stale'">
                  · {{ t("cms.localeStale") }}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          v-if="
            (activeLocaleIsMissing || activeLocaleIsStale) && canUpdateEntry
          "
          variant="outline"
          size="sm"
          class="mr-2 h-8 gap-1.5"
          :disabled="isLoading"
          @click="generateActiveLocaleTranslation"
        >
          <span class="i-hugeicons:ai-magic size-3.5" />
          {{
            t(
              activeLocaleIsStale
                ? "cms.regenerateTranslation"
                : "cms.generateTranslation",
            )
          }}
        </Button>

        <Button
          v-if="missingLocaleCodes.length > 1 && canUpdateEntry"
          variant="ghost"
          size="sm"
          class="mr-2 hidden h-8 gap-1.5 lg:inline-flex"
          :disabled="isLoading || hasUnsavedChanges"
          @click="generateAllMissingTranslations"
        >
          {{ t("cms.generateAllTranslations") }}
        </Button>

        <div
          class="flex shrink-0 items-center gap-0 [&_[data-slot=button]:hover]:z-10 [&_[data-slot=button]:focus-visible]:z-10 [&_[data-slot=button][data-state=open]]:z-10"
        >
          <HeaderActionTooltip
            :label="previewDisabledReason ?? t('cms.entry.preview')"
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
              @click="handleSave"
            >
              <span
                v-if="isSaving"
                class="i-hugeicons:loading-01 size-3.5 shrink-0 animate-spin"
              />
              <span v-else :class="[studioIcons.save, 'size-3.5 shrink-0']" />
            </Button>
          </HeaderActionTooltip>

          <EntryPublishOverflowMenu
            :status="status"
            :can-schedule="canScheduleEntry"
            :can-unpublish="canUnpublishEntry"
            :can-archive="canArchiveEntry"
            :can-delete="canDeleteEntry"
            :is-busy="entryActions.isTransitioning.value"
            :is-deleting="entryActions.isDeleting.value"
            :scheduled-for="scheduledFor"
            :publish-disabled-reason="publishDisabledReason"
            :unpublish-forbidden-message="
              getForbiddenMessage('cms.entries.unpublish')
            "
            :archive-forbidden-message="
              getForbiddenMessage('cms.entries.archive')
            "
            :delete-forbidden-message="
              getForbiddenMessage('cms.entries.remove')
            "
            :schedule-forbidden-message="
              getForbiddenMessage('cms.entries.publish')
            "
            @schedule="handlePublish"
            @reschedule="handleReschedule"
            @cancel-schedule="handleCancelSchedule"
            @unpublish="handleUnpublish"
            @archive="handleArchive"
            @delete="openDeleteDialog"
          />
        </div>

        <div class="ml-2 flex shrink-0 items-center gap-1.5 pl-2">
          <PagePublishSplitButton
            :status="status"
            :is-modified-since-publish="hasUnsavedChanges"
            :can-publish="canPublishEntry"
            :is-busy="entryActions.isTransitioning.value"
            :scheduled-for="scheduledFor"
            :publish-disabled-reason="publishDisabledReason"
            @publish-now="handlePublishNow()"
          />
        </div>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-hidden">
      <div
        v-if="loadError"
        class="mx-7 mt-5 p-4 bg-destructive/10 rounded-sm border border-destructive/20"
      >
        <p class="text-2xs text-destructive">{{ loadError }}</p>
      </div>

      <div
        v-if="isLoading && !shouldShowPreviewShell"
        class="flex h-full items-center justify-center py-16"
      >
        <p class="text-sm text-muted-foreground">{{ t("cms.loadingEntry") }}</p>
      </div>

      <div v-else-if="shouldShowPreviewShell" class="h-full overflow-auto">
        <div
          class="mx-auto grid w-full max-w-[88rem] gap-8 px-5 py-6 md:px-7 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-10"
        >
          <main class="grid min-w-0 content-start gap-8">
            <section class="grid content-start gap-7">
              <div class="grid gap-2">
                <Label
                  for="edit-entry-title-preview"
                  class="text-sm! text-muted-foreground"
                  >{{ t("cms.title") }}</Label
                >
                <Input
                  id="edit-entry-title-preview"
                  :model-value="
                    previewEntry?.title || t('cms.entries.untitled')
                  "
                  disabled
                />
              </div>

              <div class="grid gap-2">
                <Label
                  for="edit-entry-slug-preview"
                  class="text-sm! text-muted-foreground"
                  >{{ t("cms.slug") }}</Label
                >
                <Input
                  id="edit-entry-slug-preview"
                  :model-value="previewEntry?.slug ?? ''"
                  disabled
                />
              </div>
            </section>
          </main>

          <aside
            class="grid min-w-0 content-start gap-6 xl:sticky xl:top-6 xl:self-start"
          >
            <section
              class="grid gap-3 border-b border-dashed border-border pb-5"
            >
              <div class="grid gap-2">
                <Label
                  for="edit-entry-status-preview"
                  class="text-sm! text-muted-foreground"
                  >{{ t("cms.status") }}</Label
                >
                <div
                  id="edit-entry-status-preview"
                  class="flex h-9 w-full items-center rounded-md border border-border bg-card/40 px-3 text-sm capitalize text-muted-foreground"
                >
                  {{ t(`cms.entry.status.${previewEntry?.status ?? "draft"}`) }}
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

      <div v-else class="h-full overflow-auto">
        <div
          :class="[
            'mx-auto grid w-full max-w-[88rem] gap-8 px-5 py-6 md:px-7 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-10',
            isLocalizedVariant && '[&_[data-slot=label]]:text-primary!',
          ]"
        >
          <main class="entry-form-container grid min-w-0 content-start gap-8">
            <section class="entry-form-grid content-start">
              <template v-for="item in mainEntryFormItems" :key="item.id">
                <div
                  v-if="item.kind === 'system' && item.key === 'title'"
                  :class="[getEntryFieldWidthClass(item.width), 'grid gap-2']"
                >
                  <Label
                    for="edit-entry-title"
                    class="text-sm! text-muted-foreground"
                    >{{ t("cms.title") }}</Label
                  >
                  <Input
                    id="edit-entry-title"
                    v-model="title"
                    :disabled="!canUpdateEntry"
                    :class="errors.title ? 'border-destructive' : ''"
                    @input="updateSlugFromTitle"
                  />
                  <p v-if="errors.title" class="text-xs text-destructive">
                    {{ errors.title }}
                  </p>
                </div>

                <div
                  v-else-if="item.kind === 'system' && item.key === 'slug'"
                  :class="[getEntryFieldWidthClass(item.width), 'grid gap-2']"
                >
                  <Label
                    for="edit-entry-slug"
                    class="text-sm! text-muted-foreground"
                    >{{ t("cms.slug") }}</Label
                  >
                  <Input
                    id="edit-entry-slug"
                    v-model="slug"
                    :disabled="!canUpdateEntry"
                    :class="errors.slug ? 'border-destructive' : ''"
                    @input="markSlugEdited"
                    @blur="
                      void checkSlugAvailability(collectionId, resolvedEntryId)
                    "
                  />
                  <p v-if="!isSlugEdited" class="text-xs text-muted-foreground">
                    {{ t("cms.entry.slugHint") }}
                  </p>
                </div>

                <div
                  v-else-if="item.kind === 'system' && item.key === 'body'"
                  :class="[getEntryFieldWidthClass(item.width), 'grid gap-2']"
                >
                  <Label
                    for="edit-entry-body"
                    class="text-sm! text-muted-foreground"
                    >{{ t("cms.body") }}</Label
                  >
                  <StructuredTextEditor
                    id="edit-entry-body"
                    v-model="bodyDocument"
                    :disabled="!canUpdateEntry"
                    min-height-class="min-h-96"
                  />
                  <p v-if="errors.body" class="text-xs text-destructive">
                    {{ errors.body }}
                  </p>
                </div>

                <CmsFrontmatterField
                  v-else-if="item.kind === 'frontmatter'"
                  v-model="frontmatterDraft[item.field.key]"
                  :field="item.field"
                  :disabled="!canUpdateEntry"
                  :error="errors[item.field.key]"
                  :class="getEntryFieldWidthClass(item.width)"
                />

                <CmsRelationField
                  v-else-if="item.kind === 'relation'"
                  v-model="relationDraft[item.field.key]"
                  :field="item.field"
                  :disabled="!canUpdateEntry"
                  :class="getEntryFieldWidthClass(item.width)"
                />
              </template>

              <p
                v-if="errors.frontmatter"
                class="entry-field-width-full text-xs text-destructive"
              >
                {{ errors.frontmatter }}
              </p>
            </section>
          </main>

          <aside
            class="grid min-w-0 content-start gap-6 xl:sticky xl:top-6 xl:self-start"
          >
            <section v-if="sidebarEntryFormItems.length > 0" class="grid gap-7">
              <template v-for="item in sidebarEntryFormItems" :key="item.id">
                <CmsFrontmatterField
                  v-if="item.kind === 'frontmatter'"
                  v-model="frontmatterDraft[item.field.key]"
                  :field="item.field"
                  :disabled="!canUpdateEntry"
                  :error="errors[item.field.key]"
                />
                <CmsRelationField
                  v-else-if="item.kind === 'relation'"
                  v-model="relationDraft[item.field.key]"
                  :field="item.field"
                  :disabled="!canUpdateEntry"
                />
              </template>
            </section>

            <section v-if="commentsSupported" class="rounded-lg border p-4">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="m-0 text-sm font-medium text-foreground">Comments</p>
                  <p class="m-0 mt-1 text-xs text-muted-foreground">Close discussion for this {{ activeLocaleCode }} entry locale.</p>
                </div>
                <Switch v-model="commentsClosed" :disabled="!canUpdateEntry" />
              </div>
            </section>

            <ActivityTimeline
              :items="entryActivityItems"
              :is-loading="
                revisionsEnabled &&
                entryRevisions.isLoadingRevisions.value &&
                !entryRevisions.hasLoadedRevisions.value
              "
              :error="entryRevisions.revisionError.value"
              @action="handleActivityAction"
            />
          </aside>
        </div>
      </div>
    </div>

    <DeleteEntryDialog
      :open="isDeleteDialogOpen"
      :title="title"
      :is-deleting="entryActions.isDeleting.value"
      @update:open="isDeleteDialogOpen = $event"
      @confirm="confirmDelete"
    />
    <RestoreEntryRevisionDialog
      :open="isRestoreRevisionDialogOpen"
      :is-restoring="entryRevisions.isRestoringRevision.value"
      @update:open="handleRestoreRevisionDialogOpen"
      @confirm="confirmRestoreRevision"
    />
  </div>
</template>

<style scoped>
.entry-form-container {
  container-type: inline-size;
}

.entry-form-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: 1.5rem;
  row-gap: 1.75rem;
}

.entry-form-grid > * {
  grid-column: span 12;
  min-width: 0;
}

@container (min-width: 48rem) {
  .entry-form-grid > .entry-field-width-half {
    grid-column: span 6;
  }

  .entry-form-grid > .entry-field-width-third {
    grid-column: span 4;
  }

  .entry-form-grid > .entry-field-width-quarter {
    grid-column: span 3;
  }
}
</style>
