import {
  getCurrentInstance,
  onBeforeUnmount,
  ref,
  watch,
  type Ref,
} from "vue";
import type { OperationType } from "@/features/History";

export interface StudioGroupingGroup {
  id: string;
  name: string;
}

export interface StudioGroupingState<TGroup extends StudioGroupingGroup> {
  groups: TGroup[];
  assignments: Record<string, string>;
}

interface StudioGroupingStateSchema<
  TState extends StudioGroupingState<StudioGroupingGroup>,
> {
  safeParse: (
    value: unknown,
  ) => { success: true; data: TState } | { success: false };
  parse: (value: unknown) => TState;
}

export interface StudioGroupingHistoryOperation {
  type: OperationType;
  timestamp: number;
  description: string;
  redo: () => Promise<void>;
  undo: () => Promise<void>;
}

export type StudioGroupingHistoryExecutor = (
  operation: StudioGroupingHistoryOperation,
) => Promise<unknown>;

export interface CreateStudioGroupingEngineOptions<
  TGroup extends StudioGroupingGroup,
  TState extends StudioGroupingState<TGroup>,
> {
  stateSchema: StudioGroupingStateSchema<
    TState & StudioGroupingState<StudioGroupingGroup>
  >;
  loadState: () => Promise<TState | null>;
  persistState: (state: TState) => Promise<void>;
  fallbackState: () => TState;
  resetState: () => TState;
  sortGroups?: (groups: readonly TGroup[]) => TGroup[];
  persistDelayMs?: number;
}

export interface StudioGroupingHistoryOptions {
  canUpdateGrouping: Ref<boolean>;
  execute: StudioGroupingHistoryExecutor;
  type: OperationType;
  description: string;
}

export interface StudioGroupingCreateOptions
  extends Omit<StudioGroupingHistoryOptions, "description"> {
  name: string;
  describe: (name: string) => string;
}

export interface StudioGroupingRenameOptions
  extends Omit<StudioGroupingHistoryOptions, "description"> {
  groupId: string;
  name: string;
  describe: (previousName: string, nextName: string) => string;
}

export interface StudioGroupingDeleteOptions
  extends Omit<StudioGroupingHistoryOptions, "description"> {
  groupId: string;
  describe: (name: string) => string;
}

export interface StudioGroupingMoveOptions
  extends Omit<StudioGroupingHistoryOptions, "description"> {
  itemIds: readonly string[];
  groupId?: string;
  describe: (itemIds: readonly string[], targetGroupName: string) => string;
  allItemsLabel: string;
}

