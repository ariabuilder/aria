import { ref, type Ref } from "vue";

export interface UseEntryEditorDrawerReturn {
  isOpen: Ref<boolean>;
  collectionId: Ref<string | null>;
  entryId: Ref<string | null>;
  open: (collectionId: string, entryId: string) => void;
  close: () => void;
}

const isOpen = ref(false);
const collectionId = ref<string | null>(null);
const entryId = ref<string | null>(null);

export function useEntryEditorDrawer(): UseEntryEditorDrawerReturn {
  function open(nextCollectionId: string, nextEntryId: string): void {
    collectionId.value = nextCollectionId;
    entryId.value = nextEntryId;
    isOpen.value = true;
  }

  function close(): void {
    isOpen.value = false;
    collectionId.value = null;
    entryId.value = null;
  }

  return {
    isOpen,
    collectionId,
    entryId,
    open,
    close,
  };
}
