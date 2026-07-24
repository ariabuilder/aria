<script setup lang="ts">
/**
 * MotionParallaxSection — Parallax Scroll configuration panel.
 *
 * @component
 */
import { computed, ref } from "vue";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import BaseProperty from "../../inputs/BaseProperty.vue";
import MotionPropertyRow from "./shared/MotionPropertyRow.vue";
import MotionSelectField from "./shared/MotionSelectField.vue";
import MotionParallaxPresetSection from "./MotionParallaxPresetSection.vue";
import {
  INSPECTOR_CHIP_TOGGLE_CLASS,
  INSPECTOR_CHIP_TOGGLE_ACTIVE_CLASS,
} from "../../constants/panelTokens";
import type {
  MotionParallaxSpeedId,
  MotionParallaxDirectionId,
  MotionParallaxEasingId,
  MotionParallaxAnchorId,
  MotionParallaxEffectId,
} from "../../../../../lib/motion/schemas/parallaxTokens.schema";
import type { NodeParallax } from "../../../../../lib/motion/schemas/nodeParallax.schema";
import { DEFAULT_NODE_PARALLAX } from "../../../../../lib/motion/schemas/nodeParallax.schema";
import { useStudioI18n } from "@/i18n";

const SPEED_OPTIONS: Array<{ id: MotionParallaxSpeedId; label: string }> = [
  { id: "0", label: "0x (Pin)" },
  { id: "0.25", label: "0.25x" },
  { id: "0.5", label: "0.5x" },
  { id: "0.75", label: "0.75x" },
  { id: "1", label: "1x" },
  { id: "1.25", label: "1.25x" },
  { id: "1.5", label: "1.5x" },
  { id: "2", label: "2x" },
];

const DIRECTION_OPTIONS: Array<{
  id: MotionParallaxDirectionId;
  label: string;
}> = [
  { id: "up", label: "↑" },
  { id: "down", label: "↓" },
  { id: "left", label: "←" },
  { id: "right", label: "→" },
];

const EASING_OPTIONS: Array<{
  id: MotionParallaxEasingId;
  label: string;
}> = [
  { id: "linear", label: "Linear" },
  { id: "ease-in", label: "Ease In" },
  { id: "ease-out", label: "Ease Out" },
  { id: "ease-in-out", label: "Ease In-Out" },
  { id: "spring", label: "Spring" },
];

const ANCHOR_OPTIONS: Array<{
  id: MotionParallaxAnchorId;
  label: string;
}> = [
  { id: "top", label: "Top" },
  { id: "center", label: "Center" },
  { id: "bottom", label: "Bottom" },
];

const EFFECT_OPTIONS: Array<{
  id: MotionParallaxEffectId;
  label: string;
}> = [
  { id: "translate", label: "Move" },
  { id: "opacity", label: "Fade" },
  { id: "blur", label: "Blur" },
  { id: "scale", label: "Scale" },
  { id: "rotate", label: "Rotate" },
];

interface Props {
  parallax?: NodeParallax | null;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  parallax: null,
  disabled: false,
});
const { t } = useStudioI18n();

const emit = defineEmits<{
  "update:parallax": [value: NodeParallax];
  "apply-preset": [presetId: string];
}>();

const presetsOpen = ref(false);
const configOpen = ref(true);
const effectsOpen = ref(false);
const advancedOpen = ref(false);

const current = computed<NodeParallax>(
  () => props.parallax ?? DEFAULT_NODE_PARALLAX,
);

const headerClass = computed(() => [
  "h-10 px-2 py-2 flex w-full items-center justify-between text-xs font-medium duration-150 transition-colors group border-t border-b -m-px border-dashed border-border",
  current.enabled
    ? "bg-card/50 text-foreground"
    : "text-muted-foreground hover:text-foreground hover:bg-card/60",
]);

