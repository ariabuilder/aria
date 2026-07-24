<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { useStudioI18n } from "@/i18n";
import AriaLogoMark from "./AriaLogoMark.vue";

const props = defineProps<{
  collapsed: boolean;
}>();

const emit = defineEmits<{
  navigate: [];
}>();

const { t } = useStudioI18n();
</script>

<template>
  <div
    :class="[
      'flex h-14 shrink-0 items-center ',
      collapsed ? 'justify-center px-0' : 'mt-4 px-1',
    ]"
  >
    <Button
      variant="ghost"
      :class="[
        'h-auto text-lg font-normal transition-colors',
        collapsed
          ? 'w-full justify-center py-1.5'
          : 'w-full !justify-start gap-3 px-3 py-1.5',
      ]"
      :aria-label="t('sidebar.dashboard')"
      @click="emit('navigate')"
    >
      <div
        :class="[
          'flex aspect-square size-9 shrink-0 items-center text-foreground/90',
          collapsed ? 'justify-center' : 'justify-start',
        ]"
      >
        <AriaLogoMark class="size-8.5" />
      </div>
    </Button>
  </div>
</template>
