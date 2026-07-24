<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { studioIcons } from "@/lib/icons";
import { useStudioRouter } from "@/features/Studio/core/composables";

defineProps<{
  title: string;
  subtitle?: string;
  backRoute?: string;
}>();

const emit = defineEmits<{
  save: [];
  cancel: [];
}>();

const router = useStudioRouter();

function handleBack() {
  router.stopEditing();
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header class="flex h-14 shrink-0 items-center justify-between px-6">
      <div class="flex items-center gap-3">
        <Button variant="ghost" size="icon" @click="handleBack">
          <span :class="[studioIcons.arrowLeft, 'size-4']" />
        </Button>
        <div class="flex flex-row items-baseline space-between gap-2">
          <h1 class="text-lg leading-2 font-medium">{{ title }}</h1>
          <p v-if="subtitle" class="text-xs leading-0 text-muted-foreground">
            {{ subtitle }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" @click="emit('cancel')"> Cancel </Button>
        <Button @click="emit('save')"> Save </Button>
      </div>
    </header>

    <Separator />

    <!-- Content -->
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <!-- Main Column (7/12) -->
      <div class="flex min-w-0 flex-[7] flex-col overflow-y-auto border-r p-6">
        <slot name="main" />
      </div>

      <!-- Side Column (5/12) -->
      <div class="flex flex-[5] flex-col overflow-y-auto p-6">
        <slot name="side" />
      </div>
    </div>
  </div>
</template>
