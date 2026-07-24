import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { z } from "zod";
import type { Component } from "@/composables/useBuilderData";
import {
  getGroupIdFromFilter,
  isGroupRouteFilter,
  type ComponentsRouteFilter,
} from "../lib/componentsRouteFilter";
import { isUserComponent } from "../lib/isUserComponent";
import type { GroupedComponentsSection } from "./useComponentGrouping";
import { useStudioI18n } from "@/i18n";

export interface ComponentDisplaySection<T> {
  key: string;
  label: string;
  items: readonly T[];
}

export interface ComponentsFilterOption {
  key: ComponentsRouteFilter;
  label: string;
  count: number;
}

export interface ComponentsFilterMenuSection {
  label: string;
  options: ComponentsFilterOption[];
}

export type ComponentsSortKey =
  | "name"
  | "id"
  | "category"
  | "source"
  | "updated";
export type ComponentsSortDirection = "asc" | "desc";
export interface ComponentsSort {
  key: ComponentsSortKey;
  direction: ComponentsSortDirection;
}

export interface UseComponentsListStateOptions {
  activeFilter: Ref<ComponentsRouteFilter>;
  groupedSections: ComputedRef<GroupedComponentsSection<Component>[]>;
  buildEffectiveAssignments: (
    items: readonly Component[],
  ) => Record<string, string>;
  getGroupMemberCount: (
    groupId: string,
    items: readonly Component[],
  ) => number;
  customGroupOptions: ComputedRef<
    ReadonlyArray<{ id: string; name: string }>
  >;
}

export interface ComponentsListStateReturn {
  searchQuery: Ref<string>;
  sortBy: Ref<ComponentsSort>;
  currentPage: Ref<number>;
  pageSize: number;
  userComponents: ComputedRef<Component[]>;
  filteredComponents: ComputedRef<Component[]>;
  displaySections: ComputedRef<ComponentDisplaySection<Component>[]>;
  tableData: ComputedRef<Component[]>;
  isSectionedView: ComputedRef<boolean>;
  showPagination: ComputedRef<boolean>;
  paginatedComponents: ComputedRef<Component[]>;
  totalPages: ComputedRef<number>;
  builtinFilterOptions: ComputedRef<ComponentsFilterOption[]>;
  groupFilterSections: ComputedRef<ComponentsFilterMenuSection[]>;
  activeFilterLabel: ComputedRef<string>;
}

const QuerySchema = z.string().trim().toLowerCase();

