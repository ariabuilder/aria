<script setup lang="ts">
import { Button } from "@/components/ui/button";
import Breadcrumbs from "./Breadcrumbs.vue";
import type { BreadcrumbItem } from "./Breadcrumbs.vue";

interface Props {
  title: string;
  breadcrumbs?: BreadcrumbItem[];
  entity?: string;
  slug?: string;
}

defineProps<Props>();

const emit = defineEmits<{
  save: [];
  cancel: [];
}>();
</script>

<template>
  <header
    class="flex h-10 shrink-0 items-center bg-muted/50 justify-between border-b-0"
  >
    <div class="flex items-center gap-3 min-w-0">
      <slot name="back">
        <Breadcrumbs v-if="breadcrumbs" :items="breadcrumbs" />
      </slot>
      <div class="flex items-center gap-2 min-w-0">
        <h1
          class="text-sm pl-2 font-medium text-muted-foreground capitalize truncate"
          :style="
            entity && slug
              ? { viewTransitionName: `${entity}-${slug}-title` as string }
              : undefined
          "
        >
          {{ title }}
        </h1>
        <slot name="title-extra" />
      </div>
    </div>
    <div class="flex items-center gap-0 [&>*:not(:first-child)]:-ml-px">
      <slot name="actions">
        <Button variant="header-btn-destructive" @click="emit('cancel')"
          >Cancel</Button
        >
        <Button variant="header-btn-outline" @click="emit('save')">Save</Button>
      </slot>
    </div>
  </header>
</template>
