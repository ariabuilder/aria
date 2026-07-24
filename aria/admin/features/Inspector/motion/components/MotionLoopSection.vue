<script setup lang="ts">
import { MOTION_LOOP_OPTIONS } from "../tokens/loopOptions";
import MotionSelectField from "./shared/MotionSelectField.vue";
import { useMotionLabels } from "../composables/useMotionLabels";
import { useStudioI18n } from "@/i18n";
import type { MotionLoopId } from "../../../../../lib/motion/schemas/tokens.schema";

interface Props {
  loop?: MotionLoopId;
}

defineProps<Props>();
const { t } = useStudioI18n();
const { options: motionOptions } = useMotionLabels();

const emit = defineEmits<{
  "update:loop": [value: MotionLoopId | undefined];
}>();
</script>

<template>
  <MotionSelectField
    :label="t('inspector.motion.section.loop')"
    :model-value="loop"
    :options="[{ id: 'none', label: t('inspector.motion.none') }, ...motionOptions('loop', MOTION_LOOP_OPTIONS)]"
    :placeholder="t('inspector.motion.none')"
    @update:model-value="
      emit('update:loop', $event === 'none' ? undefined : ($event as MotionLoopId))
    "
  />
</template>
