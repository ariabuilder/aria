import { computed, type ComputedRef, type Ref } from "vue";
import { actions } from "astro:actions";
import { useHistory } from "@/features/History";
import { useCapabilities } from "@/composables/useCapabilities";
import { createStudioGroupingEngine } from "@/features/Studio/core/composables";
import {
  ComponentGroupingResponseSchema,
  ComponentGroupingStateSchema,
  type ComponentGroup,
  type ComponentGroupingState,
} from "@/lib/schemas/componentGrouping";

export type { ComponentGroup } from "@/lib/schemas/componentGrouping";

export interface GroupableComponent {
  id: string;
  name?: string;
  category?: string;
}

export interface GroupedComponentsSection<TItem extends GroupableComponent> {
  key: string;
  name: string;
  items: TItem[];
  isCustomGroup: boolean;
  groupId?: string;
}

const PRESET_GROUP_NAMES = [
  "Call To Action",
  "Content",
  "Forms",
  "Hero",
  "Navigation",
  "Pricing",
  "Social Proof",
  "User",
] as const;

const PRESET_GROUP_ALIASES = new Map<string, string>([
  ["call to action", "Call To Action"],
  ["cta", "Call To Action"],
  ["content", "Content"],
  ["custom", "User"],
  ["forms", "Forms"],
  ["form", "Forms"],
  ["hero", "Hero"],
  ["heroes", "Hero"],
  ["marketing", "Hero"],
  ["navigation", "Navigation"],
  ["nav", "Navigation"],
  ["pricing", "Pricing"],
  ["social proof", "Social Proof"],
  ["testimonials", "Social Proof"],
  ["user", "User"],
]);

function byDisplayName(
  a: GroupableComponent,
  b: GroupableComponent,
): number {
  return (a.name || a.id || "").localeCompare(b.name || b.id || "");
}

function normalizeGroupName(name: string): string {
  const trimmed = name.trim();
  return PRESET_GROUP_ALIASES.get(trimmed.toLowerCase()) ?? trimmed;
}

function resolvePresetGroupName(category?: string): string {
  const normalizedCategory = normalizeGroupName(category?.trim() || "User");
  return PRESET_GROUP_NAMES.includes(
    normalizedCategory as (typeof PRESET_GROUP_NAMES)[number],
  )
    ? normalizedCategory
    : "User";
}

