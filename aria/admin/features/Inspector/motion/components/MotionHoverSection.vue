<script setup lang="ts">
import { MOTION_HOVER_OPTIONS } from "../tokens/hoverOptions";
import MotionOptionChip from "./shared/MotionOptionChip.vue";
import { useMotionLabels } from "../composables/useMotionLabels";
import type { MotionHoverId } from "../../../../../lib/motion/schemas/tokens.schema";

interface Props {
  hover?: MotionHoverId[];
}

const props = withDefaults(defineProps<Props>(), {
  hover: () => [],
});
const { options: motionOptions } = useMotionLabels();

const emit = defineEmits<{
  toggle: [hoverId: MotionHoverId];
}>();

function isActive(id: MotionHoverId): boolean {
  return props.hover?.includes(id) ?? false;
}
</script>

<template>
  <div class="grid grid-cols-2 gap-1.5">
    <MotionOptionChip
      v-for="option in motionOptions('hover', MOTION_HOVER_OPTIONS)"
      :key="option.id"
      :label="option.label"
      :active="isActive(option.id)"
      @click="emit('toggle', option.id)"
    />
  </div>
</template>
