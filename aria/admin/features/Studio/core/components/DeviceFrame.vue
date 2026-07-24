<script setup lang="ts">
interface Props {
  device?: "mobile" | "tablet" | "desktop"
}

withDefaults(defineProps<Props>(), {
  device: "desktop",
})
</script>

<template>
  <div
    class="mx-auto overflow-hidden rounded-lg border bg-card shadow-sm transition-all duration-300"
    :class="{
      'max-w-[375px]': device === 'mobile',
      'max-w-[768px]': device === 'tablet',
      'max-w-full': device === 'desktop',
    }"
  >
    <div class="flex items-center justify-between bg-muted px-4 py-2">
      <div class="flex gap-1.5">
        <span class="h-3 w-3 rounded-full bg-destructive/60" />
        <span class="h-3 w-3 rounded-full bg-amber-500/60" />
        <span class="h-3 w-3 rounded-full bg-emerald-500/60" />
      </div>
      <div v-if="device === 'mobile'" class="mx-auto h-2 w-20 rounded-full bg-muted-foreground/20" />
      <div class="w-14" />
    </div>
    <div class="bg-background">
      <slot />
    </div>
  </div>
</template>