const parallaxSpeedOptions = computed(() =>
  SPEED_OPTIONS.map((option) =>
    option.id === "0"
      ? { ...option, label: t("inspector.motion.parallax.pin") }
      : option,
  ),
);
const parallaxEasingOptions = computed(() =>
  EASING_OPTIONS.map((option) => ({
    ...option,
    label: t(
      {
        linear: "inspector.motion.easing.linear",
        "ease-in": "inspector.motion.easing.in",
        "ease-out": "inspector.motion.easing.out",
        "ease-in-out": "inspector.motion.easing.inOut",
        spring: "inspector.motion.easing.spring",
      }[option.id],
    ),
  })),
);
const parallaxAnchorOptions = computed(() =>
  ANCHOR_OPTIONS.map((option) => ({
    ...option,
    label: t(
      {
        top: "inspector.motion.parallax.top",
        center: "inspector.motion.parallax.center",
        bottom: "inspector.motion.parallax.bottom",
      }[option.id],
    ),
  })),
);
function parallaxEffectLabel(id: MotionParallaxEffectId): string {
  return t(
    {
      translate: "inspector.motion.parallax.move",
      opacity: "inspector.motion.effect.fade",
      blur: "inspector.motion.effect.blur",
      scale: "inspector.motion.parallax.scale",
      rotate: "inspector.motion.hover.rotate",
    }[id],
  );
}

function hasEffect(effect: MotionParallaxEffectId): boolean {
  return current.value.effects.some((e) => e.effect === effect);
}

function toggleEffect(effect: MotionParallaxEffectId) {
  const existing = current.value.effects;
  if (hasEffect(effect)) {
    emit("update:parallax", {
      ...current.value,
      effects: existing.filter((e) => e.effect !== effect),
    });
  } else {
    emit("update:parallax", {
      ...current.value,
      effects: [...existing, { effect }],
    });
  }
}

function patch(partial: Partial<NodeParallax>) {
  emit("update:parallax", { ...current.value, ...partial });
}
</script>

