<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AriaCollection, CmsEntryAutosave } from "../../../../lib/cms/schemas";
import { useCmsCapabilities } from "../composables/useCmsCapabilities";
import { useCmsEntryActions } from "../composables/useCmsEntryActions";
import { useEditEntryForm } from "../composables/useEditEntryForm";
import { useEntryRevisions } from "../composables/useEntryRevisions";
import type { CmsEntryRow } from "../lib/entryRow";
import CmsFrontmatterField from "../components/CmsFrontmatterField.vue";
import EntryRevisionsPanel from "../components/EntryRevisionsPanel.vue";
import CmsEntryReviewPanel from "../components/CmsEntryReviewPanel.vue";
import CmsEntryAutosaveRecoveryPanel from "../components/CmsEntryAutosaveRecoveryPanel.vue";
import CmsEntryCollaborationPanel from "../components/CmsEntryCollaborationPanel.vue";
import StructuredTextEditor from "../components/StructuredTextEditor.vue";
import {
  collectionSupportsBody,
  collectionSupportsRevisions,
  collectionSupportsScheduling,
} from "../lib/collectionBodySupport";
import PublishScheduleControl from "@/features/Publishing/components/PublishScheduleControl.vue";
import { invalidateEntryMutationCaches } from "../composables/useCmsDataCache";
import { editableCmsFields } from "../lib/frontmatterForm";
import DeleteEntryDialog from "./DeleteEntryDialog.vue";
import RestoreEntryRevisionDialog from "./RestoreEntryRevisionDialog.vue";
import { useStudioI18n } from "@/i18n";

interface Props {
  open: boolean;
  collection: AriaCollection | null;
  entryId: string | null;
}

const props = defineProps<Props>();
const { t } = useStudioI18n();

const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
  deleted: [];
}>();

const {
  canUpdateEntry,
  canPublishEntry,
  canUnpublishEntry,
  canArchiveEntry,
  canDeleteEntry,
  canListRevisions,
  canRestoreRevision,
  canCompareRevisions,
  canReviewCmsEntry,
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
  activeLocaleCode,
  isLocalizedVariant,
  availableLocales,
  version,
  scheduledFor,
  isLoading,
  isSaving,
  hasUnsavedChanges,
  loadError,
  errors,
  resolvedEntryId,
  loadEntry,
  switchActiveLocale,
  checkSlugAvailability,
  markSlugEdited,
  applyEntryRecord,
  resetForm,
  submitUpdate,
} = useEditEntryForm();

const entryActions = useCmsEntryActions();
const entryRevisions = useEntryRevisions();
const isDeleteDialogOpen = ref(false);
const pendingRestoreRevisionId = ref<string | null>(null);
const recoverableAutosave = ref<CmsEntryAutosave | null>(null);
const isLoadingAutosave = ref(false);
const autosaveSequence = ref(0);
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
const isRestoreRevisionDialogOpen = computed(
  () => pendingRestoreRevisionId.value !== null,
);

const collectionId = computed(() => props.collection?.id ?? null);
const bodyEnabled = computed(() => collectionSupportsBody(props.collection));
const schedulingEnabled = computed(() =>
  collectionSupportsScheduling(props.collection),
);
const revisionsEnabled = computed(() =>
  collectionSupportsRevisions(props.collection),
);
const fields = computed(() => props.collection?.schema.fields ?? []);
const editableFields = computed(() => editableCmsFields(fields.value));
const showLocaleSwitcher = computed(() => availableLocales.value.length > 1);
const editableStatuses = computed(() => ["draft", "archived"] as const);
const canScheduleEntry = computed(
  () => canPublishEntry.value && schedulingEnabled.value,
);
const publishDisabledReason = computed(() => {
  if (!canPublishEntry.value) {
    return getForbiddenMessage("cms.entries.publish");
  }
  return null;
});

