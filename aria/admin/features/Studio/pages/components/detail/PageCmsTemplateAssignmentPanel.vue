<script setup lang="ts">
import { computed, ref } from "vue";
import { toast } from "vue-sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CmsCollectionCommandSelect from "@/features/CMS/components/CmsCollectionCommandSelect.vue";
import { useCollectionIcons } from "@/features/CMS/composables/useCollectionIcons";
import type { CollectionSummary } from "@/features/CMS/composables/useCollectionsList";
import { COLLECTION_KIND_OPTIONS } from "@/features/CMS/lib/collectionKindOptions";
import DeleteConfirmDialog from "@/features/Studio/core/components/DeleteConfirmDialog.vue";
import { useStudioRouter } from "@/features/Studio/core/composables";
import { studioIcons } from "@/lib/icons";
import {
  usePageCmsTemplateAssignments,
  type CmsPageAssignmentSlot,
} from "../../composables/usePageCmsTemplateAssignments";
import { StoredPageSystemRoleSchema } from "../../../../../../lib/storage/adapter";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  pageId?: string;
  pageTitle?: string;
  pageOptions?: readonly { id: string; label: string }[];
  isSaving?: boolean;
  slot: CmsPageAssignmentSlot;
  pendingSystemRole?: string;
}>();

const emit = defineEmits<{
  assignCollection: [];
  unassignCollection: [];
}>();

const router = useStudioRouter();
const { t } = useStudioI18n();
const { getCollectionIcon, getCollectionIconForKind } = useCollectionIcons();

const roleLabel = computed(() =>
  props.slot === "list" ? "list template" : "entry template",
);

const {
  assignedCollections,
  unassignedCollections,
  pendingAssignmentClears,
  selectedCollectionId,
  isLoading: isCollectionsLoading,
  isAssigning,
  unassigningCollectionId,
  loadError: collectionsLoadError,
  getSelectedCollectionReassignmentImpact,
  assignSelectedCollection,
  unassignCollection,
} = usePageCmsTemplateAssignments({
  pageId: computed(() => props.pageId),
  slot: computed(() => props.slot),
  pendingSystemRole: computed(
    () => StoredPageSystemRoleSchema.safeParse(props.pendingSystemRole).data,
  ),
});

const isAssignmentConfirmationVisible = ref(false);
const pendingUnassign = ref<CollectionSummary | null>(null);
const isUnassignDialogOpen = ref(false);

const kindLabels = new Map(
  COLLECTION_KIND_OPTIONS.map((option) => [option.value, option.label]),
);

const canAssignCollection = computed(
  () =>
    Boolean(props.pageId?.trim()) &&
    selectedCollectionId.value.trim().length > 0 &&
    !isAssigning.value,
);

const isUnassigning = computed(() => unassigningCollectionId.value !== null);
const selectedReassignmentImpact = computed(() =>
  getSelectedCollectionReassignmentImpact(),
);
const needsAssignmentConfirmation = computed(
  () =>
    selectedReassignmentImpact.value !== null ||
    pendingAssignmentClears.value.length > 0,
);
const reassignmentRoleLabel = computed(() =>
  props.slot === "list" ? "list template" : "entry template",
);
const previousAssignmentPageLabel = computed(() => {
  const pageId = selectedReassignmentImpact.value?.previousPageId;
  if (!pageId) return "another page";
  return (
    props.pageOptions?.find((page) => page.id === pageId)?.label ??
    "another page"
  );
});
const nextAssignmentPageLabel = computed(
  () => props.pageTitle?.trim() || "this page",
);
const reassignmentDescription = computed(() => {
  const impact = selectedReassignmentImpact.value;
  const parts: string[] = [];
  if (impact) {
    parts.push(
      `${impact.collectionLabel} already uses ${previousAssignmentPageLabel.value} as its ${reassignmentRoleLabel.value}. Assigning ${nextAssignmentPageLabel.value} will replace that page.`,
    );
  }
  if (pendingAssignmentClears.value.length > 0) {
    parts.push(
      `This will also remove the opposite template assignment for ${pendingAssignmentClears.value.map((clear) => clear.collectionLabel).join(", ")} so the page can become a ${roleLabel.value}.`,
    );
  }
  return parts.join(" ");
});

