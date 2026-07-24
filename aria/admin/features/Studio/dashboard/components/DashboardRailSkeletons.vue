<script setup lang="ts">
import { Skeleton } from "@/components/ui/skeleton";

defineProps<{
  variant: "stat" | "infra-half" | "infra-split" | "infra-pipeline" | "traffic";
}>();
</script>

<template>
  <div
    v-if="variant === 'stat'"
    class="min-h-[72px] rounded-md border border-border bg-background px-3 py-3 flex flex-col justify-between"
  >
    <Skeleton class="h-3 w-12" />
    <Skeleton class="h-9 w-10 min-h-[2.25rem]" />
  </div>

  <div
    v-else-if="variant === 'infra-half'"
    class="min-h-[180px] rounded-md border border-border bg-background p-3 flex flex-col gap-3"
  >
    <Skeleton class="h-3 w-20" />
    <div class="flex flex-col">
      <Skeleton
        v-for="n in 4"
        :key="n"
        class="h-10 w-full rounded-none border-b border-border last:border-b-0"
      />
    </div>
  </div>

  <div v-else-if="variant === 'infra-split'" class="grid grid-cols-2 gap-2">
    <div
      class="min-h-[180px] rounded-md border border-border bg-background p-3 flex flex-col gap-3"
    >
      <Skeleton class="h-3 w-20" />
      <div class="flex flex-col">
        <Skeleton
          v-for="n in 4"
          :key="`left-${n}`"
          class="h-10 w-full rounded-none border-b border-border last:border-b-0"
        />
      </div>
    </div>
    <div
      class="min-h-[180px] rounded-md border border-border bg-background p-3 flex flex-col gap-3"
    >
      <Skeleton class="h-3 w-16" />
      <div class="flex flex-col">
        <Skeleton
          v-for="n in 3"
          :key="`right-${n}`"
          class="h-10 w-full rounded-none border-b border-border last:border-b-0"
        />
      </div>
    </div>
  </div>

  <div
    v-else-if="variant === 'infra-pipeline'"
    class="relative min-h-[180px] overflow-hidden rounded-md border border-solid border-border/50 bg-sidebar p-4 flex flex-col gap-3"
  >
    <div class="flex w-full items-center justify-between">
      <Skeleton class="h-3 w-24" />
      <Skeleton class="h-3 w-14" />
    </div>
    <div
      class="grid w-full items-stretch"
      style="grid-template-columns: 1fr 12px 1fr 12px 1fr 12px 1fr 12px 1fr"
    >
      <template v-for="n in 9" :key="n">
        <Skeleton v-if="n % 2 === 1" class="h-[62px] w-full rounded-md" />
        <div v-else class="bg-border my-auto h-px w-full" />
      </template>
    </div>
    <Skeleton class="mx-auto h-3 w-48" />
  </div>

  <div
    v-else-if="variant === 'traffic'"
    class="overflow-hidden rounded-md border border-border/50 bg-sidebar"
  >
    <div
      class="flex items-center justify-between border-b border-border px-5 py-4"
    >
      <div class="flex flex-col gap-2">
        <Skeleton class="h-4 w-24" />
        <Skeleton class="h-3 w-36" />
      </div>
      <Skeleton class="h-7 w-14" />
    </div>
    <div class="flex flex-col gap-5 px-5 py-5">
      <div class="flex items-end gap-8">
        <div class="flex flex-col gap-2">
          <Skeleton class="h-3 w-10" />
          <Skeleton class="h-9 w-16" />
        </div>
        <div class="flex flex-col gap-2">
          <Skeleton class="h-3 w-16" />
          <Skeleton class="h-7 w-20" />
        </div>
      </div>
      <div class="flex min-w-0 flex-col gap-[3px]">
        <div
          v-for="row in 7"
          :key="`row-${row}`"
          class="grid items-center gap-x-2"
          style="grid-template-columns: 2rem minmax(0, 1fr)"
        >
          <Skeleton class="h-[10px] w-6" />
          <div
            class="grid gap-[3px]"
            style="grid-template-columns: repeat(24, minmax(0, 1fr))"
          >
            <Skeleton
              v-for="col in 24"
              :key="`cell-${row}-${col}`"
              class="aspect-square min-h-[9px] rounded-md"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
