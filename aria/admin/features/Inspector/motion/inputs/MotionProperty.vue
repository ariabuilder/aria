<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Switch } from "@/components/ui/switch";
import { usePropertySave } from "../../../Core";
import { useInspectorPanelControls } from "../../composables/useInspectorPanelControls";
import BaseProperty from "../../inputs/BaseProperty.vue";
import { type MotionSectionId } from "../constants/sections";
import { useMotionEditor } from "../composables/useMotionEditor";
import { useMotionCapabilities } from "../composables/useMotionCapabilities";
import { useMotionPreview } from "../composables/useMotionPreview";
import { useMotionParallaxEditor } from "../composables/useMotionParallaxEditor";
import { useMotionLabels } from "../composables/useMotionLabels";
import { useStudioI18n } from "@/i18n";
import { useInjectedStageIframeRef } from "../../../Core";
import MotionPresetSection from "../components/MotionPresetSection.vue";
import MotionEffectsSection from "../components/MotionEffectsSection.vue";
import MotionTriggerSection from "../components/MotionTriggerSection.vue";
import MotionTimingSection from "../components/MotionTimingSection.vue";
import MotionTextSection from "../components/MotionTextSection.vue";
import MotionHoverSection from "../components/MotionHoverSection.vue";
import MotionLoopSection from "../components/MotionLoopSection.vue";
import MotionStaggerSection from "../components/MotionStaggerSection.vue";
import MotionParallaxSection from "../components/MotionParallaxSection.vue";
import type {
  MotionDelayId,
  MotionDistanceId,
  MotionEasingId,
  MotionHoverId,
  MotionLoopId,
  MotionPresetId,
  MotionSpeedId,
  MotionTriggerId,
} from "../../../../../lib/motion/schemas/tokens.schema";

interface Props {
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
  focusNonce?: number;
}

const props = defineProps<Props>();
const { t } = useStudioI18n();
const { label: motionLabel } = useMotionLabels();

const motionRootEl = ref<HTMLElement | null>(null);

const propertySave = usePropertySave();
const { selectedNode, selectedNodeId, isLoading } = propertySave;
const stageIframeRef = useInjectedStageIframeRef();
const { refreshMotionPreview } = useMotionPreview(stageIframeRef);

const {
  draft,
  enabled,
  saveMotion,
  applyMotionPreset,
  patchDraft: patchMotionDraft,
  toggleEffect,
} = useMotionEditor(props.currentItemType, props.currentItemSlug);
const {
  draft: parallaxDraft,
  saveParallax,
  applyParallaxPreset,
} = useMotionParallaxEditor(
  props.currentItemType,
  props.currentItemSlug,
  draft,
);
const { supportsMotion, visibleSections } = useMotionCapabilities(
  selectedNode,
  enabled,
);

function hasSaveContext(): boolean {
  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

const { isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading,
});

const openSectionId = ref<MotionSectionId | null>("presets");

const configSections = computed(() =>
  visibleSections.value.filter((s) => s !== "enable" && s !== "parallax"),
);

function getDefaultConfigSectionId(
  sections: MotionSectionId[],
): MotionSectionId | null {
  if (sections.includes("presets")) {
    return "presets";
  }

  return sections[0] ?? null;
}

function isSectionOpen(sectionId: MotionSectionId): boolean {
  return openSectionId.value === sectionId;
}

function setSectionOpen(sectionId: MotionSectionId, isOpen: boolean): void {
  if (isOpen) {
    openSectionId.value = sectionId;
    return;
  }

  if (openSectionId.value === sectionId) {
    openSectionId.value = null;
  }
}

watch(
  () => props.focusNonce,
  (nonce) => {
    if (!nonce) {
      return;
    }

    nextTick(() => {
      motionRootEl.value?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      if (enabled.value) {
        openSectionId.value = getDefaultConfigSectionId(configSections.value);
      }
    });
  },
);

watch(
  configSections,
  (sections) => {
    if (sections.length === 0) {
      openSectionId.value = null;
      return;
    }

    if (
      openSectionId.value !== null &&
      sections.includes(openSectionId.value)
    ) {
      return;
    }

    openSectionId.value = getDefaultConfigSectionId(sections);
  },
  { immediate: true },
);

watch(
  () => selectedNodeId.value,
  (nextId, previousId) => {
    if (!nextId || !enabled.value) {
      return;
    }

    if (nextId === previousId) {
      return;
    }

    openSectionId.value = getDefaultConfigSectionId(configSections.value);
  },
);

async function persistDraft(): Promise<void> {
  if (isPanelDisabled.value) {
    return;
  }

  const saved = await saveMotion();
  if (saved) {
    await nextTick();
    refreshMotionPreview();
  }
}

async function persistParallax(
  parallax: Parameters<typeof saveParallax>[0],
): Promise<void> {
  if (isPanelDisabled.value) {
    return;
  }

  parallaxDraft.value = parallax;
  await saveParallax(parallax);
  await nextTick();
  refreshMotionPreview();
}

