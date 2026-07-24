/**
 * Password field visibility toggle.
 */

import { ref, computed, type Ref, type ComputedRef } from "vue";

export interface UsePasswordVisibilityReturn {
  isVisible: Ref<boolean>;
  inputType: ComputedRef<"password" | "text">;
  toggle: () => void;
  show: () => void;
  hide: () => void;
  iconClass: ComputedRef<string>;
}

/**
 * Composable for password visibility toggle
 */
export function usePasswordVisibility(): UsePasswordVisibilityReturn {
  const isVisible = ref(false);

  const inputType = computed<"password" | "text">(() =>
    isVisible.value ? "text" : "password",
  );

  const iconClass = computed(() =>
    isVisible.value ? "i-hugeicons:view-off" : "i-hugeicons:eye",
  );

  function toggle(): void {
    isVisible.value = !isVisible.value;
  }

  function show(): void {
    isVisible.value = true;
  }

  function hide(): void {
    isVisible.value = false;
  }

  return {
    isVisible,
    inputType,
    toggle,
    show,
    hide,
    iconClass,
  };
}