watch(
  () => [props.open, collectionId.value, props.entryId] as const,
  ([isOpen, activeCollectionId, entryId]) => {
    if (!isOpen || !activeCollectionId || !entryId) {
      entryRevisions.resetRevisions();
      return;
    }
    entryRevisions.resetRevisions();
    void loadEntry(activeCollectionId, entryId, fields.value).then((loaded) => {
      if (loaded && revisionsEnabled.value) {
        void loadRevisionsIfNeeded(true);
      }
      if (loaded) void loadRecoverableAutosave();
    });
  },
  { immediate: true },
);

function closeDrawer(): void {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  recoverableAutosave.value = null;
  resetForm();
  entryRevisions.resetRevisions();
  pendingRestoreRevisionId.value = null;
  emit("update:open", false);
}

function autosavePayload(): Record<string, unknown> {
  return {
    title: title.value,
    slug: slug.value,
    status: status.value,
    bodyDocument: bodyDocument.value,
    commentsClosed: commentsClosed.value,
    frontmatterDraft: frontmatterDraft.value,
    relationDraft: relationDraft.value,
  };
}

function autosaveChecksum(payload: Record<string, unknown>): string {
  const source = JSON.stringify(payload);
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ (code + index), 0x85ebca6b);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}

async function loadRecoverableAutosave(): Promise<void> {
  if (!props.open || !collectionId.value || !resolvedEntryId.value || !version.value) return;
  isLoadingAutosave.value = true;
  try {
    const result = await actions.cms.workflows.getAutosave({
      collectionId: collectionId.value,
      entryId: resolvedEntryId.value,
      locale: activeLocaleCode.value,
    });
    if (result.error) throw result.error;
    const autosave = result.data ?? null;
    recoverableAutosave.value = autosave?.baseVersion === version.value ? autosave : null;
    autosaveSequence.value = autosave?.clientSequence ?? 0;
  } catch {
    recoverableAutosave.value = null;
  } finally {
    isLoadingAutosave.value = false;
  }
}

async function saveAutosave(): Promise<void> {
  if (!props.open || !collectionId.value || !resolvedEntryId.value || !version.value || !canUpdateEntry.value || !hasUnsavedChanges.value) return;
  const payload = autosavePayload();
  try {
    const result = await actions.cms.workflows.saveAutosave({
      collectionId: collectionId.value,
      entryId: resolvedEntryId.value,
      locale: activeLocaleCode.value,
      baseVersion: version.value,
      clientSequence: autosaveSequence.value + 1,
      payload,
      checksum: autosaveChecksum(payload),
    });
    if (result.error) throw result.error;
    if (result.data) autosaveSequence.value = result.data.clientSequence;
  } catch {
    // Autosave is best effort. A canonical save remains authoritative.
  }
}

function queueAutosave(): void {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => void saveAutosave(), 1_200);
}

function recoverAutosave(): void {
  const payload = recoverableAutosave.value?.payload;
  if (!payload || Array.isArray(payload)) return;
  if (typeof payload.title === "string") title.value = payload.title;
  if (typeof payload.slug === "string") slug.value = payload.slug;
  if (payload.status === "draft" || payload.status === "archived") status.value = payload.status;
  if (Array.isArray(payload.bodyDocument)) bodyDocument.value = payload.bodyDocument as typeof bodyDocument.value;
  if (typeof payload.commentsClosed === "boolean") commentsClosed.value = payload.commentsClosed;
  if (payload.frontmatterDraft && typeof payload.frontmatterDraft === "object" && !Array.isArray(payload.frontmatterDraft)) frontmatterDraft.value = payload.frontmatterDraft as typeof frontmatterDraft.value;
  if (payload.relationDraft && typeof payload.relationDraft === "object" && !Array.isArray(payload.relationDraft)) relationDraft.value = payload.relationDraft as typeof relationDraft.value;
  recoverableAutosave.value = null;
  toast.success("Recovered unsaved changes into the editor");
}

watch(
  [title, slug, status, bodyDocument, commentsClosed, frontmatterDraft, relationDraft, activeLocaleCode, version, resolvedEntryId, () => props.open],
  () => queueAutosave(),
  { deep: true },
);

onBeforeUnmount(() => { if (autosaveTimer) clearTimeout(autosaveTimer); });