function createGroupId(): string {
  return `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function parseGroupingName(name: string): string | null {
  if (typeof name !== "string") {
    return null;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createStudioGroupingEngine<
  TGroup extends StudioGroupingGroup,
  TState extends StudioGroupingState<TGroup>,
>(options: CreateStudioGroupingEngineOptions<TGroup, TState>) {
  const groups = ref<TGroup[]>([]) as Ref<TGroup[]>;
  const assignments = ref<Record<string, string>>({});
  const hasHydratedFromServer = ref(false);
  const persistDelayMs = options.persistDelayMs ?? 150;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let hydratePromise: Promise<void> | null = null;

  function sortGroups(groupsToSort: readonly TGroup[]): TGroup[] {
    return options.sortGroups
      ? options.sortGroups(groupsToSort)
      : [...groupsToSort].sort((a, b) => a.name.localeCompare(b.name));
  }

  function setState(state: TState): void {
    groups.value = sortGroups(state.groups);
    assignments.value = { ...state.assignments };
  }

  function buildState(): TState {
    return {
      groups: groups.value.map((group) => ({ ...group })),
      assignments: { ...assignments.value },
    } as TState;
  }

  async function loadGroupingState(): Promise<void> {
    const loaded = await options.loadState();
    setState(loaded ?? options.fallbackState());
    hasHydratedFromServer.value = true;
  }

  async function ensureHydrated(): Promise<void> {
    if (hasHydratedFromServer.value) {
      return;
    }
    if (!hydratePromise) {
      hydratePromise = loadGroupingState();
    }
    await hydratePromise;
  }

  function reset(): void {
    setState(options.resetState());
    hasHydratedFromServer.value = false;
    hydratePromise = null;

    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
  }

  async function persistCurrentState(canUpdateGrouping: Ref<boolean>): Promise<void> {
    if (!canUpdateGrouping.value) return;

    const validated = options.stateSchema.safeParse(buildState());
    if (!validated.success) return;

    await options.persistState(validated.data as TState);
  }

  async function applySnapshot(
    snapshot: TState,
    canUpdateGrouping: Ref<boolean>,
  ): Promise<void> {
    if (!canUpdateGrouping.value) return;

    setState(snapshot);

    const validated = options.stateSchema.parse(snapshot);
    await options.persistState(validated as TState);
  }

  async function executeHistory(
    historyOptions: StudioGroupingHistoryOptions,
    applyChange: () => TState,
  ): Promise<void> {
    const previous = buildState();
    const next = applyChange();

    await historyOptions.execute({
      type: historyOptions.type,
      timestamp: Date.now(),
      description: historyOptions.description,
      redo: async () => {
        await applySnapshot(next, historyOptions.canUpdateGrouping);
      },
      undo: async () => {
        await applySnapshot(previous, historyOptions.canUpdateGrouping);
      },
    });
  }

  function schedulePersist(canUpdateGrouping: Ref<boolean>): void {
    if (!hasHydratedFromServer.value || !canUpdateGrouping.value) return;

    if (persistTimer) {
      clearTimeout(persistTimer);
    }

    persistTimer = setTimeout(() => {
      void persistCurrentState(canUpdateGrouping);
    }, persistDelayMs);
  }

  function watchPersistence(canUpdateGrouping: Ref<boolean>): void {
    const stop = watch(
      [groups, assignments],
      () => {
        schedulePersist(canUpdateGrouping);
      },
      { deep: true },
    );

    if (!getCurrentInstance()) {
      return;
    }

    onBeforeUnmount(() => {
      stop();
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
    });
  }

  function getAssignedGroupId(itemId: string): string | null {
    const assignedGroupId = assignments.value[itemId];
    if (
      assignedGroupId &&
      groups.value.some((group) => group.id === assignedGroupId)
    ) {
      return assignedGroupId;
    }
    return null;
  }

  async function createCustomGroup(
    createOptions: StudioGroupingCreateOptions,
  ): Promise<string | null> {
    if (!createOptions.canUpdateGrouping.value) return null;

    const name = parseGroupingName(createOptions.name);
    if (!name) return null;

    const groupId = createGroupId();
    await executeHistory(
      {
        ...createOptions,
        description: createOptions.describe(name),
      },
      () =>
        ({
          groups: sortGroups([...groups.value, { id: groupId, name } as TGroup]),
          assignments: { ...assignments.value },
        }) as TState,
    );
    return groupId;
  }

  async function renameCustomGroup(
    renameOptions: StudioGroupingRenameOptions,
  ): Promise<void> {
    if (!renameOptions.canUpdateGrouping.value) return;

    const group = groups.value.find((item) => item.id === renameOptions.groupId);
    if (!group) return;

    const nextName = parseGroupingName(renameOptions.name);
    if (!nextName) return;

    if (nextName === group.name) return;

    await executeHistory(
      {
        ...renameOptions,
        description: renameOptions.describe(group.name, nextName),
      },
      () =>
        ({
          groups: sortGroups(
            groups.value.map((item) =>
              item.id === renameOptions.groupId
                ? ({ ...item, name: nextName } as TGroup)
                : { ...item },
            ),
          ),
          assignments: { ...assignments.value },
        }) as TState,
    );
  }

  async function deleteCustomGroup(
    deleteOptions: StudioGroupingDeleteOptions,
  ): Promise<void> {
    if (!deleteOptions.canUpdateGrouping.value) return;

    const group = groups.value.find((item) => item.id === deleteOptions.groupId);
    if (!group) return;

    await executeHistory(
      {
        ...deleteOptions,
        description: deleteOptions.describe(group.name),
      },
      () => {
        const nextAssignments: Record<string, string> = {};
        for (const [itemId, assignedId] of Object.entries(assignments.value)) {
          if (assignedId !== deleteOptions.groupId) {
            nextAssignments[itemId] = assignedId;
          }
        }

        return {
          groups: groups.value.filter(
            (item) => item.id !== deleteOptions.groupId,
          ),
          assignments: nextAssignments,
        } as TState;
      },
    );
  }

  async function moveItemsToGroup(
    moveOptions: StudioGroupingMoveOptions,
  ): Promise<number> {
    if (
      !moveOptions.canUpdateGrouping.value ||
      moveOptions.itemIds.length === 0
    ) {
      return 0;
    }

    const idsToMove = [...new Set(moveOptions.itemIds)].filter((itemId) => {
      const currentGroupId = assignments.value[itemId];
      return currentGroupId !== moveOptions.groupId;
    });

    if (idsToMove.length === 0) {
      return 0;
    }

    const targetGroupLabel =
      groups.value.find((group) => group.id === moveOptions.groupId)?.name ||
      moveOptions.allItemsLabel;

    await executeHistory(
      {
        ...moveOptions,
        description: moveOptions.describe(idsToMove, targetGroupLabel),
      },
      () => {
        const nextAssignments = { ...assignments.value };

        for (const itemId of idsToMove) {
          if (!moveOptions.groupId) {
            delete nextAssignments[itemId];
          } else {
            nextAssignments[itemId] = moveOptions.groupId;
          }
        }

        return {
          groups: groups.value.map((group) => ({ ...group })),
          assignments: nextAssignments,
        } as TState;
      },
    );

    return idsToMove.length;
  }

  return {
    groups,
    assignments,
    hasHydratedFromServer,
    ensureHydrated,
    reset,
    watchPersistence,
    getAssignedGroupId,
    createCustomGroup,
    renameCustomGroup,
    deleteCustomGroup,
    moveItemsToGroup,
  };
}
