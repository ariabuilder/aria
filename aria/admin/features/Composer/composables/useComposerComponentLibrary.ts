import { computed, ref } from "vue";

import type { Component } from "@/composables/useBuilderData";
import {
  ComponentPreviewFilterStateSchema,
  ComponentPreviewSearchQuerySchema,
  parseGroupIdFromFilter,
  toGroupFilter,
  type ComponentPreviewGroupFilter,
} from "@/lib/schemas/componentPreview";
import { useComponentGrouping } from "@/features/Studio/components/composables/useComponentGrouping";

export interface ComposerLibraryComponent {
  id: string;
  name: string;
  category?: string;
  thumbnailUrl?: string | null;
  snapshotUrl?: string | null;
}

export interface UseComposerComponentLibraryOptions {
  components: () => readonly Component[];
}

export function useComposerComponentLibrary(
  options: UseComposerComponentLibraryOptions,
) {
  const libraryItems = computed(() =>
    options.components().map((component) => ({
      id: component.id,
      name: component.name || component.id,
      category: component.category,
    })),
  );

  const grouping = useComponentGrouping(libraryItems);

  const activeFilter = ref<ComponentPreviewGroupFilter>("all");
  const searchQuery = ref("");

  const normalizedComponents = computed<ComposerLibraryComponent[]>(() =>
    options.components().map((component) => ({
      id: component.id,
      name: component.name || component.id,
      category: component.category,
      thumbnailUrl:
        "thumbnailUrl" in component
          ? (component as Component & { thumbnailUrl?: string }).thumbnailUrl
          : undefined,
      snapshotUrl:
        "snapshotUrl" in component
          ? (component as Component & { snapshotUrl?: string }).snapshotUrl
          : undefined,
    })),
  );

  const groupCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const group of grouping.customGroups.value) {
      counts[group.id] = grouping.getGroupMemberCount(
        group.id,
        libraryItems.value,
      );
    }
    return counts;
  });

  const allCount = computed(() => normalizedComponents.value.length);

  const filteredComponents = computed(() => {
    const parsedFilter = ComponentPreviewFilterStateSchema.safeParse({
      activeFilter: activeFilter.value,
      searchQuery: searchQuery.value,
    });

    if (!parsedFilter.success) {
      return [];
    }

    const query = ComponentPreviewSearchQuerySchema.parse(
      parsedFilter.data.searchQuery,
    ).toLowerCase();
    const groupId = parseGroupIdFromFilter(parsedFilter.data.activeFilter);
    const effectiveAssignments = grouping.buildEffectiveAssignments(
      libraryItems.value,
    );

    return normalizedComponents.value.filter((component) => {
      const matchesSearch =
        query.length === 0 ||
        component.name.toLowerCase().includes(query) ||
        (component.category?.toLowerCase().includes(query) ?? false);

      if (!matchesSearch) {
        return false;
      }

      if (groupId === null) {
        return true;
      }

      return effectiveAssignments[component.id] === groupId;
    });
  });

  function setActiveFilter(filter: ComponentPreviewGroupFilter): void {
    const parsed =
      ComponentPreviewFilterStateSchema.shape.activeFilter.safeParse(filter);
    if (parsed.success) {
      activeFilter.value = parsed.data;
    }
  }

  function selectAll(): void {
    setActiveFilter("all");
  }

  function selectGroup(groupId: string): void {
    setActiveFilter(toGroupFilter(groupId));
  }

  function setSearchQuery(value: string): void {
    searchQuery.value = value;
  }

  return {
    grouping,
    activeFilter,
    searchQuery,
    filteredComponents,
    groupCounts,
    allCount,
    setActiveFilter,
    selectAll,
    selectGroup,
    setSearchQuery,
  };
}
