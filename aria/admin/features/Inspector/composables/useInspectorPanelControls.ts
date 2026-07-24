import { computed, type ComputedRef } from "vue";

export interface UseInspectorPanelControlsOptions {
  hasSaveContext: () => boolean;
  isLoading: ComputedRef<boolean>;
  extraDisabled?: () => boolean;
}

/**
 * Inspector panels stay interactive during background persists.
 * Use isPanelDisabled for :disabled — not isLoading / isPersisting.
 */
export function useInspectorPanelControls(
  options: UseInspectorPanelControlsOptions,
) {
  const isPersisting = computed(() => options.isLoading.value);

  const isPanelDisabled = computed(
    () =>
      !options.hasSaveContext() || (options.extraDisabled?.() ?? false),
  );

  return {
    isPersisting,
    isPanelDisabled,
  };
}
