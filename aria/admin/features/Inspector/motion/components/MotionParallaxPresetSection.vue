<script setup lang="ts">
/**
 * MotionParallaxPresetSection — Parallax preset card grid. Matches MotionPresetCard
 * design: bg-background, bordered cards with gradient hover.
 */
import { PARALLAX_PRESETS } from "../../../../../lib/motion/parallaxPresets";
import type { ParallaxPresetDefinition } from "../../../../../lib/motion/parallaxPresets";
import { useMotionLabels } from "../composables/useMotionLabels";

const emit = defineEmits<{
  "apply-preset": [presetId: string];
}>();

const presets = PARALLAX_PRESETS;
const { label: motionLabel } = useMotionLabels();
</script>

<template>
  <div class="grid grid-cols-3 gap-2">
    <button
      v-for="preset in presets"
      :key="preset.id"
      type="button"
      class="parallax-preset-card group/card relative flex w-full flex-col gap-2 overflow-hidden rounded-md bg-background p-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-border/50 border-solid hover:border-primary/60 transition-colors"
      @click="emit('apply-preset', preset.id)"
    >
      <!-- Mini preview area -->
      <div
        class="relative z-[1] grid aspect-4/3 place-items-center overflow-hidden rounded-sm bg-sidebar/50"
        aria-hidden="true"
      >
        <span
          class="text-[10px] font-semibold text-muted-foreground/70 group-hover/card:text-muted-foreground transition-colors"
        >
          {{ preset.speed }}x
        </span>
      </div>

      <!-- Label -->
      <span
        class="relative z-[1] text-center text-2xs font-medium leading-tight transition-colors text-muted-foreground/80 group-hover/card:text-foreground"
      >
        {{ motionLabel("parallaxPreset", preset.id, preset.label) }}
      </span>
    </button>
  </div>
</template>

<style scoped>
.parallax-preset-card::before {
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

.parallax-preset-card:hover::before,
.parallax-preset-card:focus-visible::before {
  opacity: 0.72;
}
</style>
