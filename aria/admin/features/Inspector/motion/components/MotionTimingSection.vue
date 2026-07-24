<script setup lang="ts">
import { computed } from "vue";
import { MOTION_SPEED_OPTIONS } from "../tokens/speedOptions";
import { MOTION_EASING_OPTIONS } from "../tokens/easingOptions";
import { MOTION_DISTANCE_OPTIONS } from "../tokens/distanceOptions";
import { MOTION_DELAY_OPTIONS } from "../tokens/delayOptions";
import MotionSelectField from "./shared/MotionSelectField.vue";
import { useMotionLabels } from "../composables/useMotionLabels";
import { useStudioI18n } from "@/i18n";
import type {
  MotionDelayId,
  MotionDistanceId,
  MotionEasingId,
  MotionSpeedId,
} from "../../../../../lib/motion/schemas/tokens.schema";

interface Props {
  speed?: MotionSpeedId;
  easing?: MotionEasingId;
  distance?: MotionDistanceId;
  delay?: MotionDelayId;
}

defineProps<Props>();
const { t } = useStudioI18n();
const { options: motionOptions } = useMotionLabels();
const delayOptions = computed(() =>
  MOTION_DELAY_OPTIONS.map((option) =>
    option.id === "0"
      ? { ...option, label: t("inspector.motion.none") }
      : option,
  ),
);

const emit = defineEmits<{
  "update:speed": [value: MotionSpeedId];
  "update:easing": [value: MotionEasingId];
  "update:distance": [value: MotionDistanceId];
  "update:delay": [value: MotionDelayId];
}>();
</script>

<template>
  <div class="space-y-2">
    <MotionSelectField
      :label="t('inspector.motion.speed')"
      :model-value="speed"
      :options="motionOptions('speed', MOTION_SPEED_OPTIONS)"
      @update:model-value="emit('update:speed', $event as MotionSpeedId)"
    />
    <MotionSelectField
      :label="t('inspector.motion.easing')"
      :model-value="easing"
      :options="motionOptions('easing', MOTION_EASING_OPTIONS)"
      @update:model-value="emit('update:easing', $event as MotionEasingId)"
    />
    <MotionSelectField
      :label="t('inspector.motion.distance')"
      :model-value="distance"
      :options="motionOptions('distance', MOTION_DISTANCE_OPTIONS)"
      @update:model-value="emit('update:distance', $event as MotionDistanceId)"
    />
    <MotionSelectField
      :label="t('inspector.motion.delay')"
      :model-value="delay"
      :options="delayOptions"
      @update:model-value="emit('update:delay', $event as MotionDelayId)"
    />
  </div>
</template>
