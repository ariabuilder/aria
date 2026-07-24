import { computed, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from "vue";

import {
  evaluateContrastPair,
  type ContrastEvaluation,
} from "../../../../lib/design/colorContrast";
import {
  resolveColorPickerPreviewValue,
  type ColorPickerPreviewContext,
} from "@/features/Design/lib/colorPickerValue";
import type { GlobalStyleVariables } from "../../../../lib/styles/universalDesignSystem";

export interface UseColorPickerContrastOptions {
  previewColor: Ref<string>;
  contrastAgainst: Ref<string | null | undefined>;
  resolvedContrastAgainst: Ref<string | null | undefined>;
  variables: MaybeRefOrGetter<GlobalStyleVariables>;
  tokenOptions: ComputedRef<readonly { value: string; preview: string }[]>;
  previewContext: ComputedRef<ColorPickerPreviewContext>;
}

export function useColorPickerContrast(
  options: UseColorPickerContrastOptions,
): { contrastEvaluation: ComputedRef<ContrastEvaluation | null> } {
  const contrastEvaluation = computed((): ContrastEvaluation | null => {
    const foreground = options.previewColor.value.trim();
    if (!foreground) {
      return null;
    }

    const rawBackground =
      options.resolvedContrastAgainst.value?.trim() ||
      options.contrastAgainst.value?.trim() ||
      "";
    if (!rawBackground) {
      return null;
    }

    const variables = toValue(options.variables);
    const tokenOptions = options.tokenOptions.value;
    const context = options.previewContext.value;

    const resolvedForeground =
      resolveColorPickerPreviewValue(
        foreground,
        variables,
        tokenOptions,
        context,
      ) ?? foreground;

    const resolvedBackground =
      resolveColorPickerPreviewValue(
        rawBackground,
        variables,
        tokenOptions,
        context,
      ) ?? rawBackground;

    return evaluateContrastPair({
      foreground: resolvedForeground,
      background: resolvedBackground,
    });
  });

  return { contrastEvaluation };
}