function invalidateCurrentEntryCaches(): void {
  if (!collectionId.value) return;
  invalidateEntryMutationCaches(collectionId.value);
}

async function reloadActiveEntry(): Promise<void> {
  if (!collectionId.value || !props.entryId) return;
  await loadEntry(collectionId.value, props.entryId, fields.value);
  if (revisionsEnabled.value && entryRevisions.hasLoadedRevisions.value) {
    await loadRevisionsIfNeeded(true);
  }
}

async function loadRevisionsIfNeeded(force = false): Promise<void> {
  if (!collectionId.value || !props.entryId) return;
  if (!revisionsEnabled.value || !canListRevisions.value) {
    entryRevisions.resetRevisions();
    return;
  }
  if (!force && entryRevisions.hasLoadedRevisions.value) {
    return;
  }
  await entryRevisions.loadRevisions({
    collectionId: collectionId.value,
    entryId: props.entryId,
  });
}

async function handleRevisionsOpen(): Promise<void> {
  await loadRevisionsIfNeeded();
}

async function handleSave(): Promise<void> {
  if (!collectionId.value || !props.entryId) return;
  if (!canUpdateEntry.value) {
    toast.error(getForbiddenMessage("cms.entries.update"));
    return;
  }
  const saved = await submitUpdate(
    collectionId.value,
    props.entryId,
    fields.value,
    bodyEnabled.value,
  );
  if (saved) {
    recoverableAutosave.value = null;
    invalidateCurrentEntryCaches();
    emit("saved");
    await reloadActiveEntry();
  }
}

function handleLocaleChange(value: unknown): void {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }
  switchActiveLocale(value, fields.value);
}

function currentRow(): CmsEntryRow | null {
  if (!collectionId.value || !props.entryId || !version.value) {
    return null;
  }
  return {
    id: props.entryId,
    collectionId: collectionId.value,
    title: title.value,
    slug: slug.value,
    status: status.value,
    version: version.value,
    locale: activeLocaleCode.value,
    updatedAt: new Date().toISOString(),
    publishedAt: null,
    createdAt: new Date().toISOString(),
  };
}

async function handlePublish(scheduledFor?: string): Promise<void> {
  const record = currentEntryRecord.value;
  if (!record) return;
  if (!canPublishEntry.value) {
    toast.error(getForbiddenMessage("cms.entries.publish"));
    return;
  }
  const ok = scheduledFor
    ? await entryActions.scheduleEntry(record, scheduledFor, (nextRecord) => {
        applyEntryRecord(nextRecord);
        invalidateEntryMutationCaches(nextRecord.entry.collectionId);
        emit("saved");
      })
    : await entryActions.publishEntry(record, (nextRecord) => {
        applyEntryRecord(nextRecord);
        invalidateEntryMutationCaches(nextRecord.entry.collectionId);
        emit("saved");
      });
  if (ok) {
    await reloadActiveEntry();
  }
}

async function handleReschedule(iso: string): Promise<void> {
  await handlePublish(iso);
}

async function handleCancelSchedule(): Promise<void> {
  await handleUnpublish();
}

async function handleUnpublish(): Promise<void> {
  const record = currentEntryRecord.value;
  if (!record) return;
  if (!canUnpublishEntry.value) {
    toast.error(getForbiddenMessage("cms.entries.unpublish"));
    return;
  }
  const ok = await entryActions.unpublishEntry(record, (nextRecord) => {
    applyEntryRecord(nextRecord);
    invalidateEntryMutationCaches(nextRecord.entry.collectionId);
    emit("saved");
  });
  if (ok) {
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
  const ok = await entryActions.archiveEntry(record, (nextRecord) => {
    applyEntryRecord(nextRecord);
    invalidateEntryMutationCaches(nextRecord.entry.collectionId);
    emit("saved");
    closeDrawer();
  });
  if (ok) return;
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
    emit("deleted");
    closeDrawer();
  });
  if (!ok) {
    isDeleteDialogOpen.value = false;
  }
}

