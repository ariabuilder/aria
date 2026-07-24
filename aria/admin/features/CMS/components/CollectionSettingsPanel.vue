<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { IconPickerDialog } from "@/components/ui/icon-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/features/Studio/core/components";
import DeleteConfirmDialog from "@/features/Studio/core/components/DeleteConfirmDialog.vue";
import { handleActionResultForbidden } from "@/lib/actionErrors";
import { useBuilderData } from "@/composables/useBuilderData";
import { useStudioRouter } from "@/features/Studio/core/composables";
import {
  AriaCollectionSchema,
  type AriaCollection,
  type UpdateCollectionRequestSchema,
} from "../../../../lib/cms/schemas";
import { validateCmsCollectionRouteSafety } from "../../../../lib/cms/routeSafety";
import { useCmsCapabilities } from "../composables/useCmsCapabilities";
import { useCollectionIcons } from "../composables/useCollectionIcons";
import { fetchCollections } from "../composables/useCmsDataCache";
import { useCollectionsList } from "../composables/useCollectionsList";
import CmsCollectionIconPreview from "./CmsCollectionIconPreview.vue";
import CollectionPublishingSection from "./CollectionPublishingSection.vue";
import { COLLECTION_KIND_OPTIONS } from "../lib/collectionKindOptions";
import { COLLECTION_SCOPE_OPTIONS } from "../lib/collectionScopeOptions";
import {
  buildCollectionSettingsUpdate,
  COLLECTION_SUPPORT_OPTIONS,
  createCollectionSettingsDraft,
  deriveInitialUrlPatternSource,
  resolveCollectionSettingsUrlPattern,
  syncUrlPatternForTemplatePage,
  CmsUrlPatternSourceSchema,
  type CmsCollectionSettingsErrors,
  type CmsUrlPatternSource,
} from "../lib/collectionSettingsForm";
import { suggestCollectionUrlPattern } from "../../../../lib/cms/routing";
import { StoredPageSystemRoleSchema } from "../../../../lib/storage/adapter";
import { withCmsActionTimeout } from "../lib/actionTimeout";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  collection: AriaCollection;
  embedded?: boolean;
}>();

const PageOptionSchema = z
  .object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    systemRole: StoredPageSystemRoleSchema.optional(),
    parent: z.string().trim().min(1).nullable().optional(),
  })
  .strict();
const PageSelectionFieldSchema = z.enum(["templatePageId", "listPageId"]);
type PageSelectionField = z.infer<typeof PageSelectionFieldSchema>;
type CollectionSettingsPatch = z.infer<
  typeof UpdateCollectionRequestSchema
>["patch"];
type CollectionReassignmentImpact = {
  field: PageSelectionField;
  roleLabel: string;
  previousPageId: string;
  nextPageId: string;
};

const emit = defineEmits<{
  updated: [collection: AriaCollection];
}>();

const { canUpdateCollection, getForbiddenMessage } = useCmsCapabilities();
const router = useStudioRouter();
const { t } = useStudioI18n();

function initializeDraftFromCollection(collection: AriaCollection): void {
  draft.value = createCollectionSettingsDraft(collection);
  urlPatternSource.value = deriveInitialUrlPatternSource(collection);
  const synced = syncUrlPatternForTemplatePage({
    collection,
    draft: draft.value,
    source: urlPatternSource.value,
  });
  draft.value.urlPattern = synced.urlPattern;
  urlPatternSource.value = synced.source;
  errors.value = {};
}

const draft = ref(createCollectionSettingsDraft(props.collection));
const urlPatternSource = ref<CmsUrlPatternSource>("auto");
const errors = ref<CmsCollectionSettingsErrors>({});
const isSaving = ref(false);
const isIconPickerOpen = ref(false);
const { getCollectionIcon } = useCollectionIcons();
const { pages, refreshPagesNow } = useBuilderData();
const { upsertCollectionSummary } = useCollectionsList();
const routingCollections = ref<AriaCollection[]>([]);
const routeWarningLoadError = ref<string | null>(null);
const pendingReassignmentImpact = ref<CollectionReassignmentImpact | null>(null);

