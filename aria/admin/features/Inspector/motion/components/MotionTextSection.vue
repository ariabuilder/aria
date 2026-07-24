<script setup lang="ts">
import MotionSelectField from "./shared/MotionSelectField.vue";
import MotionSectionHint from "./shared/MotionSectionHint.vue";
import { useStudioI18n } from "@/i18n";

interface Props {
  mode?: "words" | "chars";
}

defineProps<Props>();
const { t } = useStudioI18n();

const emit = defineEmits<{
  "update:mode": [value: "words" | "chars"];
}>();

const MODE_OPTIONS = [
  { id: "words", label: t("inspector.motion.words") },
  { id: "chars", label: t("inspector.motion.characters") },
];
</script>

<template>
  <div class="space-y-2">
    <MotionSelectField
      :label="t('inspector.motion.split')"
      :model-value="mode"
      :options="MODE_OPTIONS"
      @update:model-value="emit('update:mode', $event as 'words' | 'chars')"
    />
    <MotionSectionHint
      :text="t('inspector.motion.textRuntimeHint')"
    />
  </div>
</template>