<template>
  <Collapsible
    :open="current.enabled"
    @update:open="$event ? patch({ enabled: true }) : patch({ enabled: false })"
  >
    <CollapsibleTrigger :class="headerClass">
      <div class="flex items-center gap-2 font-serif">
        <span>{{ t("inspector.motion.parallax.title") }}</span>
      </div>
      <div class="flex items-center gap-1">
        <Switch
          :model-value="current.enabled"
          :disabled="disabled"
          @click.stop
          @update:model-value="patch({ enabled: Boolean($event) })"
        />
      </div>
    </CollapsibleTrigger>
    <CollapsibleContent class="property-content overflow-hidden bg-muted/50">
      <div class="space-y-0">
        <!-- Presets -->
        <BaseProperty
          :title="t('inspector.motion.section.presets')"
          :open="presetsOpen"
          :disabled="disabled"
          @update:open="presetsOpen = $event"
        >
          <MotionParallaxPresetSection
            @apply-preset="emit('apply-preset', $event)"
          />
        </BaseProperty>

        <!-- Configuration -->
        <BaseProperty
          :title="t('inspector.motion.parallax.configuration')"
          :open="configOpen"
          :disabled="disabled"
          @update:open="configOpen = $event"
        >
          <div class="space-y-3">
            <!-- Speed -->
            <MotionSelectField
              :label="t('inspector.motion.speed')"
              :model-value="current.speed"
              :options="parallaxSpeedOptions"
              @update:model-value="
                patch({ speed: $event as MotionParallaxSpeedId })
              "
            />

            <!-- Direction — icon toggle buttons -->
            <MotionPropertyRow :label="t('inspector.motion.parallax.direction')">
              <div class="grid grid-cols-4 gap-1">
                <button
                  v-for="opt in DIRECTION_OPTIONS"
                  :key="opt.id"
                  type="button"
                  :disabled="disabled"
                  :class="[
                    INSPECTOR_CHIP_TOGGLE_CLASS,
                    current.direction === opt.id
                      ? INSPECTOR_CHIP_TOGGLE_ACTIVE_CLASS
                      : '',
                  ]"
                  @click="patch({ direction: opt.id })"
                >
                  {{ opt.label }}
                </button>
              </div>
            </MotionPropertyRow>

            <!-- Travel Distance -->
            <MotionPropertyRow :label="t('inspector.motion.parallax.travel')">
              <input
                type="number"
                :value="current.travel"
                :disabled="disabled"
                min="0"
                step="10"
                class="h-9 w-full rounded-sm border border-dashed border-border-70 bg-sidebar px-2 text-xs focus-visible:ring-0"
                @input="
                  patch({
                    travel: Math.max(
                      0,
                      parseInt(($event.target as HTMLInputElement).value) || 0,
                    ),
                  })
                "
              />
            </MotionPropertyRow>

            <!-- Easing -->
            <MotionSelectField
              :label="t('inspector.motion.easing')"
              :model-value="current.easing ?? ''"
              :options="parallaxEasingOptions"
              @update:model-value="
                patch({
                  easing: ($event as MotionParallaxEasingId) || undefined,
                })
              "
            />

            <!-- Anchor -->
            <MotionSelectField
              :label="t('inspector.motion.parallax.anchor')"
              :model-value="current.anchor"
              :options="parallaxAnchorOptions"
              @update:model-value="
                patch({ anchor: $event as MotionParallaxAnchorId })
              "
            />
          </div>
        </BaseProperty>

        <!-- Effects -->
        <BaseProperty
          :title="t('inspector.motion.section.effects')"
          :open="effectsOpen"
          :disabled="disabled"
          @update:open="effectsOpen = $event"
        >
          <div class="grid grid-cols-2 gap-1.5">
            <button
              v-for="opt in EFFECT_OPTIONS"
              :key="opt.id"
              type="button"
              :disabled="disabled"
              :class="[
                INSPECTOR_CHIP_TOGGLE_CLASS,
                hasEffect(opt.id) ? INSPECTOR_CHIP_TOGGLE_ACTIVE_CLASS : '',
              ]"
              @click="toggleEffect(opt.id)"
            >
              {{ parallaxEffectLabel(opt.id) }}
            </button>
          </div>
        </BaseProperty>

        <!-- Advanced -->
        <BaseProperty
          :title="t('inspector.motion.parallax.advanced')"
          :open="advancedOpen"
          :disabled="disabled"
          @update:open="advancedOpen = $event"
        >
          <div class="space-y-3">
            <!-- Start Offset -->
            <MotionPropertyRow :label="t('inspector.motion.parallax.start')">
              <input
                type="text"
                :value="current.startOffset ?? ''"
                :disabled="disabled"
                placeholder='e.g. "top 80%"'
                class="h-9 w-full rounded-sm border border-dashed border-border-70 bg-sidebar px-2 text-xs focus-visible:ring-0"
                @input="
                  patch({
                    startOffset:
                      ($event.target as HTMLInputElement).value || undefined,
                  })
                "
              />
            </MotionPropertyRow>

            <!-- End Offset -->
            <MotionPropertyRow :label="t('inspector.motion.parallax.end')">
              <input
                type="text"
                :value="current.endOffset ?? ''"
                :disabled="disabled"
                placeholder='e.g. "bottom 20%"'
                class="h-9 w-full rounded-sm border border-dashed border-border-70 bg-sidebar px-2 text-xs focus-visible:ring-0"
                @input="
                  patch({
                    endOffset:
                      ($event.target as HTMLInputElement).value || undefined,
                  })
                "
              />
            </MotionPropertyRow>

            <!-- Layer Group -->
            <MotionPropertyRow :label="t('inspector.motion.parallax.layer')">
              <input
                type="text"
                :value="current.layerGroup ?? ''"
                :disabled="disabled"
                placeholder='e.g. "hero-bg"'
                class="h-9 w-full rounded-sm border border-dashed border-border-70 bg-sidebar px-2 text-xs focus-visible:ring-0"
                @input="
                  patch({
                    layerGroup:
                      ($event.target as HTMLInputElement).value || undefined,
                  })
                "
              />
            </MotionPropertyRow>

            <!-- Container Ref -->
            <MotionPropertyRow :label="t('inspector.motion.parallax.container')">
              <input
                type="text"
                :value="current.containerRef ?? ''"
                :disabled="disabled"
                :placeholder="t('inspector.motion.parallax.cssSelector')"
                class="h-9 w-full rounded-sm border border-dashed border-border-70 bg-sidebar px-2 text-xs focus-visible:ring-0"
                @input="
                  patch({
                    containerRef:
                      ($event.target as HTMLInputElement).value || undefined,
                  })
                "
              />
            </MotionPropertyRow>

            <!-- Velocity Mode -->
            <MotionPropertyRow :label="t('inspector.motion.parallax.velocity')">
              <Switch
                :model-value="current.velocity"
                :disabled="disabled"
                @update:model-value="patch({ velocity: Boolean($event) })"
              />
            </MotionPropertyRow>

            <!-- Disable on Mobile -->
            <MotionPropertyRow :label="t('inspector.motion.parallax.noMobile')">
              <Switch
                :model-value="current.disableOnMobile"
                :disabled="disabled"
                @update:model-value="
                  patch({ disableOnMobile: Boolean($event) })
                "
              />
            </MotionPropertyRow>
          </div>
        </BaseProperty>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