function collectionIconClass(collection: CollectionSummary): string {
  const iconName = collection.iconName?.trim();
  if (iconName) {
    return getCollectionIcon(iconName);
  }
  return getCollectionIconForKind(collection.kind);
}

function kindLabel(kind: CollectionSummary["kind"]): string {
  return kindLabels.get(kind) ?? kind;
}

function collectionMeta(collection: CollectionSummary): string {
  const entryLabel =
    collection.itemCount === 1 ? "1 entry" : `${collection.itemCount} entries`;
  return `${collection.name} · ${kindLabel(collection.kind)} · ${entryLabel}`;
}

async function handleAssignCollection(): Promise<void> {
  if (needsAssignmentConfirmation.value) {
    isAssignmentConfirmationVisible.value = true;
    return;
  }

  await commitAssignCollection();
}

function handleCollectionSelection(value: string): void {
  selectedCollectionId.value = value;
  isAssignmentConfirmationVisible.value = false;
  if (!value.trim()) return;
  void handleAssignCollection();
}

async function commitAssignCollection(): Promise<void> {
  try {
    const updated = await assignSelectedCollection();
    if (!updated) {
      return;
    }
    toast.success(`Assigned as ${roleLabel.value} for ${updated.label}`);
    emit("assignCollection");
    isAssignmentConfirmationVisible.value = false;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to assign collection",
    );
  }
}

async function confirmReassignment(): Promise<void> {
  await commitAssignCollection();
}

function cancelReassignment(): void {
  selectedCollectionId.value = "";
  isAssignmentConfirmationVisible.value = false;
}

function openCollectionSettings(collectionName: string): void {
  const parsedName = collectionName.trim();
  if (!parsedName) return;
  router.navigateTo(`/collections/${parsedName}/settings`);
}

function openUnassignDialog(collection: CollectionSummary): void {
  pendingUnassign.value = collection;
  isUnassignDialogOpen.value = true;
}

function closeUnassignDialog(): void {
  isUnassignDialogOpen.value = false;
  pendingUnassign.value = null;
}

async function confirmUnassign(): Promise<void> {
  const collection = pendingUnassign.value;
  if (!collection) {
    return;
  }

  try {
    const updated = await unassignCollection(collection.id);
    if (!updated) {
      return;
    }
    toast.success(`Removed ${roleLabel.value} for ${updated.label}`);
    emit("unassignCollection");
    closeUnassignDialog();
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : "Failed to remove collection assignment",
    );
  }
}
</script>

