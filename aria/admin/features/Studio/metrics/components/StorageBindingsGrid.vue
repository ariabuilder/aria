<script setup lang="ts">
import { Skeleton } from "@/components/ui/skeleton";
import { studioIcons } from "@/lib/icons";
import type { AdapterStorageMetrics } from "@/lib/storage/adapter";

withDefaults(
  defineProps<{
    storage: AdapterStorageMetrics | null | undefined;
    isLoading?: boolean;
    variant?: "grid" | "stack";
  }>(),
  {
    isLoading: false,
    variant: "grid",
  },
);
</script>

<template>
  <div v-if="isLoading && variant === 'grid'" class="grid grid-cols-3 gap-3">
    <Skeleton
      v-for="n in 3"
      :key="n"
      class="h-14 rounded-md"
    />
  </div>

  <div
    v-else-if="isLoading && variant === 'stack'"
    class="flex flex-col divide-y divide-border"
  >
    <Skeleton
      v-for="n in 3"
      :key="n"
      class="h-10 w-full rounded-none"
    />
  </div>

  <div
    v-else-if="variant === 'stack'"
    class="flex flex-col divide-y divide-border dashboard-reveal"
  >
    <div
      class="flex items-center justify-between h-10 px-2"
      :class="storage?.database ? '' : 'opacity-60'"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span
          :class="[
            studioIcons.databaseLine,
            'w-3.5 h-3.5 shrink-0',
            storage?.database ? 'text-primary' : 'text-muted-foreground',
          ]"
        />
        <span class="text-xs font-medium text-foreground">D1</span>
      </div>
      <span class="text-xs text-muted-foreground tabular-nums shrink-0">
        <template v-if="storage?.database">
          {{ storage.database.rowCount.toLocaleString() }} rows
        </template>
        <template v-else>Not bound</template>
      </span>
    </div>

    <div
      class="flex items-center justify-between h-10 px-2"
      :class="storage?.kv?.available ? '' : 'opacity-60'"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span
          :class="[
            studioIcons.groupLayers,
            'w-3.5 h-3.5 shrink-0',
            storage?.kv?.available ? 'text-primary' : 'text-muted-foreground',
          ]"
        />
        <span class="text-xs font-medium text-foreground">KV</span>
      </div>
      <span class="text-xs text-muted-foreground shrink-0">
        {{ storage?.kv?.available ? "Connected" : "Not bound" }}
      </span>
    </div>

    <div
      class="flex items-center justify-between h-10 px-2"
      :class="storage?.objectStorage ? '' : 'opacity-60'"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span
          :class="[
            studioIcons.hardDrive,
            'w-3.5 h-3.5 shrink-0',
            storage?.objectStorage ? 'text-primary' : 'text-muted-foreground',
          ]"
        />
        <span class="text-xs font-medium text-foreground">R2</span>
      </div>
      <span class="text-xs text-muted-foreground tabular-nums shrink-0">
        <template v-if="storage?.objectStorage">
          {{ storage.objectStorage.objectCount.toLocaleString() }} objects
        </template>
        <template v-else>Not bound</template>
      </span>
    </div>
  </div>

  <div
    v-else-if="storage"
    class="grid grid-cols-1 sm:grid-cols-3 gap-3 dashboard-reveal"
  >
    <div
      class="rounded-md border border-border bg-card px-4 py-3 flex flex-col gap-1"
      :class="storage.database ? '' : 'opacity-60'"
    >
      <div class="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          :class="[
            studioIcons.databaseLine,
            'w-4 h-4 shrink-0',
            storage.database ? 'text-primary' : '',
          ]"
        />
        <span class="font-medium text-foreground">D1</span>
      </div>
      <p class="text-2xs text-muted-foreground">SQL database</p>
      <p class="text-sm font-semibold tabular-nums mt-1">
        <template v-if="storage.database">
          {{ storage.database.rowCount.toLocaleString() }} rows
        </template>
        <template v-else>Not bound</template>
      </p>
    </div>

    <div
      class="rounded-md border border-border bg-card px-4 py-3 flex flex-col gap-1"
      :class="storage.kv?.available ? '' : 'opacity-60'"
    >
      <div class="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          :class="[
            studioIcons.groupLayers,
            'w-4 h-4 shrink-0',
            storage.kv?.available ? 'text-primary' : '',
          ]"
        />
        <span class="font-medium text-foreground">KV</span>
      </div>
      <p class="text-2xs text-muted-foreground">Key-value cache</p>
      <p class="text-sm font-semibold mt-1">
        {{ storage.kv?.available ? "Connected" : "Not bound" }}
      </p>
    </div>

    <div
      class="rounded-md border border-border bg-card px-4 py-3 flex flex-col gap-1"
      :class="storage.objectStorage ? '' : 'opacity-60'"
    >
      <div class="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          :class="[
            studioIcons.hardDrive,
            'w-4 h-4 shrink-0',
            storage.objectStorage ? 'text-primary' : '',
          ]"
        />
        <span class="font-medium text-foreground">R2</span>
      </div>
      <p class="text-2xs text-muted-foreground">Object storage</p>
      <p class="text-sm font-semibold tabular-nums mt-1">
        <template v-if="storage.objectStorage">
          {{ storage.objectStorage.objectCount.toLocaleString() }} objects
        </template>
        <template v-else>Not bound</template>
      </p>
    </div>
  </div>
</template>
