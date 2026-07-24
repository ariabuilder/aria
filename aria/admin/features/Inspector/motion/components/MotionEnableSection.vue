<script setup lang="ts">
import { Switch } from "@/components/ui/switch";
import MotionPropertyRow from "./shared/MotionPropertyRow.vue";
import { useStudioI18n } from "@/i18n";

interface Props {
  enabled: boolean;
  disabled?: boolean;
}

withDefaults(defineProps<Props>(), {
  disabled: false,
});
const { t } = useStudioI18n();

const emit = defineEmits<{
  "update:enabled": [value: boolean];
}>();
</script>

<template>
  <MotionPropertyRow :label="t('inspector.motion.enable')">
    <Switch
      :model-value="enabled"
      :disabled="disabled"
      @update:model-value="emit('update:enabled', Boolean($event))"
    />
  </MotionPropertyRow>
</template>
