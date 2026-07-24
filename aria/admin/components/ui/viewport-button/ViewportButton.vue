<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  active?: boolean;
  disabled?: boolean;
  icon: "2xl" | "xl" | "md" | "xs";
  label: string;
}>();
</script>

<template>
  <Button
    v-bind="$attrs"
    variant="sidebar-action"
    size="icon-sm"
    :title="label"
    :aria-label="label"
    :disabled="disabled"
    :class="
      cn(
        'size-7 shrink-0 p-0',
        props.active && 'bg-muted text-foreground hover:bg-muted hover:text-foreground',
      )
    "
  >
    <span :class="['icon', `icon-viewport-${icon}`]" />
  </Button>
</template>

<style scoped>
.icon {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  background-color: currentColor;
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
}

.icon-viewport-2xl {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='3' width='20' height='14' rx='2' ry='2'/%3E%3Cline x1='2' y1='20' x2='22' y2='20'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='3' width='20' height='14' rx='2' ry='2'/%3E%3Cline x1='2' y1='20' x2='22' y2='20'/%3E%3C/svg%3E");
}

.icon-viewport-xl {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='3' width='20' height='14' rx='2' ry='2'/%3E%3Cline x1='2' y1='20' x2='22' y2='20'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='3' width='20' height='14' rx='2' ry='2'/%3E%3Cline x1='2' y1='20' x2='22' y2='20'/%3E%3C/svg%3E");
}

.icon-viewport-md {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='5' y='2' width='14' height='20' rx='2' ry='2'/%3E%3Cline x1='5' y1='7' x2='19' y2='7'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='5' y='2' width='14' height='20' rx='2' ry='2'/%3E%3Cline x1='5' y1='7' x2='19' y2='7'/%3E%3C/svg%3E");
}

.icon-viewport-xs {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='7' y='2' width='10' height='20' rx='2' ry='2'/%3E%3Cline x1='7' y1='6' x2='17' y2='6'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='7' y='2' width='10' height='20' rx='2' ry='2'/%3E%3Cline x1='7' y1='6' x2='17' y2='6'/%3E%3C/svg%3E");
}
</style>
