<script setup lang="ts">
/**
 * MotionStaggerSection — Stagger preset cards with live previews.
 *
 * @component
 */
import { computed, nextTick, onUnmounted, ref } from "vue";
import { Input } from "@/components/ui/input";
import { INSPECTOR_INPUT_CLASS } from "../../constants/panelTokens";
import MotionSectionHint from "./shared/MotionSectionHint.vue";
import { useStudioI18n } from "@/i18n";

interface StaggerPreset {
  id: string;
  label: string;
  interval: number;
  description: string;
}

const PRESETS: StaggerPreset[] = [
  {
    id: "conveyor",
    label: "Conveyor",
    interval: 20,
    description: "Rapid fire — children animate in quick succession",
  },
  {
    id: "swift",
    label: "Swift",
    interval: 40,
    description: "Brisk cascade — faster than a standard cascade",
  },
  {
    id: "cascade",
    label: "Cascade",
    interval: 60,
    description: "Smooth waterfall — gentle follow-through",
  },
  {
    id: "ripple",
    label: "Ripple",
    interval: 120,
    description: "Visible wave — each child follows the last",
  },
  {
    id: "unfold",
    label: "Unfold",
    interval: 250,
    description: "Dramatic reveal — one child at a time",
  },
];
const { t } = useStudioI18n();

function staggerLabel(id: string, fallback: string): string {
  const keys = {
    conveyor: "inspector.motion.stagger.conveyor",
    swift: "inspector.motion.stagger.swift",
    cascade: "inspector.motion.stagger.cascade",
    ripple: "inspector.motion.stagger.ripple",
    unfold: "inspector.motion.stagger.unfold",
  } as const;
  return id in keys ? t(keys[id as keyof typeof keys]) : fallback;
}

function staggerDescription(id: string, fallback: string): string {
  const keys = {
    conveyor: "inspector.motion.stagger.conveyorDescription",
    swift: "inspector.motion.stagger.swiftDescription",
    cascade: "inspector.motion.stagger.cascadeDescription",
    ripple: "inspector.motion.stagger.rippleDescription",
    unfold: "inspector.motion.stagger.unfoldDescription",
  } as const;
  return id in keys ? t(keys[id as keyof typeof keys]) : fallback;
}

const DOT_COUNT = 4;

interface Props {
  interval?: number;
}

const props = withDefaults(defineProps<Props>(), {
  interval: undefined,
});

const emit = defineEmits<{
  "update:interval": [value: number | undefined];
}>();

const hoveredPresetId = ref<string | null>(null);
const staggerActive = ref(false);
let previewTimer: ReturnType<typeof setTimeout> | null = null;
let loopGeneration = 0;

function clearPendingTimers() {
  if (previewTimer !== null) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }
}

async function runStaggerPreview(preset: StaggerPreset, generation: number) {
  staggerActive.value = false;
  await nextTick();
  await nextTick();

  if (generation !== loopGeneration) return;

  while (generation === loopGeneration) {
    staggerActive.value = true;

    const totalDuration = preset.interval * DOT_COUNT + 400;
    await new Promise<void>((resolve) => {
      previewTimer = setTimeout(() => {
        if (generation === loopGeneration) {
          staggerActive.value = false;
        }
        resolve();
      }, totalDuration);
    });

    if (generation !== loopGeneration) break;

    await new Promise<void>((resolve) => {
      previewTimer = setTimeout(resolve, 200);
    });
  }
}

function beginPreview(preset: StaggerPreset) {
  loopGeneration++;
  clearPendingTimers();
  hoveredPresetId.value = preset.id;
  const gen = loopGeneration;
  previewTimer = setTimeout(() => runStaggerPreview(preset, gen), 100);
}

function endPreview() {
  loopGeneration++;
  clearPendingTimers();
  hoveredPresetId.value = null;
  staggerActive.value = false;
}

onUnmounted(() => {
  loopGeneration++;
  clearPendingTimers();
});

const activePresetId = computed(() => {
  if (props.interval === undefined) return undefined;
  const match = PRESETS.find((p) => p.interval === props.interval);
  return match ? match.id : "custom";
});

const isCustom = computed(() => activePresetId.value === "custom");

function selectPreset(preset: StaggerPreset) {
  emit("update:interval", preset.interval);
}

function selectCustom() {
  if (!isCustom.value) {
    // Pick a value that isn't already a preset interval so isCustom becomes true
    emit("update:interval", 90);
  }
}

function onCustomInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  emit(
    "update:interval",
    Number.isFinite(value) && value > 0 ? value : undefined,
  );
}
</script>

