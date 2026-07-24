import { describe, expect, it } from "vitest";
import { computed, nextTick, ref } from "vue";
import { useComponentsListState } from "../../../../admin/features/Studio/components/composables/useComponentsListState";
import type { Component } from "../../../../admin/composables/useBuilderData";
import type { ComponentsRouteFilter } from "../../../../admin/features/Studio/components/lib/componentsRouteFilter";
import type { GroupedComponentsSection } from "../../../../admin/features/Studio/components/composables/useComponentGrouping";

function createComponent(
  partial: Partial<Component> & { id: string },
): Component {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    description: partial.description,
    category: partial.category,
    source: partial.source ?? "custom",
    tier: partial.tier ?? "free",
    isLocked: partial.isLocked ?? false,
    packId: partial.packId,
    version: partial.version,
    updatedAt: partial.updatedAt ?? null,
  };
}

function createOptions(activeFilter = ref<ComponentsRouteFilter>("all")) {
  return {
    activeFilter,
    groupedSections: computed<GroupedComponentsSection<Component>[]>(() => []),
    buildEffectiveAssignments: () => ({}),
    getGroupMemberCount: () => 0,
    customGroupOptions: computed<ReadonlyArray<{ id: string; name: string }>>(
      () => [],
    ),
  };
}

describe("useComponentsListState", () => {
  it("excludes aria components and filters by query", () => {
    const components = ref<readonly Component[]>([
      createComponent({ id: "hero", name: "Hero", source: "custom" }),
      createComponent({ id: "cta", name: "CTA", source: "aria", tier: "pro" }),
    ]);

    const state = useComponentsListState(components, createOptions(), 10);
    state.searchQuery.value = "hero";
    expect(state.filteredComponents.value.map((entry) => entry.id)).toEqual([
      "hero",
    ]);
    expect(state.userComponents.value.length).toBe(1);
  });

  it("filters by locked mode and shows all components for non-locked filters", () => {
    const components = ref<readonly Component[]>([
      createComponent({ id: "free", tier: "free" }),
      createComponent({ id: "pro", tier: "pro" }),
      createComponent({ id: "locked", isLocked: true }),
    ]);

    const activeFilter = ref<ComponentsRouteFilter>("all");
    const state = useComponentsListState(
      components,
      createOptions(activeFilter),
      10,
    );

    expect(state.filteredComponents.value.map((entry) => entry.id).sort()).toEqual([
      "free",
      "locked",
      "pro",
    ]);

    activeFilter.value = "locked";
    expect(state.filteredComponents.value.map((entry) => entry.id)).toEqual([
      "locked",
    ]);
  });

  it("filters by group id using effective assignments", () => {
    const components = ref<readonly Component[]>([
      createComponent({ id: "a" }),
      createComponent({ id: "b" }),
    ]);

    const activeFilter = ref<ComponentsRouteFilter>("group:grp-1");
    const state = useComponentsListState(
      components,
      {
        activeFilter,
        groupedSections: computed<GroupedComponentsSection<Component>[]>(
          () => [],
        ),
        buildEffectiveAssignments: () => ({ a: "grp-1" }),
        getGroupMemberCount: () => 1,
        customGroupOptions: computed<
          ReadonlyArray<{ id: string; name: string }>
        >(() => [{ id: "grp-1", name: "Group" }]),
      },
      10,
    );

    expect(state.filteredComponents.value.map((entry) => entry.id)).toEqual([
      "a",
    ]);
    expect(state.showPagination.value).toBe(true);
  });

  it("uses grouped sections in all mode without pagination", () => {
    const components = ref<readonly Component[]>([
      createComponent({ id: "a", category: "marketing" }),
      createComponent({ id: "b", category: "marketing" }),
    ]);

    const state = useComponentsListState(
      components,
      {
        activeFilter: ref<ComponentsRouteFilter>("all"),
        groupedSections: computed<GroupedComponentsSection<Component>[]>(() => [
          {
            key: "category:marketing",
            name: "marketing",
            items: [...components.value],
            isCustomGroup: false,
          },
        ]),
        buildEffectiveAssignments: () => ({}),
        getGroupMemberCount: () => 0,
        customGroupOptions: computed<
          ReadonlyArray<{ id: string; name: string }>
        >(() => []),
      },
      1,
    );

    expect(state.isSectionedView.value).toBe(true);
    expect(state.showPagination.value).toBe(false);
    expect(state.displaySections.value[0]?.label).toBe("marketing");
    expect(state.displaySections.value[0]?.items.length).toBe(2);
  });

  it("resets pagination when filter changes in group mode", async () => {
    const components = ref<readonly Component[]>([
      createComponent({ id: "a" }),
      createComponent({ id: "b" }),
    ]);

    const activeFilter = ref<ComponentsRouteFilter>("group:g1");
    const state = useComponentsListState(
      components,
      {
        activeFilter,
        groupedSections: computed<GroupedComponentsSection<Component>[]>(
          () => [],
        ),
        buildEffectiveAssignments: () => ({ a: "g1", b: "g1" }),
        getGroupMemberCount: () => 2,
        customGroupOptions: computed<
          ReadonlyArray<{ id: string; name: string }>
        >(() => [{ id: "g1", name: "G" }]),
      },
      1,
    );

    state.currentPage.value = 2;
    activeFilter.value = "all";
    await nextTick();

    expect(state.showPagination.value).toBe(false);
    expect(state.currentPage.value).toBe(1);
  });
});
