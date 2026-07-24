import { computed, onMounted } from "vue";

import { useGlobalStyles } from "../features/Design/composables/useGlobalStyles";
import { buildVariableReferenceOptions } from "../lib/variableReferences";

interface UseVariableReferenceOptionsOptions {
  autoLoad?: boolean;
}

export function useVariableReferenceOptions(
  options: UseVariableReferenceOptionsOptions = {},
) {
  const { autoLoad = true } = options;
  const { globalStyles, isLoading, loadGlobalStyles } = useGlobalStyles();

  onMounted(() => {
    if (!autoLoad) {
      return;
    }

    void loadGlobalStyles();
  });

  const variableReferenceOptions = computed(() =>
    buildVariableReferenceOptions(globalStyles.value.variables),
  );

  return {
    variableReferenceOptions,
    isLoadingVariableReferences: isLoading,
    loadVariableReferences: loadGlobalStyles,
  };
}
