/**
 * Shared composable for raw CSS editing of semantic class variants.
 */

import { ref } from "vue";

import { useStudioI18n } from "@/i18n";
import type { InspectorPseudoState } from "../../../../lib/styles/pseudoSelectors";
import { useClassEditor } from "../../Inspector/composables/useClassEditor";
import { parseClassManagerCssText } from "../lib/classManagerCss";

interface SaveClassVariantCssOptions {
  className: string;
  cssText: string;
  breakpoint: string;
  pseudoState: InspectorPseudoState;
  preserveActiveClass?: boolean;
}

export function useClassCssEditor() {
  const { t } = useStudioI18n();
  const classEditor = useClassEditor();
  const isSaving = ref(false);
  const error = ref<string | null>(null);

  async function saveClassVariantCss(
    options: SaveClassVariantCssOptions,
  ): Promise<boolean> {
    const {
      className,
      cssText,
      breakpoint,
      pseudoState,
      preserveActiveClass = false,
    } = options;

    error.value = null;
    isSaving.value = true;

    try {
      const rules = parseClassManagerCssText(cssText);

      return await classEditor.replaceClassVariantRules(
        className,
        breakpoint,
        pseudoState,
        rules,
        { preserveActiveClass },
      );
    } catch (saveError) {
      error.value =
        saveError instanceof Error
          ? saveError.message
          : t("design.classes.cssDialog.saveFailed");
      return false;
    } finally {
      isSaving.value = false;
    }
  }

  return {
    isSaving,
    error,
    saveClassVariantCss,
  };
}
