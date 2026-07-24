<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SelectableComponent } from "@/features/Core";
import ExpandableSearchInput from "@/features/Studio/core/components/ExpandableSearchInput.vue";
import { useComponentGrouping } from "@/features/Studio/components/composables/useComponentGrouping";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import ComponentPickerCard from "./ComponentPickerCard.vue";
import {
  COMPONENT_PICKER_ALL_FILTER,
  filterComponentPickerItems,
  getSelectableComponentId,
  type ComponentPickerFilter,
} from "./componentPickerModel";

const props = defineProps<{
  open: boolean;
  components: SelectableComponent[];
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  select: [component: SelectableComponent];
}>();

const { t } = useStudioI18n();
const searchQuery = ref("");
const activeFilter = ref<ComponentPickerFilter>(COMPONENT_PICKER_ALL_FILTER);

const groupingItems = computed(() =>
  props.components.map((component) => ({
    id: getSelectableComponentId(component),
    name: component.name,
    category: component.category,
  })),
);

const grouping = useComponentGrouping(groupingItems);

const effectiveAssignments = computed(() =>
  grouping.buildEffectiveAssignments(groupingItems.value),
);

const groupFilters = computed(() => {
  if (!grouping.canReadGrouping.value) return [];

  const counts = new Map<string, number>();
  for (const groupId of Object.values(effectiveAssignments.value)) {
    counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  }

  return grouping.customGroups.value
    .map((group) => ({
      key: `group:${group.id}` as const,
      label: group.name,
      count: counts.get(group.id) ?? 0,
    }))
    .filter((group) => group.count > 0)
    .sort((left, right) => left.label.localeCompare(right.label));
});

const filteredComponents = computed(() =>
  filterComponentPickerItems({
    components: props.components,
    activeFilter: activeFilter.value,
    searchQuery: searchQuery.value,
    effectiveAssignments: effectiveAssignments.value,
  }),
);

const activeFilterLabel = computed(() => {
  if (activeFilter.value === COMPONENT_PICKER_ALL_FILTER) {
    return t("components.picker.all");
  }

  return (
    groupFilters.value.find((filter) => filter.key === activeFilter.value)
      ?.label ?? t("components.picker.all")
  );
});

const resultCountLabel = computed(() =>
  filteredComponents.value.length === 1
    ? t("components.picker.resultCountOne")
    : t("components.picker.resultCount", {
        count: filteredComponents.value.length,
      }),
);

const isGroupingHydrating = computed(
  () =>
    grouping.canReadGrouping.value &&
    !grouping.hasHydratedFromServer.value,
);

function setActiveFilter(filter: ComponentPickerFilter): void {
  activeFilter.value = filter;
}

function resetPickerState(): void {
  searchQuery.value = "";
  activeFilter.value = COMPONENT_PICKER_ALL_FILTER;
}

function handleOpenChange(open: boolean): void {
  if (!open) resetPickerState();
  emit("update:open", open);
}

function handleSelect(component: SelectableComponent): void {
  emit("select", component);
  resetPickerState();
  emit("update:open", false);
}

watch(
  () => props.open,
  (open) => {
    if (open) resetPickerState();
  },
);

