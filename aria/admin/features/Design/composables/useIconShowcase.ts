import { computed, ref, watch, type Ref, type ComputedRef } from "vue";
import { useStudioI18n } from "@/i18n";
import { resolveIconSvgData } from "@/lib/iconDataClient";
import { ICON_SNAPSHOT_VERSION } from "../../../../lib/icons/generatedIconSnapshot";
import type { IconPackKey } from "../../../composables/useSiteSettings";

export interface IconShowcaseItem {
  id: string;
  pack: string;
  name: string;
  label: string;
  tags: string[];
}

interface IconSearchResponse {
  items: IconShowcaseItem[];
  nextCursor: string | null;
  snapshotVersion: string;
}

const SESSION_ICON_PAGE_CACHE = new Map<string, IconSearchResponse>();
const PAGE_SIZE = 80;
const ICON_DATA_BATCH_SIZE = 10;

function toIconClass(iconId: string): string {
  return `i-${iconId}`;
}

function getCacheKey(
  pack: string,
  query: string,
  cursor: string | null,
): string {
  return `${ICON_SNAPSHOT_VERSION}::preview::${pack}::${query.trim().toLowerCase()}::${cursor ?? "root"}`;
}

export function useIconShowcase(
  packId: Ref<IconPackKey | ""> | ComputedRef<IconPackKey | "">,
) {
  const { t } = useStudioI18n();
  const search = ref("");
  const items = ref<IconShowcaseItem[]>([]);
  const nextCursor = ref<string | null>(null);
  const currentCursor = ref<string | null>(null);
  const cursorHistory = ref<Array<string | null>>([]);
  const iconSvgs = ref<Record<string, string>>({});
  const isLoading = ref(false);
  const isHydrating = ref(false);
  const copiedId = ref<string | null>(null);
  const loadError = ref<string | null>(null);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let activeRequest: AbortController | null = null;
  let activeRequestGeneration = 0;
  let activeHydrationRun = 0;
  let copiedTimer: ReturnType<typeof setTimeout> | null = null;

  const isSearching = computed(() => search.value.trim().length > 0);

  const canGoPrev = computed(
    () => !isSearching.value && cursorHistory.value.length > 0,
  );

  const canGoNext = computed(
    () => !isSearching.value && nextCursor.value !== null,
  );

  const canLoadMore = computed(
    () => isSearching.value && nextCursor.value !== null,
  );

  const resultContext = computed(() => {
    if (!packId.value) return t("design.icons.selectPackShort");
    if (loadError.value) return t("design.icons.unableToLoadSample");
    if (isLoading.value && items.value.length === 0) {
      return t("design.icons.loading");
    }
    if (items.value.length === 0) return t("design.icons.noIconsFound");

    if (isSearching.value) {
      return t("design.icons.showingSearchResults", {
        count: items.value.length,
      });
    }

    const start = cursorHistory.value.length * PAGE_SIZE + 1;
    const end = start + Math.max(items.value.length - 1, 0);
    return t("design.icons.showingRange", { start, end });
  });

  async function hydrateIconSvgs(iconIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(iconIds.filter(Boolean))];
    if (uniqueIds.length === 0) return;

    const hydrationRun = ++activeHydrationRun;
    const next = { ...iconSvgs.value };

    for (const iconId of uniqueIds) {
      if (!next[iconId]) next[iconId] = "";
    }

    iconSvgs.value = next;

    isHydrating.value = true;

    try {
      // Keep this large 80-icon grid progressive and cancellable. Calling the
      // shared client one page-worth at a time fan-outs eight requests that
      // continue competing with the next page after a quick pagination click.
      for (let index = 0; index < uniqueIds.length; index += ICON_DATA_BATCH_SIZE) {
        if (hydrationRun !== activeHydrationRun) return;

        const batch = uniqueIds.slice(index, index + ICON_DATA_BATCH_SIZE);
        const resolved = await resolveIconSvgData(batch);
        if (hydrationRun !== activeHydrationRun) return;

        const updated = { ...iconSvgs.value };
        for (const [iconId, data] of Object.entries(resolved)) {
          updated[iconId] = data.svg;
        }
        iconSvgs.value = updated;
      }
    } catch {
      // Keep showcase usable if SVG hydration fails.
    } finally {
      if (hydrationRun === activeHydrationRun) {
        isHydrating.value = false;
      }
    }
  }

  async function fetchPage(
    cursor: string | null,
    append: boolean,
  ): Promise<void> {
    const requestGeneration = ++activeRequestGeneration;
    const isCurrentRequest = () => requestGeneration === activeRequestGeneration;
    const pack = packId.value;
    if (!pack) {
      if (isCurrentRequest()) {
        activeRequest?.abort();
        activeRequest = null;
        items.value = [];
        nextCursor.value = null;
        currentCursor.value = null;
        isLoading.value = false;
      }
      return;
    }

    const query = search.value.trim();
    const cacheKey = getCacheKey(pack, query, cursor);
    const cached = SESSION_ICON_PAGE_CACHE.get(cacheKey);

    if (cached) {
      activeRequest?.abort();
      activeRequest = null;
      if (!isCurrentRequest()) return;
      currentCursor.value = cursor;
      nextCursor.value = cached.nextCursor;
      items.value = append ? [...items.value, ...cached.items] : cached.items;
      loadError.value = null;
      void hydrateIconSvgs(items.value.map((item) => item.id));
      return;
    }

    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    isLoading.value = true;
    loadError.value = null;

    try {
      const params = new URLSearchParams({
        pack,
        q: query,
        limit: String(PAGE_SIZE),
        preview: "1",
        v: ICON_SNAPSHOT_VERSION,
      });

      if (cursor) {
        params.set("cursor", cursor);
      }

      const response = await fetch(`/api/icons/search?${params.toString()}`, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!isCurrentRequest()) return;

      if (!response.ok) {
        throw new Error(`Search failed (${response.status})`);
      }

      const payload = (await response.json()) as IconSearchResponse;
      if (!isCurrentRequest()) return;
      SESSION_ICON_PAGE_CACHE.set(cacheKey, payload);

      currentCursor.value = cursor;
      nextCursor.value = payload.nextCursor;
      items.value = append ? [...items.value, ...payload.items] : payload.items;
      void hydrateIconSvgs(items.value.map((item) => item.id));
    } catch (error) {
      if (!isCurrentRequest()) return;
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      loadError.value =
        error instanceof Error ? error.message : t("design.icons.loadFailed");
      if (!append) {
        items.value = [];
        nextCursor.value = null;
        currentCursor.value = null;
      }
    } finally {
      if (isCurrentRequest()) {
        if (activeRequest === controller) activeRequest = null;
        isLoading.value = false;
      }
    }
  }

  async function loadNextPage(): Promise<void> {
    if (!nextCursor.value) return;
    cursorHistory.value.push(currentCursor.value);
    await fetchPage(nextCursor.value, false);
  }

  async function loadPrevPage(): Promise<void> {
    if (cursorHistory.value.length === 0) return;
    const previousCursor = cursorHistory.value.pop() ?? null;
    await fetchPage(previousCursor, false);
  }

  async function loadMoreSearchResults(): Promise<void> {
    if (!nextCursor.value) return;
    await fetchPage(nextCursor.value, true);
  }

  async function copyIconClass(iconId: string): Promise<void> {
    const iconClass = toIconClass(iconId);
    try {
      await navigator.clipboard.writeText(iconClass);
      copiedId.value = iconId;
      if (copiedTimer) clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        if (copiedId.value === iconId) copiedId.value = null;
      }, 1200);
    } catch {
      loadError.value = t("design.icons.copyFailed");
    }
  }

  watch(
    () => search.value,
    () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        cursorHistory.value = [];
        void fetchPage(null, false);
      }, 200);
    },
  );

  watch(
    packId,
    (nextPack, previousPack) => {
      if (nextPack !== previousPack) {
        search.value = "";
      }

      // Clear after resetting search so the search watcher does not double-fetch.
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      cursorHistory.value = [];
      loadError.value = null;
      activeRequest?.abort();
      activeHydrationRun++;
      void fetchPage(null, false);
    },
    { immediate: true },
  );

  return {
    search,
    items,
    iconSvgs,
    isLoading,
    isHydrating,
    copiedId,
    loadError,
    canGoPrev,
    canGoNext,
    canLoadMore,
    resultContext,
    loadNextPage,
    loadPrevPage,
    loadMoreSearchResults,
    copyIconClass,
    toIconClass,
  };
}
