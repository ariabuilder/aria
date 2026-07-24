import {
  computed,
  type ComputedRef,
  type Ref,
  ref,
  watch,
} from "vue";
import { z } from "zod";
import { ENTRY_STATUSES, type EntryStatus } from "../../../../lib/cms/constants";
import { ListEntriesResponseSchema } from "../../../../lib/cms/actionSchemas";
import {
  EntryListRequestSchema,
  EntrySortListSchema,
} from "../../../../lib/cms/schemas";
import type { EntrySort } from "../../../../lib/cms/constants";
import { handleActionResultForbidden } from "@/lib/actionErrors";
import {
  CmsEntryRowSchema,
  mapEntryRecordToRow,
  type CmsEntryRow,
} from "../lib/entryRow";
import {
  CmsEntryStatusFilterSchema,
  type CmsEntryStatusFilter,
} from "../lib/entryViewPreferences";
import {
  fetchEntryList,
  getCachedEntryList,
  hasFreshEntryList,
} from "./useCmsDataCache";
import { useStudioI18n } from "@/i18n";

export interface UseCmsEntriesListReturn {
  rows: Ref<CmsEntryRow[]>;
  total: Ref<number>;
  page: Ref<number>;
  limit: Ref<number>;
  searchQuery: Ref<string>;
  statusFilter: Ref<CmsEntryStatusFilter>;
  sort: Ref<EntrySort[]>;
  isLoading: Ref<boolean>;
  loadError: Ref<string | null>;
  totalPages: ComputedRef<number>;
  statusFilters: ComputedRef<
    Array<{ key: CmsEntryStatusFilter; label: string; count: number }>
  >;
  loadEntries: (options?: { force?: boolean; silent?: boolean }) => Promise<void>;
  setPage: (nextPage: number) => void;
  setStatusFilter: (nextFilter: CmsEntryStatusFilter) => void;
  setSort: (nextSort: EntrySort[]) => void;
}

const DEFAULT_LIMIT = 50;

export function useCmsEntriesList(
  collectionId: Ref<string>,
): UseCmsEntriesListReturn {
  const { t } = useStudioI18n();
  const rows = ref<CmsEntryRow[]>([]);
  const total = ref(0);
  const page = ref(1);
  const limit = ref(DEFAULT_LIMIT);
  const searchQuery = ref("");
  const statusFilter = ref<CmsEntryStatusFilter>("all");
  const sort = ref<EntrySort[]>([{ field: "updatedAt", direction: "desc" }]);
  const isLoading = ref(false);
  const loadError = ref<string | null>(null);

  const totalPages = computed(() =>
    Math.max(1, Math.ceil(total.value / limit.value)),
  );

  const statusFilters = computed(() => {
    const counts = new Map<EntryStatus, number>(
      ENTRY_STATUSES.map((status) => [status, 0]),
    );

    for (const row of rows.value) {
      counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    }

    return [
      { key: "all" as const, label: t("cms.entries.filter.all"), count: total.value },
      ...ENTRY_STATUSES.map((status) => ({
        key: status,
        label: status === "draft" ? t("pages.status.draft")
          : status === "published" ? t("pages.status.published")
          : status === "scheduled" ? t("pages.status.scheduled")
          : t("pages.status.archived"),
        count:
          statusFilter.value === status
            ? total.value
            : (counts.get(status) ?? 0),
      })),
    ];
  });

  function applyEntryListData(
    data: z.infer<typeof ListEntriesResponseSchema>,
  ): void {
    rows.value = data.items.map((record) =>
      CmsEntryRowSchema.parse(mapEntryRecordToRow(record)),
    );
    total.value = data.total;
    page.value = data.page;
    limit.value = data.limit;
  }

  async function loadEntries(
    options: { force?: boolean; silent?: boolean } = {},
  ): Promise<void> {
    const id = collectionId.value.trim();
    if (!id) {
      rows.value = [];
      total.value = 0;
      return;
    }

    try {
      const payload = EntryListRequestSchema.parse({
        collectionId: id,
        page: page.value,
        limit: limit.value,
        query: searchQuery.value.trim() || undefined,
        status:
          statusFilter.value === "all"
            ? undefined
            : CmsEntryStatusFilterSchema.parse(statusFilter.value),
        sort: sort.value,
      });

      const cached = getCachedEntryList(payload);
      if (cached) {
        applyEntryListData(cached);
        if (!options.force && hasFreshEntryList(payload)) {
          loadError.value = null;
          isLoading.value = false;
          return;
        }
      }

      isLoading.value = !cached && !options.silent;
      loadError.value = null;

      try {
        applyEntryListData(
          await fetchEntryList(payload, { force: options.force }),
        );
      } catch (err) {
        if (
          handleActionResultForbidden(
            { error: err },
            "cms.entries.list",
          )
        ) {
          if (!cached) {
            rows.value = [];
            total.value = 0;
          }
          return;
        }
        loadError.value =
          err instanceof Error ? err.message : "Failed to load entries";
        if (!cached) {
          rows.value = [];
          total.value = 0;
        }
        return;
      }
    } finally {
      isLoading.value = false;
    }
  }

  function setPage(nextPage: number): void {
    page.value = Math.max(1, nextPage);
    void loadEntries();
  }

  function setStatusFilter(nextFilter: CmsEntryStatusFilter): void {
    statusFilter.value = CmsEntryStatusFilterSchema.parse(nextFilter);
  }

  function setSort(nextSort: EntrySort[]): void {
    sort.value = EntrySortListSchema.parse(nextSort);
    page.value = 1;
    void loadEntries();
  }

  watch(collectionId, () => {
    page.value = 1;
    void loadEntries();
  }, { immediate: true });

  let searchDebounce: ReturnType<typeof setTimeout> | undefined;
  watch(searchQuery, () => {
    if (searchDebounce) {
      clearTimeout(searchDebounce);
    }
    searchDebounce = setTimeout(() => {
      page.value = 1;
      void loadEntries();
    }, 250);
  });

  watch(statusFilter, () => {
    page.value = 1;
    void loadEntries();
  });

  return {
    rows,
    total,
    page,
    limit,
    searchQuery,
    statusFilter,
    sort,
    isLoading,
    loadError,
    totalPages,
    statusFilters,
    loadEntries,
    setPage,
    setStatusFilter,
    setSort,
  };
}
