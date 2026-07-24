<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCmsEntriesList } from "../composables/useCmsEntriesList";
import {
  resolveCollectionDisplayName,
  resolveTargetCollectionId,
} from "../lib/resolveEntryLabels";
import { CmsEntryRowSchema, type CmsEntryRow } from "../lib/entryRow";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
    open: boolean;
    targetCollection: string;
    title?: string;
    description?: string;
  }>();
const { t } = useStudioI18n();
const dialogTitle = computed(() => props.title ?? t("cms.entryPicker.title"));

const emit = defineEmits<{
  "update:open": [value: boolean];
  select: [entry: CmsEntryRow];
}>();

const collectionLabel = ref<string | null>(null);
const targetCollectionId = ref("");
const {
  rows,
  total,
  page,
  totalPages,
  searchQuery,
  isLoading,
  loadError,
  loadEntries,
  setPage,
} = useCmsEntriesList(targetCollectionId);

const titleId = computed(
  () => `cms-entry-picker-${props.targetCollection || "collection"}`,
);

const displayDescription = computed(() => {
  if (props.description) {
    return props.description;
  }
  const label = collectionLabel.value ?? t("cms.entryPicker.targetCollection");
  return t("cms.entryPicker.description", { collection: label });
});

let targetCollectionLookupId = 0;

watch(
  () => props.targetCollection,
  (targetCollection) => {
    const lookupId = ++targetCollectionLookupId;
    const normalized = targetCollection?.trim();
    if (!normalized) {
      collectionLabel.value = null;
      targetCollectionId.value = "";
      return;
    }
    void Promise.all([
      resolveCollectionDisplayName(normalized),
      resolveTargetCollectionId(normalized).catch(() => normalized),
    ]).then(([label, collectionId]) => {
      if (lookupId !== targetCollectionLookupId) {
        return;
      }
      collectionLabel.value = label;
      targetCollectionId.value = collectionId;
    });
  },
  { immediate: true },
);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      void loadEntries();
    }
  },
);

function selectEntry(entry: CmsEntryRow): void {
  const parsed = CmsEntryRowSchema.parse(entry);
  emit("select", parsed);
  emit("update:open", false);
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      :aria-labelledby="titleId"
      class="sm:max-w-[680px] p-0 overflow-hidden"
    >
      <DialogHeader class="gap-1 px-5 pt-5 pb-4 border-b border-border">
        <DialogTitle :id="titleId">{{ dialogTitle }}</DialogTitle>
        <DialogDescription>{{ displayDescription }}</DialogDescription>
      </DialogHeader>

      <div class="grid gap-3 px-5 py-4">
        <Input
          v-model="searchQuery"
          :placeholder="t('cms.entryPicker.search')"
          class="h-9"
        />

        <p v-if="loadError" class="text-xs text-destructive">
          {{ loadError }}
        </p>
        <p v-else-if="isLoading" class="py-8 text-center text-sm text-muted-foreground">
          {{ t("cms.entryPicker.loading") }}
        </p>
        <p v-else-if="rows.length === 0" class="py-8 text-center text-sm text-muted-foreground">
          {{ t("cms.entryPicker.empty") }}
        </p>

        <div v-else class="max-h-[420px] overflow-auto rounded-md border border-border">
          <button
            v-for="row in rows"
            :key="row.id"
            type="button"
            class="flex w-full items-center justify-between gap-3 border-b border-dashed border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted/40"
            @click="selectEntry(row)"
          >
            <span class="min-w-0">
              <span class="block truncate text-sm text-foreground">
                {{ row.title }}
              </span>
              <span class="block truncate text-2xs text-muted-foreground">
                {{ row.slug }} · {{ t(`cms.entry.status.${row.status}`) }}
              </span>
            </span>
            <span class="shrink-0 text-2xs text-muted-foreground">
              {{ row.locale }}
            </span>
          </button>
        </div>

        <div class="flex items-center justify-between text-2xs text-muted-foreground">
          <span>{{ t("cms.entryPicker.count", { count: total }) }}</span>
          <div v-if="totalPages > 1" class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="page <= 1 || isLoading"
              @click="setPage(page - 1)"
            >
              {{ t("cms.entryPicker.previous") }}
            </Button>
            <Button
              variant="outline"
              size="sm"
              :disabled="page >= totalPages || isLoading"
              @click="setPage(page + 1)"
            >
              {{ t("cms.entryPicker.next") }}
            </Button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
