<script setup lang="ts">
import { MOTION_TRIGGER_OPTIONS } from "../tokens/triggerOptions";
import MotionSelectField from "./shared/MotionSelectField.vue";
import { useMotionLabels } from "../composables/useMotionLabels";
import { useStudioI18n } from "@/i18n";
import type { MotionTriggerId } from "../../../../../lib/motion/schemas/tokens.schema";

interface Props {
  trigger: MotionTriggerId;
}

defineProps<Props>();
const { t } = useStudioI18n();
const { options: motionOptions } = useMotionLabels();

const emit = defineEmits<{
  "update:trigger": [value: MotionTriggerId];
}>();
</script>

<template>
  <MotionSelectField
    :label="t('inspector.motion.when')"
    :model-value="trigger"
    :options="motionOptions('trigger', MOTION_TRIGGER_OPTIONS)"
    @update:model-value="emit('update:trigger', $event as MotionTriggerId)"
  />
</template>