function handleRestoreRevision(revisionId: string): void {
  if (!collectionId.value || !props.entryId || !version.value) return;
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
  if (!collectionId.value || !props.entryId || !version.value) return;
  if (!revisionId) return;
  if (!canRestoreRevision.value) {
    toast.error(getForbiddenMessage("cms.revisions.restore"));
    return;
  }

  const restored = await entryRevisions.restoreRevision({
    collectionId: collectionId.value,
    entryId: props.entryId,
    revisionId,
    expectedVersion: version.value,
  });
  if (!restored) return;

  invalidateCurrentEntryCaches();
  pendingRestoreRevisionId.value = null;
  emit("saved");
  await reloadActiveEntry();
}
</script>

<template>
  <Sheet :open="open" @update:open="(value) => !value && closeDrawer()">
    <SheetContent side="right" class="w-full sm:max-w-xl flex flex-col p-0">
      <SheetHeader class="px-6 pt-6 pb-4 border-b border-border">
        <SheetTitle>{{ t("cms.editEntry") }}</SheetTitle>
        <SheetDescription>
          {{ t("cms.editEntryDescription") }}
        </SheetDescription>
      </SheetHeader>

      <div
        :class="[
          'flex-1 overflow-auto px-6 py-4 space-y-4',
          isLocalizedVariant && '[&_[data-slot=label]]:text-primary!',
        ]"
      >
        <p v-if="loadError" class="text-sm text-destructive">{{ loadError }}</p>
        <p v-else-if="isLoading" class="text-sm text-muted-foreground">
          {{ t("cms.loadingEntry") }}
        </p>

        <template v-else>
          <div v-if="showLocaleSwitcher" class="grid gap-2">
            <Label>{{ t("cms.locale") }}</Label>
            <Select
              :model-value="activeLocaleCode"
              @update:model-value="handleLocaleChange"
            >
              <SelectTrigger
                :class="
                  isLocalizedVariant && 'border-primary/60 bg-primary/10 text-primary'
                "
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
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="grid gap-2">
            <Label for="edit-entry-title">{{ t("cms.title") }}</Label>
            <Input
              id="edit-entry-title"
              v-model="title"
              :disabled="!canUpdateEntry"
              :class="errors.title ? 'border-destructive' : ''"
            />
            <p v-if="errors.title" class="text-xs text-destructive">
              {{ errors.title }}
            </p>
          </div>

          <div class="grid gap-2">
            <Label for="edit-entry-slug">{{ t("cms.slug") }}</Label>
            <Input
              id="edit-entry-slug"
              v-model="slug"
              :disabled="!canUpdateEntry"
              :class="errors.slug ? 'border-destructive' : ''"
              @input="markSlugEdited"
              @blur="void checkSlugAvailability(collectionId, resolvedEntryId)"
            />
          </div>

          <div class="grid gap-2">
            <Label for="edit-entry-status">{{ t("cms.status") }}</Label>
            <Select
              v-model="status"
              :disabled="
                !canUpdateEntry ||
                status === 'published' ||
                status === 'scheduled'
              "
            >
              <SelectTrigger id="edit-entry-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in editableStatuses"
                  :key="option"
                  :value="option"
                  class="capitalize"
                >
                  {{ t(`cms.entry.status.${option}`) }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div v-if="editableFields.length > 0" class="grid gap-4">
            <CmsFrontmatterField
              v-for="field in editableFields"
              :key="field.key"
              v-model="frontmatterDraft[field.key]"
              :field="field"
              :disabled="!canUpdateEntry"
              :error="errors[field.key]"
            />
            <p v-if="errors.frontmatter" class="text-xs text-destructive">
              {{ errors.frontmatter }}
            </p>
          </div>

          <div v-if="bodyEnabled" class="grid gap-2">
            <Label for="edit-entry-body">{{ t("cms.body") }}</Label>
            <StructuredTextEditor
              id="edit-entry-body"
              v-model="bodyDocument"
              :disabled="!canUpdateEntry"
              min-height-class="min-h-56"
            />
            <p v-if="errors.body" class="text-xs text-destructive">
              {{ errors.body }}
            </p>
          </div>

          <EntryRevisionsPanel
            v-if="revisionsEnabled"
            :revisions="entryRevisions.revisions.value"
            :is-loading="entryRevisions.isLoadingRevisions.value"
            :has-loaded="entryRevisions.hasLoadedRevisions.value"
            :is-restoring="entryRevisions.isRestoringRevision.value"
            :can-restore="canRestoreRevision"
            :can-compare="canCompareRevisions"
            :collection-id="collectionId ?? ''"
            :entry-id="resolvedEntryId"
            :locale="activeLocaleCode"
            :restore-forbidden-message="
              getForbiddenMessage('cms.revisions.restore')
            "
            :error="entryRevisions.revisionError.value"
            @open="handleRevisionsOpen"
            @restore="handleRestoreRevision"
          />
          <CmsEntryAutosaveRecoveryPanel
            :autosave="recoverableAutosave"
            :is-loading="isLoadingAutosave"
            @recover="recoverAutosave"
            @dismiss="recoverableAutosave = null"
          />
          <CmsEntryCollaborationPanel
            v-if="collectionId && resolvedEntryId"
            :collection-id="collectionId"
            :entry-id="resolvedEntryId"
            :locale="activeLocaleCode"
            :can-edit="canUpdateEntry"
          />
          <CmsEntryReviewPanel
            v-if="collectionId && resolvedEntryId"
            :collection-id="collectionId"
            :entry-id="resolvedEntryId"
            :locale="activeLocaleCode"
            :can-review="canReviewCmsEntry"
          />
        </template>
      </div>

      <SheetFooter
        class="px-6 py-4 border-t border-border flex-row flex-wrap gap-2 justify-between"
      >
        <div class="flex flex-wrap gap-2">
          <PublishScheduleControl
            v-if="status === 'draft' || status === 'archived' || status === 'scheduled'"
            :can-publish="canPublishEntry"
            :can-schedule="canScheduleEntry"
            :is-busy="entryActions.isTransitioning.value"
            :status="status"
            :scheduled-for="scheduledFor"
            :disabled-reason="publishDisabledReason"
            @publish-now="handlePublish()"
            @schedule="handlePublish"
            @cancel-schedule="handleCancelSchedule"
            @reschedule="handleReschedule"
          />
          <Button
            v-if="status === 'published'"
            variant="outline"
            size="sm"
            :disabled="
              isSaving ||
              isLoading ||
              entryActions.isTransitioning.value ||
              !canUnpublishEntry
            "
            :title="
              canUnpublishEntry
                ? t('cms.unpublish')
                : getForbiddenMessage('cms.entries.unpublish')
            "
            @click="handleUnpublish"
          >
            {{
              entryActions.isTransitioning.value
                ? t("cms.unpublishing")
                : t("cms.unpublish")
            }}
          </Button>
          <Button
            v-if="status !== 'archived'"
            variant="outline"
            size="sm"
            :disabled="
              isSaving ||
              isLoading ||
              entryActions.isTransitioning.value ||
              !canArchiveEntry
            "
            :title="
              canArchiveEntry
                ? t('cms.archive')
                : getForbiddenMessage('cms.entries.archive')
            "
            @click="handleArchive"
          >
            {{ entryActions.isTransitioning.value ? t("cms.archiving") : t("cms.archive") }}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            :disabled="
              isSaving ||
              isLoading ||
              entryActions.isDeleting.value ||
              !canDeleteEntry
            "
            :title="
              canDeleteEntry
                ? t('common.delete')
                : getForbiddenMessage('cms.entries.remove')
            "
            @click="openDeleteDialog"
          >
            {{ t("common.delete") }}
          </Button>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" @click="closeDrawer">{{ t("common.cancel") }}</Button>
          <Button
            size="sm"
            :disabled="isSaving || isLoading || !canUpdateEntry"
            @click="handleSave"
          >
            {{ isSaving ? t("common.saving") : t("common.save") }}
          </Button>
        </div>
      </SheetFooter>
    </SheetContent>
  </Sheet>

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
</template>
