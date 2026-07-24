import { computed } from "vue";

import { useCanonicalBreakpoints } from "@/composables/useCanonicalBreakpoints";
import {
  buildPreviewViewportPresetOptions,
  resolvePreviewPresetCanvasWidth,
  type PreviewViewportPreset,
  type PreviewViewportPresetOption,
} from "./previewViewportPresets";

interface UsePreviewViewportPresetsOptions {
  autoLoad?: boolean;
}

export function usePreviewViewportPresets(
  options: UsePreviewViewportPresetsOptions = {},
) {
  const { breakpoints, enabledBreakpoints, loadBreakpoints, isLoading, error } =
    useCanonicalBreakpoints(options);

  const presetOptions = computed<PreviewViewportPresetOption[]>(() =>
    buildPreviewViewportPresetOptions(breakpoints.value),
  );

  const presetOptionsByKey = computed(() => {
    const byKey = {} as Record<
      PreviewViewportPreset,
      PreviewViewportPresetOption
    >;

    for (const option of presetOptions.value) {
      byKey[option.preset] = option;
    }

    return byKey;
  });

  function getPresetFrameWidth(preset: PreviewViewportPreset): number {
    return resolvePreviewPresetCanvasWidth(preset, breakpoints.value);
  }

  return {
    breakpoints,
    enabledBreakpoints,
    presetOptions,
    presetOptionsByKey,
    getPresetFrameWidth,
    loadBreakpoints,
    isLoading,
    error,
  };
}

export type {
  PreviewViewportPreset,
  PreviewViewportPresetOption,
} from "./previewViewportPresets";
