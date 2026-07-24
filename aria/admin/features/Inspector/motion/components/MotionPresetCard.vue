<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import type { MotionPresetDefinition } from "../../../../../lib/motion/schemas/preset.schema";
import type { MotionSpeedId } from "../../../../../lib/motion/schemas/tokens.schema";
import {
  compilePresetPreviewClasses,
  getPresetPreviewVisual,
} from "../presets/preview";
import { useMotionLabels } from "../composables/useMotionLabels";

interface Props {
  preset: MotionPresetDefinition;
  active?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  active: false,
});
const { label: motionLabel } = useMotionLabels();

const emit = defineEmits<{
  select: [];
}>();

const PREVIEW_REPLAY_DELAY_MS = 1500;

const PRESET_DURATION_MS: Record<MotionSpeedId, number> = {
  instant: 150,
  fast: 300,
  normal: 600,
  slow: 1000,
  slower: 1600,
};

const isHovered = ref(false);
const motionIn = ref(false);
const playCycle = ref(0);

let loopGeneration = 0;
let pendingDelayId: ReturnType<typeof setTimeout> | null = null;

const motionClasses = computed(() => compilePresetPreviewClasses(props.preset));
const previewVisual = computed(() => getPresetPreviewVisual(props.preset));

const showAnimatedLayer = computed(() => props.active || isHovered.value);

const ghostClass = computed(() =>
  previewVisual.value.shape === "icon"
    ? [previewVisual.value.icon, "size-7 shrink-0 text-muted-foreground"]
    : ["size-6 shrink-0 rounded-sm bg-muted-foreground"],
);

const animatedShapeClass = computed(() =>
  previewVisual.value.shape === "icon"
    ? [previewVisual.value.icon, "size-7 shrink-0 text-primary"]
    : ["size-6 shrink-0 rounded-sm bg-primary"],
);

watch(
  () => props.active,
  (active) => {
    if (!isHovered.value) {
      motionIn.value = active;
    }
  },
  { immediate: true },
);

function clearPendingDelay(): void {
  if (pendingDelayId !== null) {
    clearTimeout(pendingDelayId);
    pendingDelayId = null;
  }
}

function abortPreviewLoop(): void {
  loopGeneration += 1;
  clearPendingDelay();
}

function sleep(ms: number, generation: number): Promise<boolean> {
  return new Promise((resolve) => {
    clearPendingDelay();
    pendingDelayId = setTimeout(() => {
      pendingDelayId = null;
      resolve(generation === loopGeneration);
    }, ms);
  });
}

function getPresetDurationMs(): number {
  const speed = props.preset.speed ?? "normal";
  return PRESET_DURATION_MS[speed];
}

async function waitForNextFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

async function playPreviewAnimation(generation: number): Promise<boolean> {
  motionIn.value = false;
  playCycle.value += 1;

  await nextTick();

  if (generation !== loopGeneration || !isHovered.value) {
    return false;
  }

  await waitForNextFrame();

  if (generation !== loopGeneration || !isHovered.value) {
    return false;
  }

  motionIn.value = true;
  return true;
}

async function runPreviewLoop(): Promise<void> {
  const generation = loopGeneration;

  while (generation === loopGeneration && isHovered.value) {
    const played = await playPreviewAnimation(generation);
    if (!played || generation !== loopGeneration || !isHovered.value) {
      break;
    }

    const stillRunning = await sleep(getPresetDurationMs() + 80, generation);
    if (!stillRunning || !isHovered.value) {
      break;
    }

    const replayReady = await sleep(PREVIEW_REPLAY_DELAY_MS, generation);
    if (!replayReady || !isHovered.value) {
      break;
    }
  }
}

function beginPreview(): void {
  if (isHovered.value) {
    return;
  }

  isHovered.value = true;
  void runPreviewLoop();
}

function endPreview(): void {
  if (!isHovered.value) {
    return;
  }

  isHovered.value = false;
  abortPreviewLoop();
  motionIn.value = props.active;
}

onUnmounted(() => {
  abortPreviewLoop();
});
</script>

<template>
  <button
    type="button"
    class="motion-preset-card group/card relative flex w-full flex-col gap-2 overflow-hidden rounded-md bg-background p-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-border/50 border-solid"
    :class="active ? 'border-primary/80 is-active' : 'border-transparent'"
    @click="emit('select')"
    @pointerenter="beginPreview"
    @pointerleave="endPreview"
    @focusin="beginPreview"
    @focusout="endPreview"
  >
    <div
      class="motion-preset-preview relative z-[1] grid aspect-4/3 place-items-center overflow-hidden"
      aria-hidden="true"
    >
      <span
        class="col-start-1 row-start-1 transition-opacity duration-150"
        :class="[ghostClass, showAnimatedLayer && motionIn ? 'opacity-0' : '']"
      />

      <span
        v-show="showAnimatedLayer"
        class="col-start-1 row-start-1 grid place-items-center"
      >
        <span
          :key="playCycle"
          :class="[
            motionClasses,
            animatedShapeClass,
            { 'aria-motion-in': motionIn },
          ]"
        />
      </span>
    </div>

    <span
      class="relative z-[1] text-center text-2xs font-medium leading-tight transition-colors"
      :class="
        active
          ? 'text-foreground'
          : 'text-muted-foreground/80 group-hover/card:text-foreground'
      "
    >
      {{ motionLabel("preset", preset.id, preset.label) }}
    </span>
  </button>
</template>

<style scoped>
.motion-preset-preview {
  --aria-motion-distance: var(--aria-motion-dist-sm);
}

.motion-preset-card::before {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -42%;
  z-index: 0;
  width: 140%;
  height: 90%;
  transform: translateX(-50%);
  pointer-events: none;
  background: radial-gradient(
    ellipse 72% 68% at 50% 100%,
    color-mix(in oklch, var(--primary) 24%, transparent) 0%,
    color-mix(in oklch, var(--primary) 10%, transparent) 46%,
    transparent 72%
  );
  opacity: 0.35;
  transition: opacity 200ms ease;
}

.motion-preset-card:hover::before,
.motion-preset-card:focus-visible::before,
.motion-preset-card.is-active::before {
  opacity: 0.72;
}
</style>
