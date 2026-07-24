<script setup lang="ts">
defineProps<{
  title: string;
  eyebrow?: string;
}>();
</script>

<template>
  <section
    class="rounded-sm border border-dashed border-border/50 bg-background/70"
  >
    <div
      class="flex min-h-12 items-center justify-between gap-4 border-b border-dashed border-border/50 px-4 py-3"
    >
      <div class="min-w-0">
        <p
          v-if="eyebrow"
          class="text-2xs font-medium uppercase tracking-[0.18em] text-muted-foreground/75"
        >
          {{ eyebrow }}
        </p>
        <h2 class="truncate text-sm font-serif font-medium text-foreground">
          {{ title }}
        </h2>
      </div>
      <slot name="actions" />
    </div>
    <div class="p-3">
      <slot />
    </div>
  </section>
</template>
