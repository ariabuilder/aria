import { computed, watch, type Ref } from "vue";
import { useRoute } from "vue-router";
import { useStudioRouter } from "@/features/Studio/core/composables";
import {
  parseComponentsRouteFilter,
  toComponentsListPath,
  type ComponentsRouteFilter,
} from "../lib/componentsRouteFilter";
import { useComponentGrouping } from "./useComponentGrouping";

export interface UseComponentsOrganizeStateReturn {
  activeFilter: Ref<ComponentsRouteFilter>;
  isGroupFilterActive: Ref<boolean>;
  activeGroupId: Ref<string | null>;
  setActiveFilter: (filter: ComponentsRouteFilter) => void;
}

export function useComponentsOrganizeState(): UseComponentsOrganizeStateReturn {
  const route = useRoute();
  const router = useStudioRouter();
  const grouping = useComponentGrouping(computed(() => []));

  const activeFilter = computed<ComponentsRouteFilter>(() =>
    parseComponentsRouteFilter(route.query.filter),
  );

  const activeGroupId = computed(() => {
    const filter = activeFilter.value;
    if (!filter.startsWith("group:")) {
      return null;
    }
    const groupId = filter.slice("group:".length);
    return grouping.customGroups.value.some((group) => group.id === groupId)
      ? groupId
      : null;
  });

  const isGroupFilterActive = computed(() => activeGroupId.value !== null);

  function setActiveFilter(filter: ComponentsRouteFilter): void {
    const path = toComponentsListPath(filter);
    if (route.fullPath !== path) {
      router.navigateTo(path);
    }
  }

  watch(
    () => route.query.filter,
    (raw) => {
      const parsed = parseComponentsRouteFilter(raw);
      if (!parsed.startsWith("group:")) {
        return;
      }
      const groupId = parsed.slice("group:".length);
      const exists = grouping.customGroups.value.some(
        (group) => group.id === groupId,
      );
      if (!exists && grouping.hasHydratedFromServer.value) {
        router.navigateTo("/components");
      }
    },
    { flush: "post" },
  );

  return {
    activeFilter,
    isGroupFilterActive,
    activeGroupId,
    setActiveFilter,
  };
}
