import type {
  ColumnOrderState,
  SortingState,
  VisibilityState,
} from "@tanstack/vue-table";
import { ref, type Ref } from "vue";

type StateUpdater<TState> = TState | ((old: TState) => TState);

interface PersistentStateConfig<TState> {
  key?: string;
  defaultValue: TState | (() => TState);
  parse?: (value: unknown) => TState;
  normalizeLoadedState?: (state: TState) => TState;
  normalizeUpdatedState?: (state: TState) => TState;
  persistLoadedState?: boolean;
}

export interface UsePersistentTableStateOptions {
  visibility?: PersistentStateConfig<VisibilityState>;
  sorting?: PersistentStateConfig<SortingState>;
  columnOrder?: PersistentStateConfig<ColumnOrderState>;
}

export interface UsePersistentTableStateReturn {
  columnVisibility: Ref<VisibilityState>;
  sorting: Ref<SortingState>;
  columnOrder: Ref<ColumnOrderState>;
  onColumnVisibilityChange: (updater: StateUpdater<VisibilityState>) => void;
  onSortingChange: (updater: StateUpdater<SortingState>) => void;
  onColumnOrderChange: (updater: StateUpdater<ColumnOrderState>) => void;
  setColumnVisibility: (state: VisibilityState) => void;
  setSorting: (state: SortingState) => void;
  setColumnOrder: (state: ColumnOrderState) => void;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function defaultValue<TState>(config: PersistentStateConfig<TState>): TState {
  const value =
    typeof config.defaultValue === "function"
      ? (config.defaultValue as () => TState)()
      : config.defaultValue;

  if (Array.isArray(value)) {
    return [...value] as TState;
  }

  if (value && typeof value === "object") {
    return { ...value };
  }

  return value;
}

function saveState<TState>(
  config: PersistentStateConfig<TState> | undefined,
  state: TState,
): void {
  if (!config?.key) {
    return;
  }

  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(config.key, JSON.stringify(state));
  } catch {
    // Ignore private-mode or quota failures.
  }
}

function loadState<TState>(config: PersistentStateConfig<TState>): TState {
  const fallback = defaultValue(config);

  if (!config.key) {
    return fallback;
  }

  const storage = getStorage();
  if (!storage) {
    return fallback;
  }

  try {
    const raw = storage.getItem(config.key);
    if (!raw) {
      return fallback;
    }

    const parsed = config.parse
      ? config.parse(JSON.parse(raw))
      : (JSON.parse(raw) as TState);
    const normalized = config.normalizeLoadedState
      ? config.normalizeLoadedState(parsed)
      : parsed;

    if (config.persistLoadedState) {
      saveState(config, normalized);
    }

    return normalized;
  } catch {
    return fallback;
  }
}

function resolveUpdater<TState>(
  updater: StateUpdater<TState>,
  current: TState,
): TState {
  return typeof updater === "function"
    ? (updater as (old: TState) => TState)(current)
    : updater;
}

function updateState<TState>(
  refValue: Ref<TState>,
  config: PersistentStateConfig<TState> | undefined,
  updater: StateUpdater<TState>,
): void {
  const next = resolveUpdater(updater, refValue.value);
  refValue.value = config?.normalizeUpdatedState
    ? config.normalizeUpdatedState(next)
    : next;
  saveState(config, refValue.value);
}

export function usePersistentTableState(
  options: UsePersistentTableStateOptions,
): UsePersistentTableStateReturn {
  const visibilityConfig = options.visibility ?? {
    defaultValue: {},
  };
  const sortingConfig = options.sorting ?? {
    defaultValue: [],
  };
  const columnOrderConfig = options.columnOrder ?? {
    defaultValue: [],
  };

  const columnVisibility = ref<VisibilityState>(loadState(visibilityConfig));
  const sorting = ref<SortingState>(loadState(sortingConfig));
  const columnOrder = ref<ColumnOrderState>(loadState(columnOrderConfig));

  return {
    columnVisibility,
    sorting,
    columnOrder,
    onColumnVisibilityChange: (updater) =>
      updateState(columnVisibility, visibilityConfig, updater),
    onSortingChange: (updater) => updateState(sorting, sortingConfig, updater),
    onColumnOrderChange: (updater) =>
      updateState(columnOrder, columnOrderConfig, updater),
    setColumnVisibility: (state) =>
      updateState(columnVisibility, visibilityConfig, state),
    setSorting: (state) => updateState(sorting, sortingConfig, state),
    setColumnOrder: (state) =>
      updateState(columnOrder, columnOrderConfig, state),
  };
}
