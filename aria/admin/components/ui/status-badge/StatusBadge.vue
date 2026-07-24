<script setup lang="ts">
const props = defineProps<{
  status: "draft" | "published" | "unused" | "active" | "bound";
  count?: number;
}>();

const config = {
  draft: {
    color: "var(--draft)",
    bgColor: "color-mix(in oklch, var(--draft) 10%, transparent)",
    borderColor: "color-mix(in oklch, var(--draft) 30%, transparent)",
    dotColor: "var(--draft)",
    label: "Draft",
  },
  published: {
    color: "var(--published)",
    bgColor: "color-mix(in oklch, var(--published) 10%, transparent)",
    borderColor: "color-mix(in oklch, var(--published) 30%, transparent)",
    dotColor: "var(--published)",
    label: "Published",
  },
  unused: {
    color: "var(--color-text-tertiary)",
    bgColor: "transparent",
    borderColor: "transparent",
    dotColor: "transparent",
    label: "Unused",
  },
  active: {
    color: "var(--primary)",
    bgColor: "color-mix(in oklch, var(--primary) 10%, transparent)",
    borderColor: "color-mix(in oklch, var(--primary) 30%, transparent)",
    dotColor: "var(--primary)",
    label: "Active",
  },
  bound: {
    color: "var(--published)",
    bgColor: "color-mix(in oklch, var(--published) 10%, transparent)",
    borderColor: "color-mix(in oklch, var(--published) 50%, transparent)",
    dotColor: "var(--published)",
    label: "Bound",
  },
};

const currentConfig = config[props.status];
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2 py-0.5 text-xxs font-medium"
    :style="{
      color: currentConfig.color,
      backgroundColor: currentConfig.bgColor,
      border: `1px solid ${currentConfig.borderColor}`,
    }"
  >
    <span
      v-if="status !== 'unused'"
      class="h-1.5 w-1.5 rounded-full mr-1"
      :style="{ backgroundColor: currentConfig.dotColor }"
    ></span>
    <span>{{ currentConfig.label }}</span>
    <span v-if="count !== undefined" class="ml-1">{{ count }}</span>
  </span>
</template>