watch(
  [
    activeFilter,
    groupFilters,
    () => grouping.canReadGrouping.value,
    () => grouping.hasHydratedFromServer.value,
  ],
  ([filter, groups, canReadGrouping, hasHydrated]) => {
    if (filter === COMPONENT_PICKER_ALL_FILTER) return;

    if (filter.startsWith("group:")) {
      if (!canReadGrouping || (hasHydrated && !groups.some((item) => item.key === filter))) {
        activeFilter.value = COMPONENT_PICKER_ALL_FILTER;
      }
      return;
    }
  },
);
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      class="h-[min(760px,calc(100vh-1.5rem))] w-[min(1180px,calc(100vw-1.5rem))]! max-w-[min(1180px,calc(100vw-1.5rem))]! gap-0 overflow-hidden overscroll-contain border-border/50! border-solid p-0! [&>button]:right-5! [&>button]:top-5.5!"
    >
      <div class="flex h-full min-h-0 flex-col">
        <div class="shrink-0 border-b border-dashed border-border/50 px-4 pb-4 pt-4 pr-12">
          <div class="flex min-w-0 items-start justify-between gap-4">
            <DialogHeader class="min-w-0 space-y-0 pl-2 pt-2">
              <DialogTitle class="truncate font-serif font-regular leading-tight">
                {{ t("components.picker.title") }}
              </DialogTitle>
              <DialogDescription class="text-xs text-muted-foreground/80">
                {{ t("components.picker.description") }}
              </DialogDescription>
            </DialogHeader>

            <div class="flex min-w-0 shrink-0 items-center justify-end">
              <ExpandableSearchInput
                v-model="searchQuery"
                :placeholder="t('components.picker.search')"
                :tooltip-portalled="false"
              />
            </div>
          </div>
        </div>

        <div class="flex min-h-0 flex-1 flex-col sm:flex-row">
          <aside
            class="component-picker-rail max-h-42 w-full shrink-0 overflow-y-auto border-b border-dashed border-border/50 bg-background px-2 py-3 sm:max-h-none sm:w-46 sm:border-b-0 sm:border-r"
            :aria-label="t('components.picker.filters')"
          >
            <nav class="space-y-4">
              <section>
                <h3 class="px-2 pb-1.5 text-3xs font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                  {{ t("components.picker.library") }}
                </h3>
                <button
                  type="button"
                  class="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                  :class="
                    activeFilter === COMPONENT_PICKER_ALL_FILTER
                      ? 'bg-primary/8 text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  "
                  :aria-pressed="activeFilter === COMPONENT_PICKER_ALL_FILTER"
                  @click="setActiveFilter(COMPONENT_PICKER_ALL_FILTER)"
                >
                  <span :class="[studioIcons.layoutGrid, 'size-3.5 shrink-0']" aria-hidden="true" />
                  <span class="min-w-0 flex-1 truncate">{{ t("components.picker.all") }}</span>
                  <span class="shrink-0 text-3xs tabular-nums text-muted-foreground/70">
                    {{ components.length }}
                  </span>
                </button>
              </section>

              <section v-if="grouping.canReadGrouping.value">
                <h3 class="px-2 pb-1.5 text-3xs font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                  {{ t("components.picker.groups") }}
                </h3>

                <div v-if="isGroupingHydrating" class="space-y-1 px-2 py-1" aria-hidden="true">
                  <div v-for="index in 3" :key="index" class="h-6 animate-pulse rounded-sm bg-muted/50" />
                </div>

                <div v-else class="space-y-0.5">
                  <button
                    v-for="filter in groupFilters"
                    :key="filter.key"
                    type="button"
                    class="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                    :class="
                      activeFilter === filter.key
                        ? 'bg-primary/8 text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    "
                    :aria-pressed="activeFilter === filter.key"
                    @click="setActiveFilter(filter.key)"
                  >
                    <span :class="[studioIcons.folder, 'size-3.5 shrink-0']" aria-hidden="true" />
                    <span class="min-w-0 flex-1 truncate">{{ filter.label }}</span>
                    <span class="shrink-0 text-3xs tabular-nums text-muted-foreground/70">
                      {{ filter.count }}
                    </span>
                  </button>
                </div>
              </section>

            </nav>
          </aside>

          <main class="component-picker-results min-h-0 min-w-0 flex-1 overflow-y-auto bg-background">
            <div class="sticky top-0 z-10 flex h-10 items-center justify-between border-b border-dashed border-border/50 bg-background/95 px-4 backdrop-blur-sm">
              <span class="truncate text-xs font-medium text-foreground">
                {{ activeFilterLabel }}
              </span>
              <span class="shrink-0 text-3xs tabular-nums text-muted-foreground">
                {{ resultCountLabel }}
              </span>
            </div>

            <div v-if="components.length === 0" class="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <span :class="[studioIcons.componentBlock, 'mb-3 size-6 text-muted-foreground/40']" aria-hidden="true" />
              <h3 class="font-serif text-sm font-medium">{{ t("components.picker.emptyLibraryTitle") }}</h3>
              <p class="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
                {{ t("components.picker.emptyLibraryDescription") }}
              </p>
            </div>

            <div v-else-if="filteredComponents.length === 0" class="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <span :class="[studioIcons.search, 'mb-3 size-6 text-muted-foreground/40']" aria-hidden="true" />
              <h3 class="font-serif text-sm font-medium">{{ t("components.picker.noResultsTitle") }}</h3>
              <p class="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
                {{ t("components.picker.noResultsDescription") }}
              </p>
            </div>

            <div v-else class="grid grid-cols-1 gap-3 p-3 min-[720px]:grid-cols-2 min-[1080px]:grid-cols-3">
              <ComponentPickerCard
                v-for="component in filteredComponents"
                :key="getSelectableComponentId(component)"
                :component="component"
                @select="handleSelect"
              />
            </div>
          </main>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.component-picker-rail,
.component-picker-results {
  scrollbar-width: none;
}

.component-picker-rail::-webkit-scrollbar,
.component-picker-results::-webkit-scrollbar {
  display: none;
}
</style>