function nullableTrimmed(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function localizedError(error: string | undefined): string {
  if (!error) return "";
  if (error === "Label is required") return t("collections.settings.error.labelRequired");
  if (error === "URL pattern must start with /") return t("collections.settings.error.urlStart");
  if (error === "URL pattern must include {slug}") return t("collections.settings.error.urlSlug");
  if (error === "URL pattern is invalid") return t("collections.settings.error.urlInvalid");
  return error;
}

function hasSameSupports(
  left: readonly string[] = [],
  right: readonly string[] = [],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const rightValues = new Set(right);
  return left.every((value) => rightValues.has(value));
}

function collectionSettingsPatchIsUnchanged(
  collection: AriaCollection,
  patch: CollectionSettingsPatch,
): boolean {
  const parsedCollection = AriaCollectionSchema.parse(collection);

  return (
    patch.label === parsedCollection.label &&
    patch.kind === parsedCollection.kind &&
    patch.scope === parsedCollection.scope &&
    nullableTrimmed(patch.icon) ===
      nullableTrimmed(parsedCollection.schema.icon ?? null) &&
    nullableTrimmed(patch.urlPattern) ===
      nullableTrimmed(parsedCollection.urlPattern) &&
    nullableTrimmed(patch.templatePageId) ===
      nullableTrimmed(parsedCollection.templatePageId) &&
    nullableTrimmed(patch.listPageId) ===
      nullableTrimmed(parsedCollection.listPageId) &&
    (patch.navigation?.showInSidebar ?? true) ===
      (parsedCollection.schema.navigation?.showInSidebar ?? true) &&
    hasSameSupports(patch.supports ?? [], parsedCollection.supports)
  );
}

initializeDraftFromCollection(props.collection);

const pageOptions = computed(() =>
  z
    .array(PageOptionSchema)
    .parse(
      pages.value
        .map((page) => ({
          id: page.id,
          label: page.title || page.slug,
          slug: page.slug,
          systemRole: page.systemRole,
          parent: page.parent ?? null,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    ),
);

function pageHasChildPages(slug: string): boolean {
  return pages.value.some((page) => page.parent === slug);
}

const listPageOptions = computed(() =>
  pageOptions.value.filter(
    (page) =>
      page.slug !== "index" &&
      page.systemRole !== "cms-entry" &&
      page.systemRole !== "not-found",
  ),
);

const entryPageOptions = computed(() =>
  pageOptions.value.filter(
    (page) =>
      page.slug !== "index" &&
      page.systemRole !== "cms-collection" &&
      page.systemRole !== "not-found" &&
      !pageHasChildPages(page.slug),
  ),
);
const selectedTemplatePage = computed(
  () =>
    pages.value.find((page) => page.id === draft.value.templatePageId) ?? null,
);
const selectedListPage = computed(
  () => pages.value.find((page) => page.id === draft.value.listPageId) ?? null,
);
const suggestedUrlPattern = computed(() =>
  suggestCollectionUrlPattern({ collectionName: props.collection.name }),
);
const resolvedEntryUrlPattern = computed(() =>
  resolveCollectionSettingsUrlPattern(props.collection, draft.value),
);
const listPathHint = computed(() => {
  const slug = selectedListPage.value?.slug?.trim();
  if (!slug) return "";
  return slug === "index" ? "/" : `/${slug}`;
});
const entryPathHint = computed(() => {
  const pattern = resolvedEntryUrlPattern.value.trim();
  if (pattern) return pattern;
  if (!draft.value.templatePageId.trim()) return "";
  return suggestedUrlPattern.value;
});
const routeWarningPages = computed(() =>
  pages.value.map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title || page.slug,
    parent: page.parent ?? null,
    systemRole: page.systemRole,
  })),
);
const draftCollectionForWarnings = computed(() =>
  AriaCollectionSchema.parse({
    ...props.collection,
    label: draft.value.label.trim() || props.collection.label,
    kind: draft.value.kind,
    scope: draft.value.scope,
    schema: {
      ...props.collection.schema,
      icon: draft.value.iconName.trim() || undefined,
      navigation: {
        showInSidebar: draft.value.showInSidebar,
      },
    },
    urlPattern:
      (urlPatternSource.value === "manual"
        ? draft.value.urlPattern.trim()
        : resolveCollectionSettingsUrlPattern(props.collection, draft.value)) ||
      null,
    templatePageId: draft.value.templatePageId.trim() || null,
    listPageId: draft.value.listPageId.trim() || null,
  }),
);
const routeWarnings = computed(() => {
  const result = validateCmsCollectionRouteSafety({
    collection: draftCollectionForWarnings.value,
    collections:
      routingCollections.value.length > 0
        ? routingCollections.value.map((collection) =>
            collection.id === props.collection.id
              ? draftCollectionForWarnings.value
              : collection,
          )
        : [draftCollectionForWarnings.value],
    pages: routeWarningPages.value,
    mode: "update",
  });
  return [...result.blocking, ...result.advisory];
});
const isReassignDialogOpen = computed(
  () => pendingReassignmentImpact.value !== null,
);
const reassignmentDescription = computed(() => {
  const impact = pendingReassignmentImpact.value;
  if (!impact) {
    return t("collections.settings.reassignFallback");
  }

  return t("collections.settings.reassignDescription", {
    collection: props.collection.label,
    previous: pageLabel(impact.previousPageId),
    role: impact.roleLabel,
    next: pageLabel(impact.nextPageId),
  });
});

watch(
  () => props.collection,
  (collection) => {
    initializeDraftFromCollection(collection);
  },
);

async function loadRoutingCollections(): Promise<void> {
  routeWarningLoadError.value = null;
  try {
    const data = await fetchCollections();
    routingCollections.value = z.array(AriaCollectionSchema).parse(
      data.collections,
    );
  } catch (err) {
    routeWarningLoadError.value =
      err instanceof Error ? err.message : "Unable to load route warnings";
    routingCollections.value = [props.collection];
  }
}

onMounted(() => {
  void loadRoutingCollections();
});

async function persistSettings(
  options: { showSuccessToast?: boolean; skipWhenUnchanged?: boolean } = {},
): Promise<AriaCollection | null> {
  if (!canUpdateCollection.value) {
    toast.error(getForbiddenMessage("cms.collections.update"));
    return null;
  }

  errors.value = {};
  const result = buildCollectionSettingsUpdate(props.collection, draft.value);
  if (!result.success) {
    errors.value = result.errors;
    return null;
  }

  if (
    options.skipWhenUnchanged &&
    collectionSettingsPatchIsUnchanged(props.collection, result.payload.patch)
  ) {
    return props.collection;
  }

  isSaving.value = true;
  try {
    const { data, error } = await withCmsActionTimeout(
      actions.cms.collections.update(result.payload),
      "Update collection",
    );
    if (error) {
      if (handleActionResultForbidden({ error }, "cms.collections.update")) {
        return null;
      }
      toast.error(error.message ?? "Failed to update collection");
      return null;
    }

    const collection = AriaCollectionSchema.parse(data);
    routingCollections.value = routingCollections.value.map((existing) =>
      existing.id === collection.id ? collection : existing,
    );
    upsertCollectionSummary(collection);
    emit("updated", collection);
    // Assigning a list/entry page here auto-syncs that page's type on the
    // server (see lib/cms/services/collections.ts) — refresh so the page
    // picker and any open page views reflect the new role immediately.
    await refreshPagesNow();
    if (options.showSuccessToast) {
      toast.success(t("collections.settings.updated"));
    }
    return collection;
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : "Failed to update collection",
    );
    return null;
  } finally {
    isSaving.value = false;
  }
}

