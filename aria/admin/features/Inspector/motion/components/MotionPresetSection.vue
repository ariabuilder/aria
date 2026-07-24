<script setup lang="ts">
import "../../../../../lib/motion/assets/aria-motion.css";
import { MOTION_PRESET_UI_DEFINITIONS } from "../presets/definitions";
import MotionPresetCard from "./MotionPresetCard.vue";
import type { MotionPresetId } from "../../../../../lib/motion/schemas/tokens.schema";

interface Props {
  preset?: MotionPresetId;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  select: [presetId: MotionPresetId];
}>();
</script>

<template>
  <div class="grid grid-cols-3 gap-2">
    <MotionPresetCard
      v-for="preset in MOTION_PRESET_UI_DEFINITIONS"
      :key="preset.id"
      :preset="preset"
      :active="props.preset === preset.id"
      @select="emit('select', preset.id)"
    />
  </div>
</template>
