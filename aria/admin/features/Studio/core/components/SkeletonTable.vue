<script setup lang="ts">
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  rows?: number
  columns?: number
}

withDefaults(defineProps<Props>(), {
  rows: 5,
  columns: 4,
})
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-4 pb-3 border-b border-border">
      <Skeleton v-for="c in columns" :key="c" class="h-4 flex-1" />
    </div>
    <Skeleton v-for="r in rows" :key="r" class="h-14 w-full" />
  </div>
</template>