async function saveSettings(): Promise<void> {
  const impact = getReassignmentImpact();
  if (impact) {
    pendingReassignmentImpact.value = impact;
    return;
  }

  await persistSettings({ showSuccessToast: true });
}

async function confirmReassignment(): Promise<void> {
  await persistSettings({ showSuccessToast: true });
  pendingReassignmentImpact.value = null;
}

function closeReassignmentDialog(open: boolean): void {
  if (!open) {
    pendingReassignmentImpact.value = null;
  }
}

function pageLabel(pageId: string): string {
  const page = pages.value.find((entry) => entry.id === pageId);
  return page?.title || page?.slug || t("collections.settings.anotherPage");
}

function getReassignmentImpact(): CollectionReassignmentImpact | null {
  const currentListPageId = props.collection.listPageId?.trim() || "";
  const nextListPageId = draft.value.listPageId.trim();
  if (
    currentListPageId &&
    nextListPageId &&
    currentListPageId !== nextListPageId
  ) {
    return {
      field: "listPageId",
      roleLabel: t("collections.publishing.listTemplate").toLocaleLowerCase(),
      previousPageId: currentListPageId,
      nextPageId: nextListPageId,
    };
  }

  const currentTemplatePageId = props.collection.templatePageId?.trim() || "";
  const nextTemplatePageId = draft.value.templatePageId.trim();
  if (
    currentTemplatePageId &&
    nextTemplatePageId &&
    currentTemplatePageId !== nextTemplatePageId
  ) {
    return {
      field: "templatePageId",
      roleLabel: t("collections.publishing.entryPage").toLocaleLowerCase(),
      previousPageId: currentTemplatePageId,
      nextPageId: nextTemplatePageId,
    };
  }

  return null;
}

