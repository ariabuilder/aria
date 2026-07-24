<script setup lang="ts">
import {
  INSPECTOR_CHIP_TOGGLE_ACTIVE_CLASS,
  INSPECTOR_CHIP_TOGGLE_CLASS,
} from "../../../constants/panelTokens";

interface Props {
  active?: boolean;
  label: string;
}

withDefaults(defineProps<Props>(), {
  active: false,
});

const emit = defineEmits<{
  click: [];
}>();
</script>

<template>
  <button
    type="button"
    :class="[
      INSPECTOR_CHIP_TOGGLE_CLASS,
      active ? INSPECTOR_CHIP_TOGGLE_ACTIVE_CLASS : '',
    ]"
    @click="emit('click')"
  >
    {{ label }}
  </button>
</template>
