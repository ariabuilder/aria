<script setup lang="ts">
import { Separator } from "@/components/ui/separator"

interface Props {
  label: string
  description?: string
}

defineProps<Props>()
</script>

<template>
  <section class="space-y-4">
    <div>
      <h3 class="text-sm font-medium">{{ label }}</h3>
      <p v-if="description" class="text-xs text-muted-foreground mt-0.5">
        {{ description }}
      </p>
    </div>
    <Separator />
    <div>
      <slot />
    </div>
  </section>
</template>