function includesSearch(component: Component, query: string): boolean {
  const haystack = [
    component.id,
    component.name,
    component.description,
    component.category,
    component.source,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function matchesBuiltinFilter(
  component: Component,
  filter: ComponentsRouteFilter,
): boolean {
  if (filter === "all" || isGroupRouteFilter(filter)) {
    return true;
  }
  return filter === "locked" && component.isLocked === true;
}

function compareText(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  return (left || "").localeCompare(right || "");
}

function compareComponents(
  left: Component,
  right: Component,
  sort: ComponentsSort,
): number {
  const multiplier = sort.direction === "asc" ? 1 : -1;
  let result = 0;

  if (sort.key === "id") {
    result = compareText(left.id, right.id);
  } else if (sort.key === "category") {
    result = compareText(
      left.category || "Uncategorized",
      right.category || "Uncategorized",
    );
  } else if (sort.key === "source") {
    const leftOrigin = left.source === "aria" ? "Aria Library" : "Personal";
    const rightOrigin = right.source === "aria" ? "Aria Library" : "Personal";
    result = compareText(leftOrigin, rightOrigin);
  } else if (sort.key === "updated") {
    result = compareText(left.updatedAt, right.updatedAt);
  } else {
    result = compareText(left.name || left.id, right.name || right.id);
  }

  return result === 0
    ? compareText(left.name || left.id, right.name || right.id)
    : result * multiplier;
}

export function useComponentsListState(
  components: Ref<readonly Component[]>,
  options: UseComponentsListStateOptions,
  initialPageSize = 24,
): ComponentsListStateReturn {
  const { t } = useStudioI18n();
  const searchQuery = ref("");
  const sortBy = ref<ComponentsSort>({ key: "name", direction: "asc" });
  const currentPage = ref(1);
  const pageSize = initialPageSize;

  const userComponents = computed<Component[]>(() =>
    components.value.filter(isUserComponent),
  );

  const isGroupFilter = computed(
    () => getGroupIdFromFilter(options.activeFilter.value) !== null,
  );

  const isSectionedView = computed(
    () => options.activeFilter.value === "all",
  );

  const filteredComponents = computed<Component[]>(() => {
    const filter = options.activeFilter.value;
    const groupId = getGroupIdFromFilter(filter);
    const query = QuerySchema.parse(searchQuery.value);
    const effectiveAssignments = options.buildEffectiveAssignments(
      userComponents.value,
    );

    return userComponents.value
      .filter((component) => matchesBuiltinFilter(component, filter))
      .filter((component) => {
        if (!groupId) {
          return true;
        }
        return effectiveAssignments[component.id] === groupId;
      })
      .filter((component) => {
        if (!query) {
          return true;
        }
        return includesSearch(component, query);
      })
      .slice()
      .sort((left, right) => compareComponents(left, right, sortBy.value));
  });

  const displaySections = computed<ComponentDisplaySection<Component>[]>(() => {
    if (!isSectionedView.value) {
      if (filteredComponents.value.length === 0) {
        return [];
      }
      return [
        {
          key: "flat",
          label: "",
          items: filteredComponents.value,
        },
      ];
    }

    const allowedIds = new Set(
      filteredComponents.value.map((component) => component.id),
    );

    const sections = options.groupedSections.value
      .map((section) => ({
        key: section.key,
        label: section.name,
        items: section.items
          .filter((item) => allowedIds.has(item.id))
          .slice()
          .sort((left, right) => compareComponents(left, right, sortBy.value)),
      }))
      .filter((section) => section.items.length > 0);

    if (sections.length === 0 && filteredComponents.value.length > 0) {
      return [
        {
          key: "flat",
          label: "",
          items: filteredComponents.value,
        },
      ];
    }

    return sections;
  });

  const showPagination = computed(() => isGroupFilter.value);

  const totalPages = computed<number>(() => {
    if (!showPagination.value) {
      return 1;
    }
    return Math.max(1, Math.ceil(filteredComponents.value.length / pageSize));
  });

  const paginatedComponents = computed<Component[]>(() => {
    if (!showPagination.value) {
      return filteredComponents.value;
    }
    const start = (currentPage.value - 1) * pageSize;
    return filteredComponents.value.slice(start, start + pageSize);
  });

  const tableData = computed<Component[]>(() => {
    if (isSectionedView.value) {
      return filteredComponents.value;
    }
    return paginatedComponents.value;
  });

  const builtinCounts = computed(() => {
    let locked = 0;

    for (const component of userComponents.value) {
      if (component.isLocked) {
        locked++;
      }
    }

    return {
      all: userComponents.value.length,
      locked,
    };
  });

  const builtinFilterOptions = computed<ComponentsFilterOption[]>(() => [
    { key: "all", label: t("components.filter.all"), count: builtinCounts.value.all },
    { key: "locked", label: t("components.filter.readOnly"), count: builtinCounts.value.locked },
  ]);

  const groupFilterSections = computed<ComponentsFilterMenuSection[]>(() => {
    const groups = options.customGroupOptions.value;
    if (groups.length === 0) {
      return [];
    }

    const optionsList = groups.map((group) => ({
      key: `group:${group.id}` as ComponentsRouteFilter,
      label: group.name,
      count: options.getGroupMemberCount(group.id, userComponents.value),
    }));

    return [{ label: t("components.filter.groups"), options: optionsList }];
  });

  const activeFilterLabel = computed(() => {
    const filter = options.activeFilter.value;
    const groupId = getGroupIdFromFilter(filter);
    if (groupId) {
      const group = options.customGroupOptions.value.find(
        (item) => item.id === groupId,
      );
      return group?.name ?? t("components.filter.group");
    }
    return (
      builtinFilterOptions.value.find((item) => item.key === filter)?.label ??
      t("common.filter")
    );
  });

  watch([searchQuery, () => options.activeFilter.value], () => {
    currentPage.value = 1;
  });

  watch(totalPages, (nextTotalPages) => {
    if (currentPage.value > nextTotalPages) {
      currentPage.value = nextTotalPages;
    }
  });

  return {
    searchQuery,
    sortBy,
    currentPage,
    pageSize,
    userComponents,
    filteredComponents,
    displaySections,
    tableData,
    isSectionedView,
    showPagination,
    paginatedComponents,
    totalPages,
    builtinFilterOptions,
    groupFilterSections,
    activeFilterLabel,
  };
}