function handleIconSelect(icon: string): void {
  draft.value.iconName = icon || "i-hugeicons:file-01";
}

function handlePageSelection(field: PageSelectionField, value: string): void {
  const parsedField = PageSelectionFieldSchema.parse(field);
  const parsedValue = z.string().parse(value);
  draft.value[parsedField] = parsedValue;

  if (parsedField !== "templatePageId") {
    return;
  }

  const synced = syncUrlPatternForTemplatePage({
    collection: props.collection,
    draft: draft.value,
    source: urlPatternSource.value,
  });
  draft.value.urlPattern = synced.urlPattern;
  urlPatternSource.value = synced.source;
}

function handleListPageIdUpdate(value: string): void {
  handlePageSelection("listPageId", value);
}

function handleTemplatePageIdUpdate(value: string): void {
  handlePageSelection("templatePageId", value);
}

function handleUrlPatternInput(value: string): void {
  draft.value.urlPattern = value;
  urlPatternSource.value = CmsUrlPatternSourceSchema.parse("manual");
}

function handleResetUrlPatternToAuto(): void {
  urlPatternSource.value = CmsUrlPatternSourceSchema.parse("auto");
  const synced = syncUrlPatternForTemplatePage({
    collection: props.collection,
    draft: draft.value,
    source: urlPatternSource.value,
  });
  draft.value.urlPattern = synced.urlPattern;
  urlPatternSource.value = synced.source;
}

async function openSelectedPage(slug: string): Promise<void> {
  const parsedSlug = z.string().trim().min(1).parse(slug);
  const savedCollection = await persistSettings({ skipWhenUnchanged: true });
  if (!savedCollection) return;
  router.startEditing("page", parsedSlug);
}

</script>

