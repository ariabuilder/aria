import { computed, type Ref } from "vue";

import { resolveColorPickerPreviewValue } from "@/features/Design/lib/colorPickerValue";
import { useDesignSystem } from "@/features/Design/composables/useDesignSystem";
import { useGlobalStyles } from "@/features/Design/composables/useGlobalStyles";
import { buildVariableManagerTokenOptions } from "@/features/Design/lib/variableManagerTokens";
import type { BuilderNode } from "../../../../lib/types/nodes";

export function useToolbarTextColorContext(options: {
  selectedNode: Ref<BuilderNode | null | undefined>;
  iframeElement: Ref<HTMLElement | null | undefined>;
}) {
  const { palettes, semanticColors } = useDesignSystem();
  const { globalStyles } = useGlobalStyles();

  const tokenOptions = computed(() =>
    buildVariableManagerTokenOptions(palettes.value, semanticColors.value).map(
      (option) => ({
        ...option,
        value: option.value,
        preview: option.preview,
      }),
    ),
  );

  const toolbarContrastBackground = computed(() => {
    const bgStyle = options.selectedNode.value?.styles?.backgroundColor;
    if (bgStyle) {
      const explicit =
        (bgStyle as Record<string, string>).base ??
        Object.values(bgStyle as Record<string, string>)[0] ??
        "";
      if (explicit.trim()) {
        return explicit;
      }
    }

    const el = options.iframeElement.value;
    if (el) {
      const view = (el.ownerDocument as Document).defaultView;
      if (view) {
        const computedBg = view.getComputedStyle(el).backgroundColor;
        if (computedBg && computedBg !== "rgba(0, 0, 0, 0)") {
          return computedBg;
        }
        const parent = el.parentElement;
        if (parent) {
          const parentBg = view.getComputedStyle(parent).backgroundColor;
          if (parentBg) {
            return parentBg;
          }
        }
      }
    }

    return "#ffffff";
  });

  const resolvedToolbarContrastBackground = computed(() => {
    const raw = toolbarContrastBackground.value.trim();
    if (!raw) {
      return null;
    }

    return (
      resolveColorPickerPreviewValue(
        raw,
        globalStyles.value.variables,
        tokenOptions.value,
        {
          palettes: palettes.value,
          semanticColors: semanticColors.value,
        },
      ) ?? raw
    );
  });

  return {
    toolbarContrastBackground,
    resolvedToolbarContrastBackground,
  };
}
