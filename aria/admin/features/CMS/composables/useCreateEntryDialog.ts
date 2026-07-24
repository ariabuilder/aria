import { ref, type Ref } from "vue";

export interface UseCreateEntryDialogReturn {
  isOpen: Ref<boolean>;
  targetCollectionId: Ref<string | null>;
  open: (collectionId: string) => void;
  close: () => void;
}

const isOpen = ref(false);
const targetCollectionId = ref<string | null>(null);

export function useCreateEntryDialog(): UseCreateEntryDialogReturn {
  function open(collectionId: string): void {
    targetCollectionId.value = collectionId;
    isOpen.value = true;
  }

  function close(): void {
    isOpen.value = false;
    targetCollectionId.value = null;
  }

  return {
    isOpen,
    targetCollectionId,
    open,
    close,
  };
}
