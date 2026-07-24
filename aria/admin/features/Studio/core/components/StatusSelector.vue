<script setup lang="ts">
const modelValue = defineModel<string>({ required: true })

const options = [
  { value: "published", label: "Published", description: "Visible on storefront" },
  { value: "draft", label: "Draft", description: "Hidden from customers" },
]
</script>

<template>
  <div class="grid grid-cols-2 gap-2">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :class="{
        'border-2 border-primary bg-background': modelValue === option.value,
        'border border-border hover:border-primary/50': modelValue !== option.value,
      }"
      class="flex items-center gap-3 rounded-lg p-4 text-left transition-all"
      @click="modelValue = option.value"
    >
      <div
        class="h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0"
        :class="modelValue === option.value ? 'border-primary' : 'border-muted-foreground'"
      >
        <div v-if="modelValue === option.value" class="h-2.5 w-2.5 rounded-full bg-primary" />
      </div>
      <div>
        <div class="font-medium capitalize">{{ option.label }}</div>
        <div class="text-xs text-muted-foreground">
          {{ option.description }}
        </div>
      </div>
    </button>
  </div>
</template>
