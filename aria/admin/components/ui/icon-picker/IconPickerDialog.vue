<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import ExpandableSearchInput from "@/features/Studio/core/components/ExpandableSearchInput.vue";
import { studioIcons } from "@/lib/icons";
import { resolveIconSvgData } from "@/lib/iconDataClient";
import { ICON_SNAPSHOT_VERSION } from "../../../../lib/icons/generatedIconSnapshot";
import { useSiteSettings } from "@/composables/useSiteSettings";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import {
  inferIconPickerPackFromValue,
  resolveIconPickerPack,
} from "../../../../lib/icons/pickerSettings";
import {
  isSvgMediaAsset,
  resolveMediaAssetUrl,
} from "@/features/Studio/media/utils/mediaPickerUtils";

interface IconSearchItem {
  id: string;
  pack: string;
  name: string;
  label: string;
  tags: string[];
}

interface IconSearchResponse {
  items: IconSearchItem[];
  nextCursor: string | null;
  snapshotVersion: string;
}

const SESSION_ICON_PAGE_CACHE = new Map<string, IconSearchResponse>();

interface Props {
  open: boolean;
  title?: string;
  description?: string;
  value?: string;
  enabledPacks?: string[];
  defaultPack?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: "Select Icon",
  description: "Choose an icon from the Aria icon library.",
  value: "",
  enabledPacks: undefined,
  defaultPack: undefined,
});

const {
  enabledIconPacks,
  defaultIconPack,
  loadSettings: loadSiteSettings,
} = useSiteSettings();

const resolvedEnabledPacks = computed(() => {
  if (props.enabledPacks !== undefined) {
    return props.enabledPacks;
  }

  return enabledIconPacks.value;
});

const resolvedDefaultPack = computed(() =>
  resolveIconPickerPack(
    resolvedEnabledPacks.value,
    props.defaultPack ?? defaultIconPack.value,
  ),
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  select: [icon: string];
}>();

const search = ref("");
const currentPack = ref<string>("");
const items = ref<IconSearchItem[]>([]);
const isLoading = ref(false);
const nextCursor = ref<string | null>(null);
const currentCursor = ref<string | null>(null);
const cursorHistory = ref<Array<string | null>>([]);
const loadError = ref<string | null>(null);
const iconSvgs = ref<Record<string, string>>({});
const isMediaPickerOpen = ref(false);
const mediaSelectionError = ref<string | null>(null);
const limit = 48;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let activeRequest: AbortController | null = null;
let activeRequestGeneration = 0;
let activeHydrationRun = 0;

const hasPacks = computed(() => resolvedEnabledPacks.value.length > 0);
const packOptions = computed(() =>
  resolvedEnabledPacks.value.map((pack) => ({
    value: pack,
    label: pack === "coreui-brands" ? "CoreUI Brands" : "Lucide",
    description:
      pack === "coreui-brands" ? "Social and brand marks" : "Interface icons",
  })),
);

const canGoPrev = computed(
  () => search.value.trim().length === 0 && cursorHistory.value.length > 0,
);

const canGoNext = computed(
  () => search.value.trim().length === 0 && nextCursor.value !== null,
);

const canLoadMore = computed(
  () => search.value.trim().length > 0 && nextCursor.value !== null,
);

const resultContext = computed(() => {
  if (search.value.trim().length > 0) {
    return `Showing ${items.value.length} search results`;
  }

  const start = cursorHistory.value.length * limit + 1;
  const end = start + Math.max(items.value.length - 1, 0);
  return items.value.length > 0 ? `Showing ${start}–${end}` : "No results";
});

function getPackLabel(pack: string): string {
  return packOptions.value.find((option) => option.value === pack)?.label ?? pack;
}

function toIconClass(iconId: string): string {
  return `i-${iconId}`;
}

function getCacheKey(
  pack: string,
  query: string,
  cursor: string | null,
): string {
  return `${ICON_SNAPSHOT_VERSION}::${pack}::${query.trim().toLowerCase()}::${cursor ?? "root"}`;
}

