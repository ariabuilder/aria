<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";

interface Props {
  icon?: string;
  entityLabel: string;
  entityLabelSingular?: string;
  title?: string;
  description?: string;
  hideAction?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  icon: "i-hugeicons:file-01",
  hideAction: false,
});

const emit = defineEmits<{
  create: [];
}>();

const singular = computed(
  () => props.entityLabelSingular || props.entityLabel.replace(/s$/, ""),
);

const displayTitle = computed(() => {
  if (props.title) return props.title;
  if (props.description) return "No results";
  return `Build your first ${singular.value}`;
});

const displayDescription = computed(
  () =>
    props.description ||
    `Create a ${singular.value} to get started, then open it in the composer when you're ready to design.`,
);

const createLabel = computed(() => `Create ${singular.value}`);
</script>

<template>
  <div class="flex min-h-[min(420px,50vh)] w-full items-center justify-center px-6 py-16">
    <div
      class="empty-list-zone w-full max-w-md rounded-sm border border-dashed border-border/50 bg-sidebar px-8 py-10 text-center"
    >
      <div
        class="mx-auto mb-5 flex size-12 items-center justify-center rounded-md border border-dashed border-border/50 bg-background/60"
      >
        <span :class="[props.icon, 'size-5 text-muted-foreground']" />
      </div>

      <h3 class="text-base font-medium tracking-tight text-foreground">
        {{ displayTitle }}
      </h3>
      <p class="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {{ displayDescription }}
      </p>

      <Button
        v-if="!hideAction"
        class="mt-6"
        size="sm"
        @click="emit('create')"
      >
        {{ createLabel }}
        <span class="i-hugeicons:plus-sign ml-1.5 size-3.5" />
      </Button>
    </div>
  </div>
</template>

<style scoped>
</style>
