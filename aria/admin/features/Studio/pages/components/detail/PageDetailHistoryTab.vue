<script setup lang="ts">
import ErrorBanner from "@/features/Studio/core/components/ErrorBanner.vue";
import type { PageDetailError } from "@/lib/errors/pageDetailErrors";
import type { Page } from "@/composables/useBuilderData";
import {
  HistoryTimeline,
  PageHistoryAuthorshipSummary,
} from "../index";
import type { HistoryEntry } from "../HistoryTimeline.vue";

defineProps<{
  currentError: PageDetailError | null;
  builderPage: Page | undefined;
  versions: HistoryEntry[];
  isHistoryLoading: boolean;
  canRevertPageVersion: boolean;
  canDeletePageVersion: boolean;
  isReverting: boolean;
  isDeleting: boolean;
  protectedVersions: string[];
}>();

const emit = defineEmits<{
  dismissError: [];
  retryLoad: [];
  revert: [versionId: string];
  delete: [versionId: string];
}>();
</script>

<template>
  <div class="max-w-5xl space-y-6">
    <ErrorBanner
      :error="currentError"
      @dismiss="emit('dismissError')"
      @retry="emit('retryLoad')"
    />

    <PageHistoryAuthorshipSummary :authorship="builderPage?.authorship" />

    <HistoryTimeline
      :entries="versions"
      :is-loading="isHistoryLoading"
      :can-restore="canRevertPageVersion"
      :can-delete="canDeletePageVersion"
      :is-restoring="isReverting"
      :is-deleting="isDeleting"
      :protected-versions="protectedVersions"
      @revert="emit('revert', $event)"
      @delete="emit('delete', $event)"
    />
  </div>
</template>
