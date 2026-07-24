<script setup lang="ts">
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    title: string;
    defaultOpen?: boolean;
  }>(),
  {
    defaultOpen: true,
  },
);

const emit = defineEmits<{
  create: [];
}>();

const isOpen = ref(props.defaultOpen);
</script>

<template>
  <div>
    <div
      class="flex items-center justify-between py-2 px-1 mb-1 select-none cursor-pointer hover:opacity-80 transition-opacity"
      @click="isOpen = !isOpen"
    >
      <div class="flex items-center gap-2">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="transition-transform duration-200"
          :class="{ 'rotate-0': isOpen, '-rotate-90': !isOpen }"
          :style="{ color: 'var(--color-text-secondary)' }"
        >
          <path d="M6 9l6 6 6-6"></path>
        </svg>
        <span
          class="text-xs font-bold tracking-tight uppercase"
          :style="{ color: 'var(--color-text-secondary)' }"
          >{{ title }}</span
        >
      </div>
      <div class="flex items-center gap-2">
        <slot name="actions">
          <button
            @click.stop="emit('create')"
            class="p-1 rounded transition-colors create-button"
            :style="{ color: 'var(--color-text-secondary)' }"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </slot>
      </div>
    </div>

    <div class="space-y-1 text-xs px-1 mb-6" v-show="isOpen">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.create-button:hover {
  background-color: var(--color-primary);
  color: var(--color-white) !important;
}
</style>
