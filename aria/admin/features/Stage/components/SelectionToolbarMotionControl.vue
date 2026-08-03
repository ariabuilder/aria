<script setup lang="ts">
import { TOOLBAR_ICONS } from "../../../composables/useCanvasOverlays";
import { useSelectionToolbarMotion } from "../composables/useSelectionToolbarMotion";
import MotionQuickPicker from "./MotionQuickPicker.vue";
import type { MotionPresetId } from "../../../../lib/motion/schemas/tokens.schema";

const {
  pendingError,
  showMotionButton,
  isMotionActive,
  selectedPresetId,
  selectMotionPreset,
} = useSelectionToolbarMotion();

async function onSelect(presetId: MotionPresetId): Promise<void> {
  await selectMotionPreset(presetId);
}
</script>

<template>
  <template v-if="showMotionButton">
    <div class="flex items-center gap-0" @click.stop>
      <MotionQuickPicker
        :icon="TOOLBAR_ICONS.motion"
        :active="isMotionActive"
        :selected-preset-id="selectedPresetId"
        :error="pendingError"
        @select="(presetId) => void onSelect(presetId)"
      />
    </div>
  </template>
</template>