function buildPresetGroupId(name: string): string {
  return `preset-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function ensurePresetGroups(groups: readonly ComponentGroup[]): ComponentGroup[] {
  const nextGroups = [...groups];

  for (const name of PRESET_GROUP_NAMES) {
    if (!nextGroups.some((group) => group.name === name)) {
      nextGroups.push({ id: buildPresetGroupId(name), name });
    }
  }

  return nextGroups.sort((a, b) => a.name.localeCompare(b.name));
}

function ensureGroupByName(name: string): string {
  const normalizedName = normalizeGroupName(name);
  const existing = customGroups.value.find(
    (group) => group.name === normalizedName,
  );

  if (existing) {
    return existing.id;
  }

  const created: ComponentGroup = {
    id: buildPresetGroupId(normalizedName),
    name: normalizedName,
  };
  customGroups.value = [...customGroups.value, created].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return created.id;
}

async function loadGroupingState(): Promise<ComponentGroupingState | null> {
  const { data, error } = await actions.settings.getComponentGrouping();

  if (error || !data) {
    return null;
  }

  const parsed = ComponentGroupingResponseSchema.safeParse(data);
  if (!parsed.success) {
    return null;
  }

  const normalizedGroups = [...parsed.data.data.groups]
    .map((group) => ({ ...group, name: normalizeGroupName(group.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const groupsById = new Map(
    normalizedGroups.map((group) => [group.id, group]),
  );
  const groupsByName = new Map(
    normalizedGroups.map((group) => [group.name, group]),
  );
  const migratedAssignments: Record<string, string> = {};

  for (const [componentId, groupId] of Object.entries(
    parsed.data.data.assignments,
  )) {
    const existingGroup = groupsById.get(groupId);
    if (!existingGroup) continue;

    const normalizedName = normalizeGroupName(existingGroup.name);
    const normalizedGroup = groupsByName.get(normalizedName) ?? existingGroup;
    migratedAssignments[componentId] = normalizedGroup.id;
  }

  return {
    groups: normalizedGroups,
    assignments: migratedAssignments,
  };
}

const componentGroupingEngine = createStudioGroupingEngine<
  ComponentGroup,
  ComponentGroupingState
>({
  stateSchema: ComponentGroupingStateSchema,
  loadState: loadGroupingState,
  persistState: async (state) => {
    await actions.settings.updateComponentGrouping({
      componentGrouping: state,
    });
  },
  fallbackState: () => ({
    groups: ensurePresetGroups([]),
    assignments: {},
  }),
  resetState: () => ({
    groups: [],
    assignments: {},
  }),
});

const customGroups = componentGroupingEngine.groups;
const componentGroupAssignments = componentGroupingEngine.assignments;
const hasHydratedFromServer = componentGroupingEngine.hasHydratedFromServer;

export async function ensureComponentGroupingHydrated(): Promise<void> {
  await componentGroupingEngine.ensureHydrated();
}

export function resetComponentGroupingStateForTests(): void {
  componentGroupingEngine.reset();
}

export interface UseComponentGroupingReturn<TItem extends GroupableComponent> {
  canReadGrouping: Ref<boolean>;
  canUpdateGrouping: Ref<boolean>;
  hasHydratedFromServer: Ref<boolean>;
  customGroups: Ref<ComponentGroup[]>;
  componentGroupAssignments: Ref<Record<string, string>>;
  buildEffectiveAssignments: (
    items: readonly TItem[],
  ) => Record<string, string>;
  groupedComponents: ComputedRef<GroupedComponentsSection<TItem>[]>;
  getGroupMemberCount: (groupId: string, items: readonly TItem[]) => number;
  createCustomGroup: (name: string) => Promise<string | null>;
  renameCustomGroup: (groupId: string, name: string) => Promise<void>;
  deleteCustomGroup: (groupId: string) => Promise<void>;
  moveComponentToGroup: (
    componentId: string,
    groupId?: string,
  ) => Promise<void>;
}

export function useComponentGrouping<TItem extends GroupableComponent>(
  items: ComputedRef<readonly TItem[]>,
): UseComponentGroupingReturn<TItem> {
  const { execute } = useHistory();
  const { canOperation } = useCapabilities();

  const canReadGrouping = computed(() =>
    canOperation("settings.getComponentGrouping"),
  );
  const canUpdateGrouping = computed(() =>
    canOperation("settings.updateComponentGrouping"),
  );

  void ensureComponentGroupingHydrated();

  function buildEffectiveAssignments(
    sourceItems: readonly TItem[],
  ): Record<string, string> {
    const groupsByName = new Map(
      customGroups.value.map((group) => [group.name, group.id]),
    );
    const effectiveAssignments: Record<string, string> = {
      ...componentGroupAssignments.value,
    };

    for (const item of sourceItems) {
      const assignedGroupId = effectiveAssignments[item.id];
      if (
        assignedGroupId &&
        customGroups.value.some((group) => group.id === assignedGroupId)
      ) {
        continue;
      }

      const targetGroupName = resolvePresetGroupName(item.category);
      let targetGroupId = groupsByName.get(targetGroupName);

      if (!targetGroupId && hasHydratedFromServer.value) {
        targetGroupId = ensureGroupByName(targetGroupName);
        groupsByName.set(targetGroupName, targetGroupId);
      }

      if (targetGroupId) {
        effectiveAssignments[item.id] = targetGroupId;
      }
    }

    return effectiveAssignments;
  }

  componentGroupingEngine.watchPersistence(canUpdateGrouping);

  const groupedComponents = computed<GroupedComponentsSection<TItem>[]>(() => {
    const sourceItems = items.value;
    const effectiveAssignments = buildEffectiveAssignments(sourceItems);
    const sections: GroupedComponentsSection<TItem>[] = [];
    const validGroupIds = new Set(
      customGroups.value.map((group) => group.id),
    );

    for (const group of [...customGroups.value].sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const groupItems = sourceItems
        .filter(
          (component) => effectiveAssignments[component.id] === group.id,
        )
        .sort(byDisplayName);

      if (groupItems.length) {
        sections.push({
          key: `group:${group.id}`,
          name: group.name,
          items: groupItems,
          isCustomGroup: true,
          groupId: group.id,
        });
      }
    }

    const categoryMap = new Map<string, TItem[]>();
    for (const component of sourceItems) {
      const assignedGroupId = effectiveAssignments[component.id];
      if (assignedGroupId && validGroupIds.has(assignedGroupId)) {
        continue;
      }

      const category = component.category?.trim() || "Uncategorized";
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)?.push(component);
    }

    const categorySections: GroupedComponentsSection<TItem>[] = Array.from(
      categoryMap.entries(),
    )
      .map(([name, categoryItems]) => ({
        key: `category:${name}`,
        name,
        items: [...categoryItems].sort(byDisplayName),
        isCustomGroup: false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return [...sections, ...categorySections];
  });

  function getGroupMemberCount(
    groupId: string,
    sourceItems: readonly TItem[],
  ): number {
    const effectiveAssignments = buildEffectiveAssignments(sourceItems);
    return sourceItems.filter(
      (item) => effectiveAssignments[item.id] === groupId,
    ).length;
  }

  async function createCustomGroup(name: string): Promise<string | null> {
    return componentGroupingEngine.createCustomGroup({
      name,
      canUpdateGrouping,
      execute,
      type: "create-component-group",
      describe: (groupName) => `Create component group "${groupName}"`,
    });
  }

  async function renameCustomGroup(
    groupId: string,
    name: string,
  ): Promise<void> {
    await componentGroupingEngine.renameCustomGroup({
      groupId,
      name,
      canUpdateGrouping,
      execute,
      type: "rename-component-group",
      describe: (previousName, nextName) =>
        `Rename component group "${previousName}" to "${nextName}"`,
    });
  }

  async function deleteCustomGroup(groupId: string): Promise<void> {
    await componentGroupingEngine.deleteCustomGroup({
      groupId,
      canUpdateGrouping,
      execute,
      type: "delete-component-group",
      describe: (groupName) => `Delete component group "${groupName}"`,
    });
  }

  async function moveComponentToGroup(
    componentId: string,
    groupId?: string,
  ): Promise<void> {
    await componentGroupingEngine.moveItemsToGroup({
      itemIds: [componentId],
      groupId,
      canUpdateGrouping,
      execute,
      type: "move-component-group",
      allItemsLabel: "All Components",
      describe: ([itemId], targetGroupLabel) => {
        const componentLabel =
          items.value.find((item) => item.id === itemId)?.name || itemId;
        return `Move component "${componentLabel}" to "${targetGroupLabel}"`;
      },
    });
  }

  return {
    canReadGrouping,
    canUpdateGrouping,
    hasHydratedFromServer,
    customGroups,
    componentGroupAssignments,
    buildEffectiveAssignments,
    groupedComponents,
    getGroupMemberCount,
    createCustomGroup,
    renameCustomGroup,
    deleteCustomGroup,
    moveComponentToGroup,
  };
}
