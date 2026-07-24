<script setup lang="ts">
import { formatCompactCount } from "@/lib/metrics/format";

defineProps<{
  label: string;
  value: number;
  period?: string;
}>();
</script>

<template>
  <div class="min-w-0">
    <p class="text-2xs uppercase tracking-wide text-muted-foreground">
      {{ label }}
    </p>
    <p class="text-lg font-semibold tabular-nums text-foreground">
      {{ formatCompactCount(value) }}
      <span v-if="period" class="text-2xs font-normal text-muted-foreground">
        {{ period }}
      </span>
    </p>
  </div>
</template>