async function hydrateIconSvgs(iconIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(iconIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;
  const hydrationRun = ++activeHydrationRun;

  const next = { ...iconSvgs.value };

  for (const iconId of uniqueIds) {
    if (!next[iconId]) next[iconId] = "";
  }

  iconSvgs.value = next;
  try {
    const resolved = await resolveIconSvgData(uniqueIds);
    if (hydrationRun !== activeHydrationRun) return;
    const updated = { ...iconSvgs.value };
    for (const [iconId, data] of Object.entries(resolved)) {
      updated[iconId] = data.svg;
    }
    iconSvgs.value = updated;
  } catch {
    // Keep picker usable even if SVG hydration fails.
  }
}

function resolveActivePack(): string {
  const inferredPack = inferIconPickerPackFromValue(
    props.value,
    resolvedEnabledPacks.value,
  );

  return resolveIconPickerPack(
    resolvedEnabledPacks.value,
    inferredPack ?? resolvedDefaultPack.value,
  );
}

function syncCurrentPack(): void {
  currentPack.value = resolveActivePack();
}

async function fetchPage(
  cursor: string | null,
  append: boolean,
  allowPackFallback = true,
): Promise<void> {
  const requestGeneration = ++activeRequestGeneration;
  const isCurrentRequest = () => requestGeneration === activeRequestGeneration;
  if (!hasPacks.value) {
    activeRequest?.abort();
    activeRequest = null;
    if (isCurrentRequest()) {
      items.value = [];
      nextCursor.value = null;
      currentCursor.value = null;
      isLoading.value = false;
    }
    return;
  }

  const query = search.value.trim();
  const pack = currentPack.value;
  if (!pack) return;
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
      limit: String(limit),
      v: ICON_SNAPSHOT_VERSION,
    });

    if (cursor) {
      params.set("cursor", cursor);
    }

    const response = await fetch(`/api/icons/search?${params.toString()}`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!isCurrentRequest()) return;

    if (!response.ok) {
      if (response.status === 403 && allowPackFallback) {
        const fallbackPack = resolveIconPickerPack(resolvedEnabledPacks.value);
        if (fallbackPack && fallbackPack !== pack) {
          currentPack.value = fallbackPack;
          await fetchPage(cursor, append, false);
          return;
        }
      }

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
      error instanceof Error ? error.message : "Failed to load icons";
    if (!append) {
      items.value = [];
      nextCursor.value = null;
    }
  } finally {
    if (isCurrentRequest()) {
      if (activeRequest === controller) activeRequest = null;
      isLoading.value = false;
    }
  }
}

