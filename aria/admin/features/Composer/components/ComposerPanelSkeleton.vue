<script setup lang="ts">
import { Skeleton } from "@/components/ui/skeleton";

withDefaults(
  defineProps<{
    side?: "left" | "right";
  }>(),
  { side: "left" },
);
</script>

<template>
  <div
    class="absolute inset-0 z-30 flex flex-col overflow-hidden bg-background"
    role="status"
    aria-live="polite"
    aria-label="Loading editor panel"
  >
    <div
      class="flex h-10 shrink-0 items-center gap-2 border-b border-dashed border-border bg-input px-3"
    >
      <Skeleton class="size-4 shrink-0 rounded-sm" />
      <Skeleton class="h-3 w-28 rounded-sm" />
      <Skeleton class="ml-auto size-5 rounded-sm" />
    </div>

    <div
      class="flex h-12 shrink-0 items-center justify-around border-b border-dashed border-border px-4"
    >
      <Skeleton v-for="index in 3" :key="index" class="size-4 rounded-sm" />
    </div>

    <div v-if="side === 'left'" class="flex flex-1 flex-col gap-3 p-3">
      <Skeleton class="h-8 w-full rounded-sm" />
      <div v-for="index in 7" :key="index" class="flex items-center gap-2">
        <Skeleton
          class="h-3 rounded-sm"
          :class="index % 3 === 0 ? 'ml-8 w-24' : index % 2 === 0 ? 'ml-4 w-32' : 'w-36'"
        />
      </div>
    </div>

    <div v-else class="flex flex-1 flex-col gap-5 p-3">
      <div v-for="section in 4" :key="section" class="flex flex-col gap-3">
        <Skeleton class="h-3 w-20 rounded-sm" />
        <Skeleton class="h-8 w-full rounded-sm" />
        <div class="flex gap-2">
          <Skeleton class="h-8 flex-1 rounded-sm" />
          <Skeleton class="h-8 flex-1 rounded-sm" />
        </div>
      </div>
    </div>

    <span class="sr-only">Loading the selected item</span>
  </div>
</template>