<template>
  <section
    class="grid gap-4 border-t border-border pt-8"
    data-testid="cms-template-assignment-panel"
  >
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="grid min-w-0 gap-1">
        <h2 class="m-0 text-base font-medium text-foreground">
          {{ t("pages.assignment.title") }}
        </h2>
        <p class="m-0 text-xs leading-snug text-muted-foreground">
          {{
            slot === "list"
              ? t("pages.assignment.listDescription")
              : t("pages.assignment.entryDescription")
          }}
        </p>
      </div>

      <div class="w-full max-w-xs shrink-0">
        <CmsCollectionCommandSelect
          :model-value="selectedCollectionId"
          :collections="unassignedCollections"
          :disabled="isSaving || isAssigning || isUnassigning"
          :is-loading="isCollectionsLoading"
          :load-error="collectionsLoadError"
          :placeholder="t('pages.assignment.assignPlaceholder')"
          :empty-label="t('pages.assignment.emptyOptions')"
          data-testid="cms-template-assignment-command"
          @update:model-value="handleCollectionSelection"
        />
      </div>
    </div>

    <div
      v-if="isAssignmentConfirmationVisible"
      class="grid gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
      data-testid="cms-template-assignment-inline-confirm"
    >
      <p class="m-0">{{ reassignmentDescription }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          :disabled="!canAssignCollection"
          @click="confirmReassignment"
        >
          {{ isAssigning ? t("pages.assignment.assigning") : t("pages.assignment.confirm") }}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="isAssigning"
          @click="cancelReassignment"
        >
          {{ t("pages.cancel") }}
        </Button>
      </div>
    </div>

    <div
      v-if="assignedCollections.length === 0"
      class="rounded-md border border-dashed border-border/50 bg-card/30 px-4 py-3 text-xs text-muted-foreground"
      data-testid="cms-template-assignment-empty"
    >
      {{ t("pages.assignment.none") }}
    </div>

    <div
      v-if="pendingAssignmentClears.length > 0"
      class="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
      data-testid="cms-template-assignment-pending-clears"
    >
      Saving will remove this page as the
      {{ pendingAssignmentClears[0].field === "listPageId" ? "list" : "entry" }}
      template for
      {{ pendingAssignmentClears.map((clear) => clear.collectionLabel).join(", ") }}.
    </div>

    <div v-else class="grid gap-2" data-testid="cms-template-assignment-list">
      <div
        v-for="collection in assignedCollections"
        :key="collection.id"
        class="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border/50 bg-card/25 px-2.5 py-2 transition-colors hover:border-border hover:bg-card/45"
        :data-testid="`assigned-collection-${collection.id}`"
      >
        <span
          class="inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-background/80 text-muted-foreground"
        >
          <span :class="[collectionIconClass(collection), 'size-4']" />
        </span>

        <div class="min-w-0">
          <div class="flex min-w-0 items-center gap-2">
            <p class="m-0 truncate text-sm font-medium text-foreground">
              {{ collection.label }}
            </p>
            <Badge
              variant="outline"
              size="xs"
              class="h-4 shrink-0 border-border/25 bg-transparent text-[9px] font-medium uppercase text-muted-foreground/60 shadow-none"
            >
              {{ kindLabel(collection.kind) }}
            </Badge>
          </div>
          <p class="m-0 mt-0.5 truncate text-2xs text-muted-foreground">
            {{ collectionMeta(collection) }}
          </p>
        </div>

        <div class="flex items-center gap-1">
          <Button
            variant="sidebar-action"
            size="icon-sm"
            :disabled="isSaving || isUnassigning"
            :title="t('pages.assignment.collectionSettings')"
            :aria-label="t('pages.assignment.collectionSettings')"
            @click="openCollectionSettings(collection.name)"
          >
            <span :class="[studioIcons.settings, 'size-3.5']" />
          </Button>
          <Button
            variant="sidebar-action"
            size="icon-sm"
            class="text-muted-foreground hover:text-destructive"
            :disabled="isSaving || isUnassigning"
            :title="t('pages.assignment.remove')"
            :aria-label="t('pages.assignment.remove')"
            @click="openUnassignDialog(collection)"
          >
            <span :class="[studioIcons.trash, 'size-3.5']" />
          </Button>
        </div>
      </div>
    </div>

    <DeleteConfirmDialog
      :open="isUnassignDialogOpen"
      :title="slot === 'list' ? t('pages.assignment.removeListTitle') : t('pages.assignment.removeEntryTitle')"
      :description="
        pendingUnassign
          ? slot === 'list'
            ? t('pages.assignment.removeListDescription', { collection: pendingUnassign.label })
            : t('pages.assignment.removeEntryDescription', { collection: pendingUnassign.label })
          : t('pages.assignment.removeDescription')
      "
      :item-name="pendingUnassign?.label ?? ''"
      :is-loading="isUnassigning"
      :confirm-label="t('pages.assignment.remove')"
      @update:open="
        (open) => {
          isUnassignDialogOpen = open;
          if (!open) closeUnassignDialog();
        }
      "
      @confirm="confirmUnassign"
    />
  </section>
</template>
