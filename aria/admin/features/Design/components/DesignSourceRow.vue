<script setup lang="ts">
import { Button } from "@/components/ui/button";

withDefaults(
  defineProps<{
    title: string;
    meta?: string;
    status?: string;
    active?: boolean;
    disabled?: boolean;
    actionLabel?: string;
    icon?: string;
    toneClass?: string;
  }>(),
  {
    meta: "",
    status: "",
    active: false,
    disabled: false,
    actionLabel: "",
    icon: "",
    toneClass: "text-primary",
  },
);

defineEmits<{
  action: [];
}>();
</script>

<template>
  <article
    class="group flex min-w-0 items-center gap-3 rounded-sm border border-dashed border-border/50 bg-card/25 px-3 py-2.5 transition-colors hover:border-border"
    :class="active ? 'border-primary/40 bg-primary/5' : ''"
  >
    <div
      class="grid size-9 shrink-0 place-items-center rounded-sm border border-dashed border-border bg-background/70"
      :class="toneClass"
    >
      <slot name="icon">
        <span v-if="icon" :class="[icon, 'size-4']" aria-hidden="true" />
      </slot>
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-2">
        <h3 class="truncate text-sm font-serif font-medium text-foreground">
          {{ title }}
        </h3>
        <span
          v-if="status"
          class="shrink-0 rounded-sm border border-dashed border-border px-1.5 py-0.5 text-2xs font-mono text-muted-foreground"
        >
          {{ status }}
        </span>
      </div>
      <p v-if="meta" class="truncate text-xs text-muted-foreground/75">
        {{ meta }}
      </p>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <slot name="preview" />
      <Button
        v-if="actionLabel"
        :variant="active ? 'outline' : 'default'"
        size="sm"
        :disabled="disabled"
        @click="$emit('action')"
      >
        {{ actionLabel }}
      </Button>
      <slot name="end" />
    </div>
  </article>
</template>