<template>
  <div class="space-y-3">
    <!-- Preset cards grid (5 presets + 1 custom = 6 cards = 3x2) -->
    <div class="grid grid-cols-2 gap-2">
      <!-- Preset cards -->
      <button
        v-for="preset in PRESETS"
        :key="preset.id"
        type="button"
        class="relative flex flex-col gap-2 overflow-hidden rounded-md bg-background p-2.5 text-center items-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-solid transition-colors"
        :class="
          activePresetId === preset.id
            ? 'border-primary/80'
            : 'border-transparent hover:border-border/50'
        "
        :title="staggerDescription(preset.id, preset.description)"
        @click="selectPreset(preset)"
        @pointerenter="beginPreview(preset)"
        @pointerleave="endPreview"
        @focusin="beginPreview(preset)"
        @focusout="endPreview"
      >
        <!-- Dots -->
        <div
          class="relative z-[1] grid grid-cols-4 gap-1.5 p-1 w-full"
          aria-hidden="true"
        >
          <span
            v-for="i in DOT_COUNT"
            :key="i"
            class="aspect-square w-full rounded-sm transition-all duration-[200ms]"
            :class="{
              'bg-primary opacity-100 scale-110':
                hoveredPresetId === preset.id && staggerActive,
              'bg-muted-foreground opacity-35 scale-90': !(
                hoveredPresetId === preset.id && staggerActive
              ),
            }"
            :style="{
              transitionDelay:
                hoveredPresetId === preset.id && staggerActive
                  ? `${(i - 1) * preset.interval}ms`
                  : '0ms',
            }"
          />
        </div>

        <!-- Label -->
        <div class="relative z-[1] flex items-center justify-center gap-1">
          <span
            class="text-2xs font-medium leading-tight transition-colors"
            :class="
              activePresetId === preset.id
                ? 'text-foreground'
                : 'text-muted-foreground/80'
            "
          >
            {{ staggerLabel(preset.id, preset.label) }}
          </span>
        </div>

        <!-- Glow -->
        <div
          class="pointer-events-none absolute left-1/2 bottom-0 z-0 h-[60%] w-[140%] -translate-x-1/2 rounded-full opacity-0 transition-opacity duration-200"
          :class="
            activePresetId === preset.id ? 'opacity-[0.15]' : 'opacity-[0.08]'
          "
          style="
            background: radial-gradient(
              ellipse 72% 68% at 50% 100%,
              rgb(var(--color-primary) / 1) 0%,
              rgb(var(--color-primary) / 0.4) 46%,
              transparent 72%
            );
          "
        />
      </button>

      <!-- Custom card -->
      <button
        type="button"
        class="relative flex flex-col gap-2 overflow-hidden rounded-md bg-background p-2.5 text-center items-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-solid transition-colors"
        :class="
          isCustom
            ? 'border-primary/80'
            : 'border-transparent hover:border-border/50'
        "
        :title="t('inspector.motion.stagger.customTitle')"
        @click="selectCustom"
      >
        <div
          class="relative z-[1] grid grid-cols-4 gap-1.5 p-1 w-full"
          aria-hidden="true"
        >
          <span
            v-for="i in DOT_COUNT"
            :key="i"
            class="aspect-square w-full rounded-sm bg-muted-foreground opacity-30 scale-90"
          />
        </div>

        <div class="relative z-[1] flex items-center justify-center gap-1">
          <span
            class="i-hugeicons:pen-01 size-3 shrink-0 text-muted-foreground"
          />
          <span
            class="text-2xs font-medium leading-tight transition-colors"
            :class="isCustom ? 'text-foreground' : 'text-muted-foreground/80'"
          >
            {{ t("inspector.motion.stagger.manual") }}
          </span>
        </div>

        <div
          class="pointer-events-none absolute left-1/2 bottom-0 z-0 h-[60%] w-[140%] -translate-x-1/2 rounded-full opacity-0 transition-opacity duration-200"
          :class="isCustom ? 'opacity-[0.15]' : 'opacity-[0.08]'"
          style="
            background: radial-gradient(
              ellipse 72% 68% at 50% 100%,
              rgb(var(--color-primary) / 1) 0%,
              rgb(var(--color-primary) / 0.4) 46%,
              transparent 72%
            );
          "
        />
      </button>
    </div>

    <!-- Manual input (visible only when custom card is selected) -->
    <div v-show="isCustom" class="flex items-center gap-1.5">
      <Input
        type="number"
        min="1"
        step="10"
        :class="[INSPECTOR_INPUT_CLASS, 'h-9 flex-1']"
        :model-value="interval?.toString() ?? ''"
        placeholder="90"
        @input="onCustomInput"
      />
      <span class="text-2xs text-muted-foreground font-mono">ms</span>
    </div>
  </div>
</template>
