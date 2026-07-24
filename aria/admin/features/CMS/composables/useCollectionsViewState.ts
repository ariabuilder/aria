import { onActivated, onMounted } from "vue";
import { useCollectionIcons } from "./useCollectionIcons";
import { useCollectionsList } from "./useCollectionsList";
import { useCreateCollectionDialog } from "./useCreateCollectionDialog";

export type { CollectionSummary } from "./useCollectionsList";

/**
 * View-level composition of shared CMS collection composables.
 */
export function useCollectionsViewState() {
  const list = useCollectionsList();
  const icons = useCollectionIcons();
  const createCollectionDialog = useCreateCollectionDialog();

  onMounted(() => {
    void list.loadCollections();
  });

  onActivated(() => {
    void list.loadCollections({ force: true, silent: true });
  });

  return {
    ...list,
    ...icons,
    createCollectionDialog,
  };
}
