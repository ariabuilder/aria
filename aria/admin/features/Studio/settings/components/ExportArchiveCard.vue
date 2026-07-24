<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import type { SiteExportRecord } from "../composables/useSiteExport";

const props = defineProps<{
  record: SiteExportRecord;
  isDeleting?: boolean;
  formatDateTime: (value: string) => string;
  formatExportExpiry: (record: SiteExportRecord) => string;
  formatBytes: (value: number) => string;
}>();

const archiveStats = computed(() => {
  const cmsCollectionCount = props.record.cmsCollectionCount ?? 0;
  const cmsEntryCount = props.record.cmsEntryCount ?? 0;
  const redirectCount = props.record.redirectCount ?? 0;
  const cmsTotal = cmsCollectionCount + cmsEntryCount;

  const stats = [
    { label: "Pages", value: props.record.pageCount },
    { label: "Media", value: props.record.mediaCount },
  ];

  if (cmsTotal > 0) {
    stats.push({ label: "CMS", value: cmsTotal });
  }

  if (redirectCount > 0) {
    stats.push({ label: "Rules", value: redirectCount });
  }

  if (stats.length < 4) {
    stats.push({
      label: "Files",
      value: props.record.pageCount + props.record.mediaCount,
    });
  }

  return stats.slice(0, 4);
});

const emit = defineEmits<{
  download: [record: SiteExportRecord];
  delete: [id: string];
}>();
</script>

<template>
  <article class="overflow-hidden rounded-md border border-border border-solid bg-input hover:border-dashed hover:border-border">
    <div
      class="flex items-center justify-between border-b border-border border-dashed px-3"
    >
      <div class="flex min-w-0 items-center gap-4">
        <span
          :class="[studioIcons.archived, 'size-5.5 shrink-0 text-muted-foreground']"
        />
        <div class="min-w-0 pb-2">
          <p class="truncate text-sm font-medium text-foreground leading-4">Site Export</p>
          <p class="text-2xs text-muted-foreground leading-0">
            {{ formatDateTime(record.createdAt) }}
          </p>
        </div>
      </div>

      <div class="ml-2 flex shrink-0 items-center gap-0.5">
        <Button
          size="icon-header"
          variant="headerAction"
          class="h-3.5 shrink-0 hover:text-primary"
          :aria-label="`Download export from ${formatDateTime(record.createdAt)}`"
          @click="emit('download', record)"
        >
          <span :class="[studioIcons.download, 'size-3.5']" />
          <span class="sr-only">Download</span>
        </Button>
        <Button
          variant="headerAction"
          class="hover:text-destructive h-3.5 shrink-0"
          size="icon-header"
          :disabled="isDeleting"
          :aria-label="`Delete export from ${formatDateTime(record.createdAt)}`"
          @click="emit('delete', record.id)"
        >
          <span
            :class="[
              studioIcons.trash,
              'size-3.5 ',
              isDeleting && 'animate-pulse',
            ]"
          />
          <span class="sr-only">Delete</span>
        </Button>
      </div>
    </div>

    <div class="px-3 py-3 pb-3 bg-muted/70">
      <div
        class="grid gap-2"
        :class="archiveStats.length >= 4 ? 'grid-cols-4' : 'grid-cols-3'"
      >
        <div
          v-for="stat in archiveStats"
          :key="stat.label"
          class="text-center"
        >
          <p
            class="text-base font-semibold tabular-nums leading-0 pb-2 text-foreground"
          >
            {{ stat.value }}
          </p>
          <p class="text-2xs leading-0 text-muted-foreground">
            {{ stat.label }}
          </p>
        </div>
      </div>
    </div>

    <div
      class="flex items-center px-3 py-2 bg-muted/70"
    >
      <div class="flex min-w-0 items-center justify-between w-full gap-2 text-2xs text-muted-foreground/50">
        <span class="truncate">{{ formatExportExpiry(record) }}</span>
        <span class="truncate">{{ formatBytes(record.sizeBytes) }}</span>
      </div>
    </div>
  </article>
</template>
