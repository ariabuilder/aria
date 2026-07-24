<script setup lang="ts">
import { computed } from "vue";
import { requiresMotionRuntime } from "../../../../../lib/motion/runtime/requiresMotionRuntime";
import type { BuilderNode } from "../../../../../lib/types/nodes";
import type { NodeMotion } from "../../../../../lib/motion/schemas/nodeMotion.schema";
import MotionSectionHint from "./shared/MotionSectionHint.vue";
import { useStudioI18n } from "@/i18n";

interface Props {
  motion: NodeMotion;
}

const props = defineProps<Props>();
const { t } = useStudioI18n();

const needsRuntime = computed(() => {
  const node = { motion: props.motion } as BuilderNode;
  return requiresMotionRuntime([node]);
});
</script>

<template>
  <MotionSectionHint
    :text="
      needsRuntime
        ? t('inspector.motion.runtimeScriptHint')
        : t('inspector.motion.cssOnlyHint')
    "
  />
</template>