async function loadInitialPage(): Promise<void> {
  if (!hasPacks.value) {
    items.value = [];
    nextCursor.value = null;
    return;
  }

  cursorHistory.value = [];
  await fetchPage(null, false);
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

function handleSelect(icon: string): void {
  emit("select", icon);
  emit("update:open", false);
}

function handleClear(): void {
  emit("select", "");
  emit("update:open", false);
}

function handleMediaSelect(asset: MediaAsset): void {
  mediaSelectionError.value = null;

  if (!isSvgMediaAsset(asset)) {
    mediaSelectionError.value = "Select an SVG file to use as a button icon.";
    return;
  }

  const url = resolveMediaAssetUrl(asset);
  if (!url) {
    mediaSelectionError.value = "That SVG is missing a usable file URL.";
    return;
  }

  isMediaPickerOpen.value = false;
  handleSelect(url);
}

watch(
  () => [props.defaultPack, resolvedDefaultPack.value] as const,
  () => {
    if (!props.open) {
      return;
    }

    syncCurrentPack();
  },
);

watch(
  resolvedEnabledPacks,
  async (nextPacks) => {
    if (nextPacks.length === 0) {
      activeRequestGeneration++;
      activeRequest?.abort();
      activeRequest = null;
      currentPack.value = "";
      items.value = [];
      nextCursor.value = null;
      return;
    }

    if (!nextPacks.includes(currentPack.value)) {
      syncCurrentPack();
    }

    if (props.open) {
      await loadInitialPage();
    }
  },
  { deep: true },
);

watch(
  () => props.open,
  async (open) => {
    if (open) {
      mediaSelectionError.value = null;
      await loadSiteSettings();
      search.value = "";
      syncCurrentPack();
      await loadInitialPage();
    } else {
      activeRequestGeneration++;
      activeRequest?.abort();
      activeRequest = null;
      activeHydrationRun++;
      isMediaPickerOpen.value = false;
    }
  },
);

watch(
  () => currentPack.value,
  async () => {
    if (!props.open) return;
    cursorHistory.value = [];
    await fetchPage(null, false);
  },
);

watch(
  () => search.value,
  () => {
    if (!props.open) return;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(async () => {
      cursorHistory.value = [];
      await fetchPage(null, false);
    }, 200);
  },
);
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      class="w-[min(860px,calc(100vw-1.5rem))]! max-w-[min(860px,calc(100vw-1.5rem))]! p-0! gap-0 overflow-hidden overscroll-contain [&>button]:top-5.5! [&>button]:right-5! border-border/50! border-solid"
    >
      <div class="flex max-h-[min(720px,calc(100vh-1.5rem))] min-h-[520px] flex-col">
        <div class="px-4 py-0 mt-4 pr-12">
          <div class="flex min-w-0 items-start justify-between gap-4">
            <DialogHeader class="min-w-0 space-y-0 pt-2 pl-2">
              <DialogTitle class="truncate font-serif font-regular leading-tight">
                {{ title }}
              </DialogTitle>
              <DialogDescription class="text-xs text-muted-foreground/80">
                {{ description }}
              </DialogDescription>
            </DialogHeader>

            <div class="flex shrink-0 items-center justify-end gap-0">
              <ExpandableSearchInput
                :model-value="search"
                :placeholder="`Search ${getPackLabel(currentPack)}...`"
                :tooltip-portalled="false"
                @update:model-value="search = $event"
              />
              <Button
                type="button"
                variant="headerAction"
                size="icon-header"
                title="Upload SVG"
                @click="isMediaPickerOpen = true"
              >
                <span :class="[studioIcons.uploadLine, 'size-3.5']" />
              </Button>
              <Button
                v-if="props.value"
                type="button"
                variant="headerAction"
                size="icon-header"
                title="Clear selection"
                @click="handleClear"
              >
                <span :class="[studioIcons.closeCircleBold, 'size-3.5']" />
              </Button>
            </div>
          </div>
        </div>

        <div class="border-b border-border/50 border-dashed px-4 py-2 pb-4">
          <div class="flex items-center justify-between gap-3 ">
            <div
              class="inline-grid grid-cols-2 gap-2 w-full max-w-sm"
              role="tablist"
              aria-label="Icon pack"
            >
              <button
                v-for="pack in packOptions"
                :key="pack.value"
                type="button"
                role="tab"
                :aria-selected="currentPack === pack.value"
                :disabled="!hasPacks"
                class="rounded-sm px-3 py-4 text-left transition-colors hover:bg-sidebar/50 disabled:pointer-events-none disabled:opacity-50"
                :class="
                  currentPack === pack.value
                    ? 'bg-sidebar/50 text-foreground shadow-xs '
                    : 'text-muted-foreground border border-dashed border-border/50'
                "
                @click="currentPack = pack.value"
              >
                <span class="block text-sm font-medium leading-none">
                  {{ pack.label }}
                </span>
                <span class="mt-2 block text-3xs leading-none text-muted-foreground">
                  {{ pack.description }}
                </span>
              </button>
            </div>
          </div>
          <p v-if="mediaSelectionError" class="mt-2 text-xs text-destructive">
            {{ mediaSelectionError }}
          </p>
        </div>

        <div class="flex min-h-0 flex-1 flex-col">
          <ScrollArea
            class="icon-picker-scroll flex-1 min-h-0 overscroll-contain p-4 [touch-action:pan-y] [&_[data-slot=scroll-area-scrollbar]]:hidden [&_[data-slot=scroll-area-viewport]]:overscroll-contain [&_[data-slot=scroll-area-viewport]]:overflow-x-hidden [&_[data-slot=scroll-area-viewport]]:[scrollbar-width:none] [&_[data-slot=scroll-area-viewport]::-webkit-scrollbar]:hidden"
          >
            <div
              v-if="!hasPacks"
              class="flex h-full min-h-[300px] flex-col items-center justify-center gap-4 px-6 text-center"
            >
              <div class="space-y-2">
                <p class="text-sm font-medium text-foreground">
                  No icon packs enabled
                </p>
                <p class="text-sm text-muted-foreground/80">
                  Enable an icon pack in Design settings, or upload your own SVG
                  from the media library.
                </p>
              </div>

              <div class="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  class="h-8 px-3 text-xs"
                  @click="isMediaPickerOpen = true"
                >
                  Upload SVG
                </Button>
                <Button
                  as-child
                  type="button"
                  variant="outline"
                  class="h-8 px-3 text-xs"
                >
                  <RouterLink to="/design">Open Design Settings</RouterLink>
                </Button>
              </div>

              <p
                v-if="mediaSelectionError"
                class="text-xs text-destructive"
              >
                {{ mediaSelectionError }}
              </p>
            </div>

            <div v-else-if="loadError" class="text-sm text-red-500">
              {{ loadError }}
            </div>

            <div
              v-else-if="isLoading && items.length === 0"
              class="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12"
            >
              <div
                v-for="skeleton in 48"
                :key="skeleton"
                class="aspect-square rounded-md border border-border bg-muted/30"
              />
            </div>

            <div
              v-else-if="items.length === 0"
              class="text-sm text-muted-foreground"
            >
              No icons found.
            </div>

            <div v-else class="space-y-4">
              <section class="space-y-2">
                <div
                  class="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12"
                >
                  <button
                    v-for="icon in items"
                    :key="icon.id"
                    class="group relative flex aspect-square items-center justify-center rounded-md border-0 hover:border hover:border-dashed bg-background/70 text-muted-foreground transition-all duration-100 hover:border-primary/80 hover:bg-input hover:text-foreground hover:shadow-xs"
                    :class="
                      props.value === toIconClass(icon.id)
                        ? 'border-primary bg-input text-primary shadow-xs'
                        : ''
                    "
                    :title="icon.label"
                    @click="handleSelect(toIconClass(icon.id))"
                  >
                    <div
                      v-if="iconSvgs[icon.id]"
                      class="size-6 shrink-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                      v-html="iconSvgs[icon.id]"
                    />
                    <div
                      v-else
                      class="size-5 shrink-0 rounded-sm border border-border/50"
                    />
                    <div
                      class="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground whitespace-nowrap opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                    >
                      {{ icon.label }}
                    </div>
                  </button>
                </div>
              </section>
            </div>
          </ScrollArea>

          <div
            class="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-border/50 border-dashed px-4"
          >
            <div class="truncate text-xs text-muted-foreground">
              {{ getPackLabel(currentPack) }}
            </div>
            <div class="text-center text-xs text-muted-foreground">
              {{ resultContext }}
            </div>
            <div class="flex items-center justify-end gap-2">
              <Button
                v-if="search.trim().length === 0"
                variant="outline"
                size="sm"
                :disabled="!canGoPrev || isLoading"
                @click="loadPrevPage"
              >
                Previous
              </Button>
              <Button
                v-if="search.trim().length === 0"
                variant="outline"
                size="sm"
                :disabled="!canGoNext || isLoading"
                @click="loadNextPage"
              >
                Next
              </Button>
              <Button
                v-if="search.trim().length > 0"
                variant="outline"
                size="sm"
                :disabled="!canLoadMore || isLoading"
                @click="loadMoreSearchResults"
              >
                Load more
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>

  <MediaPickerDialog
    v-model:open="isMediaPickerOpen"
    title="Upload Icon SVG"
    description="Choose or upload an SVG from your media library."
    media-type="icon"
    @select="handleMediaSelect"
  />
</template>