function toggleHover(id: MotionHoverId) {
  const current = new Set(draft.value.hover ?? []);
  if (current.has(id)) {
    current.delete(id);
  } else {
    current.add(id);
  }
  patchMotionDraft({
    hover: current.size > 0 ? Array.from(current) : undefined,
  });
}

async function applyPreset(presetId: MotionPresetId) {
  applyMotionPreset(presetId);
  await persistDraft();
}

async function patchDraft(
  patch: Parameters<typeof patchMotionDraft>[0],
): Promise<void> {
  patchMotionDraft(patch);
  await persistDraft();
}
</script>

<template>
  <div ref="motionRootEl">
  <div v-if="!selectedNode" class="p-4 text-sm text-muted-foreground">
    {{ t("inspector.motion.empty") }}
  </div>

  <div v-else-if="!supportsMotion" class="p-4 text-sm text-muted-foreground">
    {{ t("inspector.motion.unsupported") }}
  </div>

  <div v-else class="space-y-0">
    <div>
      <BaseProperty
        title="Aria Motion"
        :collapsible="false"
        :disabled="isPanelDisabled"
      >
        <template #header-actions>
          <Switch
            :model-value="enabled"
            :disabled="isPanelDisabled"
            @click.stop
            @update:model-value="
              async (value) => {
                enabled = Boolean(value);
                await persistDraft();
              }
            "
          />
        </template>
      </BaseProperty>
    </div>

    <div v-if="configSections.length > 0">
      <div v-for="section in configSections" :key="section" class="">
        <BaseProperty
          :title="motionLabel('section', section)"
          :open="isSectionOpen(section)"
          :disabled="isPanelDisabled"
          @update:open="setSectionOpen(section, $event)"
          >
          <template #header-actions>
            <Switch
              v-if="section === 'stagger'"
              :model-value="draft.stagger?.interval !== undefined"
              @click.stop
              @update:model-value="
                async (value) => {
                  patchMotionDraft({
                    stagger: value ? { interval: draft.stagger?.interval ?? 90 } : undefined,
                  });
                  await persistDraft();
                }
              "
            />
          </template>
          <MotionPresetSection
            v-if="section === 'presets'"
            :preset="draft.preset"
            @select="applyPreset"
          />

          <MotionEffectsSection
            v-else-if="section === 'effects'"
            :effects="draft.effects"
            @toggle="
              async (effectId) => {
                toggleEffect(effectId);
                await persistDraft();
              }
            "
          />

          <MotionTriggerSection
            v-else-if="section === 'trigger'"
            :trigger="draft.trigger"
            @update:trigger="
              (value: MotionTriggerId) => patchDraft({ trigger: value })
            "
          />

          <MotionTimingSection
            v-else-if="section === 'timing'"
            :speed="draft.speed as MotionSpeedId | undefined"
            :easing="draft.easing"
            :distance="draft.distance"
            :delay="draft.delay as MotionDelayId | undefined"
            @update:speed="(value) => patchDraft({ speed: value })"
            @update:easing="
              (value: MotionEasingId) => patchDraft({ easing: value })
            "
            @update:distance="
              (value: MotionDistanceId) => patchDraft({ distance: value })
            "
            @update:delay="
              (value: MotionDelayId) => patchDraft({ delay: value })
            "
          />

          <MotionTextSection
            v-else-if="section === 'text'"
            :mode="draft.text?.mode ?? 'words'"
            @update:mode="
              (mode) =>
                patchDraft({
                  text: {
                    ...(draft.text ?? {}),
                    mode,
                  },
                })
            "
          />

          <MotionHoverSection
            v-else-if="section === 'hover'"
            :hover="draft.hover"
            @toggle="
              async (hoverId) => {
                toggleHover(hoverId);
                await persistDraft();
              }
            "
          />

          <MotionLoopSection
            v-else-if="section === 'loop'"
            :loop="draft.loop"
            @update:loop="
              (value: MotionLoopId | undefined) => patchDraft({ loop: value })
            "
          />

          <MotionStaggerSection
            v-else-if="section === 'stagger'"
            :interval="draft.stagger?.interval"
            @update:interval="
              async (interval) => {
                patchMotionDraft({
                  stagger: interval ? { interval } : undefined,
                });
                await persistDraft();
              }
            "
          />

        </BaseProperty>
      </div>
    </div>

    <MotionParallaxSection
      v-if="visibleSections.includes('parallax')"
      :parallax="parallaxDraft"
      :disabled="isPanelDisabled"
      @update:parallax="
        async (parallax) => {
          await persistParallax(parallax);
        }
      "
      @apply-preset="
        async (presetId) => {
          const updated = applyParallaxPreset(presetId);
          await persistParallax(updated);
        }
      "
    />
  </div>
  </div>
</template>
