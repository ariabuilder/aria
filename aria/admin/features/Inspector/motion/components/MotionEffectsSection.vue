<script setup lang="ts">
import { MOTION_EFFECT_OPTIONS } from "../tokens/effectOptions";
import MotionOptionChip from "./shared/MotionOptionChip.vue";
import { useMotionLabels } from "../composables/useMotionLabels";
import type { MotionEffectId } from "../../../../../lib/motion/schemas/tokens.schema";

interface Props {
  effects?: MotionEffectId[];
}

const props = withDefaults(defineProps<Props>(), {
  effects: () => [],
});
const { options: motionOptions } = useMotionLabels();

const emit = defineEmits<{
  toggle: [effectId: MotionEffectId];
}>();

function isActive(id: MotionEffectId): boolean {
  return props.effects.includes(id);
}
</script>

<template>
  <div class="grid grid-cols-2 gap-1.5">
    <MotionOptionChip
      v-for="option in motionOptions('effect', MOTION_EFFECT_OPTIONS)"
      :key="option.id"
      :label="option.label"
      :active="isActive(option.id)"
      @click="emit('toggle', option.id)"
    />
  </div>
</template>
