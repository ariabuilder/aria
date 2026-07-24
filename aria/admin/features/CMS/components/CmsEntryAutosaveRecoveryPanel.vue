<script setup lang="ts">
import { Button } from "@/components/ui/button";
import type { CmsEntryAutosave } from "../../../../lib/cms/schemas";

defineProps<{ autosave: CmsEntryAutosave | null; isLoading: boolean }>();
const emit = defineEmits<{ recover: []; dismiss: [] }>();

function formatSavedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
</script>

<template>
  <section v-if="autosave" class="rounded-md border border-primary/30 bg-primary/5 p-4" aria-live="polite">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="m-0 text-sm font-medium text-foreground">Recover unsaved changes?</p>
        <p class="m-0 mt-1 text-xs leading-5 text-muted-foreground">A private autosave from {{ formatSavedAt(autosave.createdAt) }} matches this entry version. Recovery changes only this editor.</p>
      </div>
      <div class="flex gap-2">
        <Button size="sm" variant="outline" @click="emit('dismiss')">Dismiss</Button>
        <Button size="sm" :disabled="isLoading" @click="emit('recover')">Recover</Button>
      </div>
    </div>
  </section>
</template>
