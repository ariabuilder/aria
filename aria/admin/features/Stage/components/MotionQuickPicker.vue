<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { studioIcons } from "@/lib/icons";
import { MOTION_PRESET_UI_DEFINITIONS } from "../../Inspector/motion/presets/definitions";
import type { MotionPresetId } from "../../../../lib/motion/schemas/tokens.schema";
import { useMotionLabels } from "../../Inspector/motion/composables/useMotionLabels";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  icon: string;
  active?: boolean;
  selectedPresetId: MotionPresetId | null;
  error?: string;
}>();

const emit = defineEmits<{
  select: [presetId: MotionPresetId];
}>();

const open = ref(false);
const { t } = useStudioI18n();
const { label: motionLabel } = useMotionLabels();

const options = [
  {
    id: "none" as MotionPresetId,
    label: t("composer.toolbar.motion.off"),
    description: t("composer.toolbar.motion.noMotion"),
  },
  ...MOTION_PRESET_UI_DEFINITIONS.map((preset) => ({
    id: preset.id,
    label: motionLabel("preset", preset.id, preset.label),
    description: preset.trigger === "now"
      ? t("inspector.motion.trigger.now")
      : t("inspector.motion.trigger.reveal"),
  })),
];

function selectPreset(presetId: MotionPresetId): void {
  emit("select", presetId);
  open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        class="shrink-0 h-6! w-6!"
        :class="{ '!text-primary': active || open }"
        :title="t('composer.toolbar.motion.title')"
        :aria-label="t('composer.toolbar.motion.title')"
        :aria-pressed="active || open"
      >
        <span :class="[icon, 'size-3.5 shrink-0', active || open ? '!text-primary' : '']" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      side="bottom"
      class="motion-quick-picker w-60 overflow-hidden p-0"
      :side-offset="3"
      @click.stop
    >
      <div class="motion-quick-head">
        <span :class="[icon, 'size-3.5 text-primary']" />
        <span class="min-w-0 flex-1 truncate">{{ t("composer.toolbar.motion.title") }}</span>
      </div>

      <Command>
        <CommandList class="max-h-72">
          <CommandGroup>
            <CommandItem
              v-for="option in options"
              :key="option.id"
              :value="`${option.label} ${option.description}`"
              class="gap-2"
              @select="selectPreset(option.id)"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate text-xs text-foreground">
                  {{ option.label }}
                </span>
                <span class="block truncate text-2xs text-muted-foreground">
                  {{ option.description }}
                </span>
              </span>
              <span
                v-if="option.id === props.selectedPresetId"
                :class="[studioIcons.check, 'size-3.5 text-primary']"
              />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>

      <div
        v-if="error"
        class="border-t border-dashed border-border/50 px-3 py-2 text-2xs text-destructive"
      >
        {{ error }}
      </div>
    </PopoverContent>
  </Popover>
</template>

<style scoped>
.motion-quick-picker {
  border-radius: 8px;
  border-style: solid;
  background: var(--background);
  color: var(--foreground);
  box-shadow: 0 10px 28px rgb(0 0 0 / 0.18);
  transform-origin: top left;
  animation: motion-quick-open 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.dark .motion-quick-picker {
  background: var(--sidebar);
}

.motion-quick-head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.375rem;
  border-bottom: 1px dashed color-mix(in oklch, var(--border) 50%, transparent);
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
}

@keyframes motion-quick-open {
  from {
    width: 2.5rem;
    max-height: 2.5rem;
    opacity: 0.8;
    border-radius: 999px;
    transform: scale(0.98);
  }
  to {
    width: 15rem;
    max-height: 22rem;
    opacity: 1;
    border-radius: 8px;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .motion-quick-picker {
    animation: none !important;
  }
}
</style>
