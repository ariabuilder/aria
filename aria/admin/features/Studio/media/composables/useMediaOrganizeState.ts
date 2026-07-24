import { computed, watch, type Ref } from "vue";
import { useRoute } from "vue-router";
import { useStudioRouter } from "@/features/Studio/core/composables";
import {
  parseMediaGroupFilter,
  parseMediaTypeFilter,
  toMediaListPath,
} from "../lib/mediaRouteFilter";
import type { MediaGroup } from "@/lib/schemas/mediaGrouping";

export interface UseMediaOrganizeStateReturn {
  activeGroupId: Ref<string | null>;
  activeGroup: Ref<MediaGroup | null>;
  activeTypeFilter: Ref<ReturnType<typeof parseMediaTypeFilter>>;
  activeNavFilter: Ref<string>;
  setActiveGroup: (groupId: string | null) => void;
  setActiveTypeFilter: (
    filter: ReturnType<typeof parseMediaTypeFilter>,
  ) => void;
}

export interface UseMediaOrganizeStateOptions {
  groups: Ref<readonly MediaGroup[]>;
  hasHydratedFromServer: Ref<boolean>;
}

function findGroupByRouteValue(
  groups: readonly MediaGroup[],
  value: string | null,
): MediaGroup | null {
  if (!value) return null;
  return (
    groups.find((group) => group.id === value) ??
    groups.find((group) => group.name === value) ??
    null
  );
}

export function useMediaOrganizeState(
  options: UseMediaOrganizeStateOptions,
): UseMediaOrganizeStateReturn {
  const route = useRoute();
  const router = useStudioRouter();

  const activeGroup = computed(() =>
    findGroupByRouteValue(
      options.groups.value,
      parseMediaGroupFilter(route.query.group),
    ),
  );

  const activeGroupId = computed(() => activeGroup.value?.id ?? null);

  const activeTypeFilter = computed(() =>
    parseMediaTypeFilter(route.query.filter),
  );

  const activeNavFilter = computed(() =>
    activeGroupId.value ? `group:${activeGroupId.value}` : "all",
  );

  function setActiveGroup(groupId: string | null): void {
    const group = groupId
      ? options.groups.value.find((item) => item.id === groupId)
      : null;
    const path = toMediaListPath({
      filter: activeTypeFilter.value,
      group: group?.name ?? null,
    });
    if (route.fullPath !== path) {
      router.navigateTo(path);
    }
  }

  function setActiveTypeFilter(
    filter: ReturnType<typeof parseMediaTypeFilter>,
  ): void {
    const path = toMediaListPath({
      filter,
      group: activeGroup.value?.name ?? null,
    });
    if (route.fullPath !== path) {
      router.navigateTo(path);
    }
  }

  watch(
    () =>
      [
        route.query.group,
        options.hasHydratedFromServer.value,
        options.groups.value,
      ] as const,
    ([raw]) => {
      const groupId = parseMediaGroupFilter(raw);
      if (!groupId) {
        return;
      }
      const group = findGroupByRouteValue(options.groups.value, groupId);
      if (!group && options.hasHydratedFromServer.value) {
        router.navigateTo(
          toMediaListPath({ filter: activeTypeFilter.value, group: null }),
        );
        return;
      }
      if (group && group.name !== groupId) {
        router.navigateTo(
          toMediaListPath({
            filter: activeTypeFilter.value,
            group: group.name,
          }),
        );
      }
    },
    { flush: "post" },
  );

  watch(
    () => activeGroup.value?.name,
    (name) => {
      if (!name || route.path !== "/media") {
        return;
      }
      const routeGroup = parseMediaGroupFilter(route.query.group);
      if (routeGroup !== name) {
        router.navigateTo(
          toMediaListPath({ filter: activeTypeFilter.value, group: name }),
        );
      }
    },
    { flush: "post" },
  );

  return {
    activeGroupId,
    activeGroup,
    activeTypeFilter,
    activeNavFilter,
    setActiveGroup,
    setActiveTypeFilter,
  };
}
