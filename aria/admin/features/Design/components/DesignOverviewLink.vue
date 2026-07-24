<script setup lang="ts">
defineProps<{
  icon: string;
  title: string;
  description: string;
}>();
</script>

<template>
  <button
    type="button"
    class="group flex w-full items-start gap-4 rounded-sm px-3 py-4 text-left transition-colors hover:bg-sidebar hover:cursor-pointer"
  >
    <div
      class="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary/5"
    >
      <span :class="[icon, 'size-4 text-primary']" aria-hidden="true" />
    </div>
    <div class="min-w-0 pt-0.5">
      <span
        class="text-sm font-medium text-foreground group-hover:text-primary transition-colors duration-100"
      >
        {{ title }}
      </span>
      <p class="mt-0.5 text-sm text-muted-foreground">
        {{ description }}
      </p>
      <div v-if="$slots.detail" class="mt-2">
        <slot name="detail" />
      </div>
    </div>
  </button>
</template>
