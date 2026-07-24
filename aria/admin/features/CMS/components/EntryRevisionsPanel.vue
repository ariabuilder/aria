<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { actions } from "astro:actions";
import type { AriaEntryRevision, CmsEntryDiff } from "../../../../lib/cms/schemas";
import { studioIcons } from "@/lib/icons";
import { formatCmsActorDisplay } from "../lib/actorDisplay";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  revisions: readonly AriaEntryRevision[];
  isLoading: boolean;
  hasLoaded: boolean;
  isRestoring: boolean;
  canRestore: boolean;
  restoreForbiddenMessage: string;
  error: string | null;
  canCompare: boolean;
  collectionId: string;
  entryId: string;
  locale: string;
}>();
const { t } = useStudioI18n();

const emit = defineEmits<{
  open: [];
  restore: [revisionId: string];
}>();

const isOpen = ref(false);
const selectedRevisionIds = ref<string[]>([]);
const diff = ref<CmsEntryDiff | null>(null);
const isComparing = ref(false);
const compareError = ref<string | null>(null);
const hasRevisions = computed(() => props.revisions.length > 0);
const summaryLabel = computed(() => {
  if (props.isLoading) {
    return t("cms.entry.revisions.loadingSnapshots");
  }
  if (!props.hasLoaded) {
    return t("cms.entry.revisions.snapshots");
  }
  return t("cms.entry.revisions.savedSnapshots", { count: props.revisions.length });
});

function toggleOpen(): void {
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    emit("open");
  }
}

function formatRevisionDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatRevisionActor(revision: AriaEntryRevision): string {
  const actor = revision.authorship?.actor?.username ?? revision.actorId;
  return formatCmsActorDisplay(actor);
}

function toggleSelection(revisionId: string): void {
  if (selectedRevisionIds.value.includes(revisionId)) {
    selectedRevisionIds.value = selectedRevisionIds.value.filter((id) => id !== revisionId);
  } else {
    selectedRevisionIds.value = [...selectedRevisionIds.value.slice(-1), revisionId];
  }
  diff.value = null;
  compareError.value = null;
}

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > 220 ? `${value.slice(0, 220)}…` : value;
  const serialized = JSON.stringify(value);
  return serialized.length > 220 ? `${serialized.slice(0, 220)}…` : serialized;
}

async function compareSelected(): Promise<void> {
  if (!props.canCompare || selectedRevisionIds.value.length !== 2 || !props.collectionId || !props.entryId) return;
  isComparing.value = true;
  compareError.value = null;
  try {
    const result = await actions.cms.workflows.compareRevisions({
      collectionId: props.collectionId,
      entryId: props.entryId,
      locale: props.locale,
      leftRevisionId: selectedRevisionIds.value[0],
      rightRevisionId: selectedRevisionIds.value[1],
    });
    if (result.error) throw result.error;
    diff.value = result.data ?? null;
  } catch (error) {
    compareError.value = error instanceof Error ? error.message : "Unable to compare revisions";
  } finally {
    isComparing.value = false;
  }
}

watch(() => props.revisions, () => {
  selectedRevisionIds.value = [];
  diff.value = null;
  compareError.value = null;
}, { deep: true });
</script>

<template>
  <section class="grid border-t border-border pt-5">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 py-1 text-left"
      :aria-expanded="isOpen"
      @click="toggleOpen"
    >
      <div>
        <p class="m-0 text-sm font-medium leading-none text-foreground">{{ t("cms.entry.revisions.title") }}</p>
        <p class="m-0 mt-1 text-xs leading-snug text-muted-foreground">
          {{ summaryLabel }}
        </p>
      </div>
      <span
        :class="[
          isOpen ? studioIcons.chevronUp : studioIcons.chevronDown,
          'size-4 shrink-0 text-muted-foreground',
        ]"
      />
    </button>

    <div v-if="isOpen" class="mt-4 grid gap-3">
      <p v-if="error" class="m-0 text-xs text-destructive">{{ error }}</p>
      <p v-else-if="isLoading" class="m-0 text-xs text-muted-foreground">
        {{ t("cms.entry.revisions.loading") }}
      </p>
      <p v-else-if="!hasRevisions" class="m-0 text-xs text-muted-foreground">
        {{ t("cms.entry.revisions.empty") }}
      </p>

      <div v-else class="grid border-t border-border">
        <div v-if="canCompare" class="flex items-center justify-between gap-3 border-b border-border/50 py-3">
          <p class="m-0 text-xs text-muted-foreground">Select two snapshots to compare.</p>
          <button
            type="button"
            class="inline-flex h-7 shrink-0 items-center rounded-md border border-border/50 bg-card/30 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            :disabled="selectedRevisionIds.length !== 2 || isComparing"
            @click="compareSelected"
          >
            {{ isComparing ? 'Comparing…' : 'Compare selected' }}
          </button>
        </div>
        <div
          v-for="revision in revisions"
          :key="revision.id"
          class="flex items-center justify-between gap-3 border-b border-border/50 py-3"
        >
          <div class="min-w-0">
            <p class="m-0 truncate text-xs leading-tight text-foreground">
              {{ revision.message ?? t("cms.entry.revisions.saved") }}
            </p>
            <p class="m-0 mt-1 truncate text-2xs leading-tight text-muted-foreground">
              {{ formatRevisionDate(revision.createdAt) }}
              <span v-if="revision.locale"> · {{ revision.locale }}</span>
              <span> · {{ formatRevisionActor(revision) }}</span>
            </p>
          </div>
          <button
            v-if="canCompare"
            type="button"
            class="mr-auto rounded px-1.5 py-1 text-2xs text-muted-foreground hover:bg-muted"
            :aria-pressed="selectedRevisionIds.includes(revision.id)"
            @click="toggleSelection(revision.id)"
          >
            {{ selectedRevisionIds.includes(revision.id) ? 'Selected' : 'Select' }}
          </button>
          <button
            type="button"
            class="inline-flex h-7 shrink-0 items-center rounded-md border border-border/50 bg-card/30 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-card/45 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            :disabled="isRestoring || !canRestore"
            :title="canRestore ? t('cms.entry.restore.title') : restoreForbiddenMessage"
            @click="emit('restore', revision.id)"
          >
            {{ isRestoring ? t("cms.entry.restore.restoring") : t("cms.entry.revisions.restore") }}
          </button>
        </div>
        <div v-if="compareError" class="border-b border-border/50 py-3 text-xs text-destructive">{{ compareError }}</div>
        <div v-if="diff" class="grid gap-2 border-b border-border/50 py-3">
          <p class="m-0 text-xs font-medium text-foreground">{{ diff.changes.length }} changed {{ diff.changes.length === 1 ? 'field' : 'fields' }}</p>
          <div v-for="change in diff.changes" :key="`${change.kind}:${change.path}`" class="rounded border border-border/60 p-2 text-2xs">
            <p class="m-0 font-medium text-foreground">{{ change.path }}</p>
            <p class="m-0 mt-1 text-muted-foreground"><span class="line-through">{{ formatDiffValue(change.before) }}</span> → {{ formatDiffValue(change.after) }}</p>
          </div>
          <p v-if="diff.truncated" class="m-0 text-2xs text-muted-foreground">The comparison is bounded; large values are summarized.</p>
        </div>
      </div>
    </div>
  </section>
</template>
