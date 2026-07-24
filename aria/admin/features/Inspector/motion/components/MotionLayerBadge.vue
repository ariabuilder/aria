<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";

interface Props {
  compact?: boolean;
}

withDefaults(defineProps<Props>(), {
  compact: false,
});
const { t } = useStudioI18n();
</script>

<template>
  <span
    class="inline-flex items-center gap-1 text-primary"
    :class="
      compact
        ? 'shrink-0'
        : 'rounded-sm border border-dashed border-primary/40 bg-accent-10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest'
    "
    :title="t('inspector.motion.enabled')"
  >
    <span :class="studioIcons.lightning" class="size-3" aria-hidden="true" />
    <span v-if="!compact">{{ t("inspector.motion.label") }}</span>
  </span>
</template>