<template>
  <div :class="embedded ? 'grid gap-5 pb-6' : 'h-full overflow-auto'">
    <PageHeader
      v-if="!embedded"
      :title="t('collections.settings.title')"
      :description="`${collection.name} collection`"
      entity-label-singular="setting"
      :hide-create="true"
      :hide-search="true"
    >
      <template #actions>
        <Button
          size="md"
          :disabled="isSaving || !canUpdateCollection"
          :title="
            canUpdateCollection
              ? t('collections.settings.save')
              : getForbiddenMessage('cms.collections.update')
          "
          @click="saveSettings"
        >
          {{ isSaving ? t("common.saving") : t("collections.settings.save") }}
        </Button>
      </template>
    </PageHeader>

    <div
      v-else
      class="flex min-w-0 items-center justify-between gap-4 mb-3"
    >
      <div class="min-w-0">
        <h2 class="m-0 text-lg font-medium text-foreground">{{ t("collections.settings.title") }}</h2>
        <p class="m-0 mt-1 text-sm text-muted-foreground">
          {{ t("collections.settings.description") }}
        </p>
      </div>
      <Button
        size="md"
        class="shrink-0"
        :disabled="isSaving || !canUpdateCollection"
        :title="
          canUpdateCollection
            ? t('collections.settings.save')
            : getForbiddenMessage('cms.collections.update')
        "
        @click="saveSettings"
      >
        {{ isSaving ? t("common.saving") : t("collections.settings.save") }}
      </Button>
    </div>

    <div
      :class="
        embedded
          ? 'grid gap-7'
          : 'grid gap-7 px-7 py-7 max-w-3xl'
      "
    >
      <section class="grid gap-8">
        <div class="grid gap-2">
          <Label for="collection-settings-label" class="text-sm! text-muted-foreground">{{ t("collections.settings.collectionName") }}</Label>
          <div class="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              class="h-9! w-9! shrink-0"
              :disabled="isSaving || !canUpdateCollection"
              @click="isIconPickerOpen = true"
            >
              <CmsCollectionIconPreview
                :value="getCollectionIcon(draft.iconName)"
                class="size-5"
              />
            </Button>
            <Input
              id="collection-settings-label"
              v-model="draft.label"
              :disabled="isSaving || !canUpdateCollection"
              :aria-invalid="errors.label ? 'true' : undefined"
            />
          </div>
          <p v-if="errors.label" class="text-xs text-destructive">
            {{ localizedError(errors.label) }}
          </p>
        </div>
      </section>

      <CollectionPublishingSection
        class=""
        :list-page-id="draft.listPageId"
        :template-page-id="draft.templatePageId"
        :url-pattern="draft.urlPattern"
        :url-pattern-source="urlPatternSource"
        :suggested-url-pattern="suggestedUrlPattern"
        :list-page-options="listPageOptions"
        :entry-page-options="entryPageOptions"
        :selected-list-page="selectedListPage"
        :selected-template-page="selectedTemplatePage"
        :list-path-hint="listPathHint"
        :entry-path-hint="entryPathHint"
        :route-warnings="routeWarnings"
        :route-warning-load-error="routeWarningLoadError"
        :url-pattern-error="localizedError(errors.urlPattern)"
        :collection-kind="draft.kind"
        :disabled="isSaving || !canUpdateCollection"
        @update:list-page-id="handleListPageIdUpdate"
        @update:template-page-id="handleTemplatePageIdUpdate"
        @update:url-pattern="handleUrlPatternInput"
        @reset-url-pattern-to-auto="handleResetUrlPatternToAuto"
        @edit-page-in-composer="openSelectedPage"
      />

      <section class="grid gap-7">
        <div class="grid gap-2">
          <Label class="text-sm! text-muted-foreground">{{ t("collections.settings.kind") }}</Label>
          <div class="grid grid-cols-1 items-start gap-3 sm:grid-cols-4">
            <button
              v-for="option in COLLECTION_KIND_OPTIONS"
              :key="option.value"
              type="button"
              :disabled="isSaving || !canUpdateCollection"
              :class="[
                'group flex min-h-20 w-full flex-col items-start justify-start rounded-md border border-dashed p-3 text-left transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-60',
                draft.kind === option.value
                  ? 'border-primary bg-input text-foreground shadow-xs dark:shadow-none'
                  : 'border-border bg-card/40 border-solid text-muted-foreground hover:border-primary/60 hover:bg-input/60 hover:text-foreground',
              ]"
              @click="draft.kind = option.value"
            >
              <div class="flex w-full items-start gap-3">
                <span
                  class="inline-flex size-4 shrink-0 items-center justify-center leading-none"
                >
                  <span
                    :class="[
                      option.icon,
                      'size-4',
                      draft.kind === option.value
                        ? 'text-primary'
                        : 'text-muted-foreground/60 group-hover:text-primary/80',
                    ]"
                  />
                </span>
                <span class="min-w-0">
                  <span class="block text-sm font-medium">
                    {{ t(`collections.kind.${option.value}`) }}
                  </span>
                  <span
                    class="mt-1 block text-xs text-balance leading-snug text-muted-foreground"
                  >
                    {{ t(`collections.kind.${option.value}Description`) }}
                  </span>
                </span>
              </div>
            </button>
          </div>
        </div>

        <div class="grid gap-2">
          <Label class="text-sm! text-muted-foreground">{{ t("collections.settings.scope") }}</Label>
          <div
            class="grid grid-cols-1 items-start gap-3 sm:grid-cols-2"
            role="radiogroup"
            :aria-label="t('collections.settings.scopeAria')"
          >
            <button
              v-for="option in COLLECTION_SCOPE_OPTIONS"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="draft.scope === option.value"
              :disabled="isSaving || !canUpdateCollection"
              :class="[
                'group flex min-h-14 w-full flex-col items-start justify-start rounded-md border border-dashed p-3 text-left transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-60',
                draft.scope === option.value
                  ? 'border-primary bg-input text-foreground shadow-xs dark:shadow-none'
                  : 'border-border bg-card/40 text-muted-foreground hover:border-primary/60 hover:bg-input/60 hover:text-foreground',
              ]"
              @click="draft.scope = option.value"
            >
              <div class="flex w-full items-start gap-3">
                <span
                  class="inline-flex size-4 shrink-0 items-center justify-center leading-none"
                >
                  <span
                    :class="[
                      option.icon,
                      'size-4',
                      draft.scope === option.value
                        ? 'text-primary'
                        : 'text-muted-foreground/60 group-hover:text-primary/80',
                    ]"
                  />
                </span>
                <span class="min-w-0">
                  <span class="block text-sm font-medium">
                    {{ t(`collections.scope.${option.value === 'collection' ? 'local' : option.value}`) }}
                  </span>
                  <span
                    class="mt-1 block text-xs text-balance leading-snug text-muted-foreground"
                  >
                    {{ t(`collections.scope.${option.value === 'collection' ? 'local' : option.value}Description`) }}
                  </span>
                </span>
              </div>
            </button>
          </div>
        </div>

        <div
          class="flex items-center justify-between gap-4 rounded-md border border-border bg-card/40 px-4 py-3"
        >
          <div class="min-w-0">
            <p class="m-0 text-sm font-medium text-foreground">
              {{ t("collections.settings.showInSidebar") }}
            </p>
            <p class="m-0 mt-1 text-xs text-muted-foreground">
              {{ t("collections.settings.showInSidebarDescription") }}
            </p>
          </div>
          <Switch
            :model-value="draft.showInSidebar"
            :disabled="isSaving || !canUpdateCollection"
            @update:model-value="
              (value: boolean) => (draft.showInSidebar = value)
            "
          />
        </div>

        <div class="grid gap-3">
          <Label class="text-sm! text-muted-foreground">{{ t("collections.settings.supports") }}</Label>
          <div class="grid gap-2 sm:grid-cols-4">
            <label
              v-for="option in COLLECTION_SUPPORT_OPTIONS"
              :key="option.value"
              class="flex items-center gap-3 text-sm! text-muted-foreground cursor-pointer"
            >
              <Checkbox
                v-model="draft.supports[option.value]"
                :disabled="isSaving || !canUpdateCollection"
              />
              {{ t(`collections.support.${option.value}`) }}
            </label>
          </div>
        </div>

        <div v-if="draft.supports.rss" class="grid gap-3 rounded-lg border p-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <Label>Enable public RSS feed</Label>
              <p class="m-0 mt-1 text-xs text-muted-foreground">Published, publicly routable entries only.</p>
            </div>
            <Switch v-model="draft.rss.enabled" :disabled="isSaving || !canUpdateCollection" />
          </div>
          <div v-if="draft.rss.enabled" class="grid gap-3 sm:grid-cols-2">
            <div class="grid gap-1.5">
              <Label>Feed title</Label>
              <Input v-model="draft.rss.title" :disabled="isSaving || !canUpdateCollection" maxlength="180" />
            </div>
            <div class="grid gap-1.5">
              <Label>Item limit</Label>
              <Input v-model.number="draft.rss.itemLimit" type="number" min="1" max="100" :disabled="isSaving || !canUpdateCollection" />
            </div>
            <div class="grid gap-1.5 sm:col-span-2">
              <Label>Feed description</Label>
              <Input v-model="draft.rss.description" :disabled="isSaving || !canUpdateCollection" maxlength="1000" />
            </div>
          </div>
        </div>

        <div v-if="draft.supports.comments" class="grid gap-3 rounded-lg border p-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <Label>Enable public comments</Label>
              <p class="m-0 mt-1 text-xs text-muted-foreground">Authenticated visitors can submit comments on published entry locales. New comments require moderation.</p>
            </div>
            <Switch v-model="draft.comments.enabled" :disabled="isSaving || !canUpdateCollection" />
          </div>
        </div>

      </section>

    </div>

    <DeleteConfirmDialog
      :open="isReassignDialogOpen"
      :title="t('collections.settings.reassignTitle')"
      :description="reassignmentDescription"
      :item-name="collection.label"
      :is-loading="isSaving"
      :confirm-label="t('collections.settings.reassignConfirm')"
      @update:open="closeReassignmentDialog"
      @confirm="confirmReassignment"
    />
    <IconPickerDialog
      v-model:open="isIconPickerOpen"
      :title="t('collections.settings.selectIcon')"
      :description="t('collections.settings.selectIconDescription')"
      :value="draft.iconName"
      @select="handleIconSelect"
    />
  </div>
</template>
