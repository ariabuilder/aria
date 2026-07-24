<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <Card
    :class="
      cn(
        'dashboard-frame relative gap-0 overflow-hidden rounded-sm border border-border/50! bg-background! shadow-none',
        $props.class,
      )
    "
  >
    <slot />
  </Card>
</template>
