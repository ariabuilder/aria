import { ref, type Ref } from "vue";

export interface UseCreateCollectionDialogReturn {
  isOpen: Ref<boolean>;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const isOpen = ref(false);

/**
 * Shared create-collection dialog state.
 * Used by CollectionsView, StudioApp shell, and future sidebar actions.
 */
export function useCreateCollectionDialog(): UseCreateCollectionDialogReturn {
  function open(): void {
    isOpen.value = true;
  }

  function close(): void {
    isOpen.value = false;
  }

  function toggle(): void {
    isOpen.value = !isOpen.value;
  }

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}
