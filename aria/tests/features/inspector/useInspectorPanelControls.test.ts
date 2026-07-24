import { describe, expect, it } from "vitest";
import { computed, ref } from "vue";

import { useInspectorPanelControls } from "../../../admin/features/Inspector/composables/useInspectorPanelControls";

describe("useInspectorPanelControls", () => {
  it("keeps panel enabled while isLoading is true", () => {
    const isLoading = ref(true);
    const { isPanelDisabled, isPersisting } = useInspectorPanelControls({
      hasSaveContext: () => true,
      isLoading: computed(() => isLoading.value),
    });

    expect(isPersisting.value).toBe(true);
    expect(isPanelDisabled.value).toBe(false);
  });

  it("disables panel when there is no save context", () => {
    const { isPanelDisabled } = useInspectorPanelControls({
      hasSaveContext: () => false,
      isLoading: computed(() => false),
    });

    expect(isPanelDisabled.value).toBe(true);
  });

  it("honors extraDisabled", () => {
    const { isPanelDisabled } = useInspectorPanelControls({
      hasSaveContext: () => true,
      isLoading: computed(() => false),
      extraDisabled: () => true,
    });

    expect(isPanelDisabled.value).toBe(true);
  });
});
