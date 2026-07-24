import { computed, onActivated, ref, watch, type Ref } from "vue";
import type { SortingState } from "@tanstack/vue-table";
import { toast } from "vue-sonner";
import { useCollectionDetail } from "./useCollectionDetail";
import { useCmsEntriesList } from "./useCmsEntriesList";
import { useCmsEntryTable } from "./useCmsEntryTable";
import { useCmsEntryActions } from "./useCmsEntryActions";
import { useStudioRouter } from "@/features/Studio/core/composables";
import {
  clearRowSelection,
  useSelectedIds,
} from "@/features/Studio/core/composables/useTableSelection";
import {
  CreateEntryRequestSchema,
} from "../../../../lib/cms/schemas";
import { setCmsEntryNavigationPreview } from "../lib/cmsNavigationPreview";
import { createReadableDraftEntrySlug } from "../lib/draftEntrySlug";
import { collectionSupportsCover } from "../lib/collectionBodySupport";
import { useCmsEntryHistory } from "./useCmsEntryHistory";
import {
  invalidateCollectionsCache,
  invalidateEntryListCache,
} from "./useCmsDataCache";

export function useCollectionDetailState(collectionParam: Ref<string>) {
  const router = useStudioRouter();
  const detail = useCollectionDetail(collectionParam);
  const collectionId = computed(() => detail.collection.value?.id ?? "");
  const fields = computed(() => detail.collection.value?.schema.fields ?? []);
  const supportsCover = computed(() =>
    collectionSupportsCover(detail.collection.value),
  );
  const entries = useCmsEntriesList(collectionId);
  const { table, columnVisibility, sorting, rowSelection } = useCmsEntryTable({
    data: entries.rows,
    fields,
    supportsCover,
  });
  const selectedEntryIds = useSelectedIds(
    table,
    (row) => row.id,
    rowSelection,
  );
  const entryActions = useCmsEntryActions();
  const entryHistory = useCmsEntryHistory();
  const isCreatingEntry = ref(false);

  async function refreshEntries(): Promise<void> {
    const id = collectionId.value;
    if (id) {
      invalidateEntryListCache(id);
      invalidateCollectionsCache();
    }
    await entries.loadEntries({ force: true });
  }

  async function openCreateEntry(): Promise<void> {
    const id = collectionId.value;
    const collectionName = detail.collection.value?.name;
    if (!id || !collectionName || isCreatingEntry.value) return;

    const draftSlug = createReadableDraftEntrySlug();
    const payload = CreateEntryRequestSchema.parse({
      collectionId: id,
      title: "Untitled",
      slug: draftSlug,
      status: "draft",
      frontmatter: {},
      body: [],
    });

    isCreatingEntry.value = true;
    try {
      const record = await entryHistory.recordCreateEntry({
        payload,
        description: `Create "${payload.title}"`,
      });
      if (!record) return;
      invalidateEntryListCache(id);
      invalidateCollectionsCache();
      setCmsEntryNavigationPreview({
        id: record.entry.id,
        collectionId: record.entry.collectionId,
        collectionName,
        title: payload.title,
        slug: draftSlug,
        status: record.entry.status,
      });
      router.navigateTo(`/collections/${collectionName}/entries/${draftSlug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create entry");
    } finally {
      isCreatingEntry.value = false;
    }
  }

  function openEntryEditor(rowId: string): void {
    const name = detail.collection.value?.name;
    if (!name) return;
    const row = entries.rows.value.find((entry) => entry.id === rowId);
    if (row) {
      setCmsEntryNavigationPreview({
        id: row.id,
        collectionId: row.collectionId,
        collectionName: name,
        title: row.title,
        slug: row.slug,
        status: row.status,
      });
    }
    router.navigateTo(`/collections/${name}/entries/${row?.slug ?? rowId}`);
  }

  function syncServerSort(nextSorting: SortingState): void {
    const first = nextSorting[0];
    if (!first) {
      entries.setSort([{ field: "updatedAt", direction: "desc" }]);
      return;
    }

    switch (first.id) {
      case "title":
      case "slug":
      case "updatedAt":
      case "publishedAt":
      case "createdAt":
        entries.setSort([
          { field: first.id, direction: first.desc ? "desc" : "asc" },
        ]);
        return;
      default:
        return;
    }
  }

  watch(sorting, syncServerSort);

  onActivated(() => {
    void detail.loadCollection({ silent: true });
    void entries.loadEntries({ silent: true });
  });

  return {
    ...detail,
    ...entries,
    table,
    columnVisibility,
    supportsCover,
    rowSelection,
    selectedEntryIds,
    clearSelection: () => clearRowSelection(rowSelection),
    entryActions,
    isCreatingEntry,
    refreshEntries,
    openCreateEntry,
    openEntryEditor,
  };
}
