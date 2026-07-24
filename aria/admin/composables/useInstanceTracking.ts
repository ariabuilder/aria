/**
 * Registry for Sortable/overlay/drag instances so HMR and unmount can clean up.
 */

import {
  onUnmounted,
  shallowRef,
  triggerRef,
  computed,
  type Ref,
  type ComputedRef,
  type DeepReadonly,
} from "vue";

/**
 * Base instance data type (extensible via generics)
 */
type InstanceData = Record<string, unknown>;

interface TrackedInstance<TData extends InstanceData = InstanceData> {
  readonly id: string;
  /** Instance type/category (e.g., 'sortable', 'overlay', 'draggable') */
  readonly type: string;
  readonly element: HTMLElement;
  data?: TData;
  readonly destroy: () => void;
}

/**
 * Registration options for new instances
 */
interface RegisterOptions<TData extends InstanceData = InstanceData> {
  readonly id: string;
  readonly type: string;
  readonly element: HTMLElement;
  readonly destroy?: () => void;
  readonly data?: TData;
}

interface RegistrationHandle {
  /** Unregister this specific instance */
  readonly destroy: () => void;
}

/**
 * Instance statistics
 */
interface InstanceStats {
  readonly total: number;
  readonly byType: ReadonlyMap<string, number>;
  readonly types: readonly string[];
}

interface InstanceTracker<TData extends InstanceData = InstanceData> {
  readonly instances: DeepReadonly<Ref<Map<string, TrackedInstance<TData>>>>;
  readonly totalCount: ComputedRef<number>;
  readonly allTypes: ComputedRef<readonly string[]>;
  readonly hasInstances: ComputedRef<boolean>;
  readonly register: (
    id: string,
    type: string,
    element: HTMLElement,
    destroy?: () => void,
    data?: TData,
  ) => RegistrationHandle;
  readonly unregister: (id: string) => void;
  readonly destroyAll: () => void;
  readonly get: (id: string) => TrackedInstance<TData> | undefined;
  readonly getByType: (type: string) => TrackedInstance<TData>[];
  readonly getAll: () => TrackedInstance<TData>[];
  readonly updateData: (id: string, data: Partial<TData>) => void;
  readonly replaceData: (id: string, data: TData) => void;
  /** Check if instance exists */
  readonly has: (id: string) => boolean;
  /** Count instances (all or by type) */
  readonly count: (type?: string) => number;
  /** Get instance statistics */
  readonly getStats: () => InstanceStats;
  readonly clearByType: (type: string) => void;
}

/**
 * Window extension for dev tools
 */
interface WindowWithInstanceTracker extends Window {
  __ariaInstanceTracker?: {
    getAll: InstanceTracker["getAll"];
    getByType: InstanceTracker["getByType"];
    count: InstanceTracker["count"];
    destroyAll: InstanceTracker["destroyAll"];
    getStats: InstanceTracker["getStats"];
  };
}

/** No-op cleanup function */
const NOOP_CLEANUP = (): void => {};

const LOG_PREFIX = "[useInstanceTracking]" as const;

/**
 * Validate instance ID
 */
function isValidId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0;
}

/**
 * Validate instance type
 */
function isValidType(type: unknown): type is string {
  return typeof type === "string" && type.length > 0;
}

/**
 * Validate HTML element
 */
function isValidElement(element: unknown): element is HTMLElement {
  return element instanceof HTMLElement;
}

function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.log(LOG_PREFIX, ...args);
  }
}

function devWarn(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.warn(LOG_PREFIX, ...args);
  }
}

function devError(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.error(LOG_PREFIX, ...args);
  }
}

function createTrackedInstance<TData extends InstanceData>(
  id: string,
  type: string,
  element: HTMLElement,
  destroy: () => void = NOOP_CLEANUP,
  data?: TData,
): TrackedInstance<TData> {
  return {
    id,
    type,
    element,
    data,
    destroy,
  };
}

function safelyDestroyInstance<TData extends InstanceData>(
  instance: TrackedInstance<TData>,
): void {
  try {
    instance.destroy();
    devLog(`Destroyed ${instance.type}#${instance.id}`);
  } catch (error) {
    devError(`Error destroying ${instance.type}#${instance.id}:`, error);
  }
}

/**
 * Get instances matching type predicate
 */
function filterInstancesByType<TData extends InstanceData>(
  instances: Map<string, TrackedInstance<TData>>,
  type: string,
): TrackedInstance<TData>[] {
  return Array.from(instances.values()).filter(
    (instance) => instance.type === type,
  );
}

function countInstancesByType<TData extends InstanceData>(
  instances: Map<string, TrackedInstance<TData>>,
): Map<string, number> {
  const counts = new Map<string, number>();

  instances.forEach((instance) => {
    const currentCount = counts.get(instance.type) || 0;
    counts.set(instance.type, currentCount + 1);
  });

  return counts;
}

function getAllInstanceTypes<TData extends InstanceData>(
  instances: Map<string, TrackedInstance<TData>>,
): string[] {
  const types = new Set<string>();

  instances.forEach((instance) => {
    types.add(instance.type);
  });

  return Array.from(types).sort();
}

/**
 * Create instance statistics
 */
function createInstanceStats<TData extends InstanceData>(
  instances: Map<string, TrackedInstance<TData>>,
): InstanceStats {
  return {
    total: instances.size,
    byType: countInstancesByType(instances),
    types: getAllInstanceTypes(instances),
  };
}

function createRegistrationHandle(
  unregisterFn: () => void,
): RegistrationHandle {
  return {
    destroy: unregisterFn,
  };
}

/**
 * Tracks instance lifecycles for dynamic components
 *
 * Registry for Sortable/overlay/listener instances with
 * automatic cleanup on unmount. Supports HMR-safe replacement and provides
 * debugging utilities in development mode.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useInstanceTracking } from '@/composables/useInstanceTracking';
 * import Sortable from 'sortablejs';
 *
 * const tracker = useInstanceTracking();
 *
 * // Register SortableJS instance
 * function setupSortable(element: HTMLElement, listId: string) {
 *   const sortable = Sortable.create(element, {
 *     animation: 150,
 *     onEnd: handleDrop
 * }
 *
 * // Cleanup all on navigation
 * onBeforeRouteLeave(() => {
 *   tracker.destroyAll();
 * });
 * </script>
 * ```
 */
export function useInstanceTracking<
  TData extends InstanceData = InstanceData,
>(): InstanceTracker<TData> {

  const instances = shallowRef<Map<string, TrackedInstance<TData>>>(new Map());

  /**
   * Total instance count
   */
  const totalCount = computed<number>(() => instances.value.size);

  /**
   * All registered instance types
   */
  const allTypes = computed<readonly string[]>(() =>
    getAllInstanceTypes(instances.value),
  );

  /**
   * Whether tracker has any instances
   */
  const hasInstances = computed<boolean>(() => instances.value.size > 0);

  /**
   * Register new instance
   *
   * If instance with same ID exists, it will be unregistered first.
   * Returns handle with destroy method for cleanup.
   *
   * @param id - Unique instance identifier
   * @param type - Instance type/category
   * @param element - Associated DOM element
   * @param destroy - Optional cleanup function
   * @param data - Optional instance data
   * @returns Registration handle with destroy method
   */
  function register(
    id: string,
    type: string,
    element: HTMLElement,
    destroy: () => void = NOOP_CLEANUP,
    data?: TData,
  ): RegistrationHandle {
    if (!isValidId(id)) {
      devError("Invalid instance ID:", id);
      return createRegistrationHandle(() => {});
    }

    if (!isValidType(type)) {
      devError("Invalid instance type:", type);
      return createRegistrationHandle(() => {});
    }

    if (!isValidElement(element)) {
      devError("Invalid element:", element);
      return createRegistrationHandle(() => {});
    }

    // Replace existing instance if present
    if (instances.value.has(id)) {
      devWarn(`Instance ${id} already exists, replacing and cleaning up`);
      unregister(id);
    }

    const tracked = createTrackedInstance(id, type, element, destroy, data);

    instances.value.set(id, tracked);
    triggerRef(instances);
    devLog(`Registered ${type}#${id}`);

    return createRegistrationHandle(() => unregister(id));
  }

  /**
   * Unregister instance by ID
   *
   * Calls destroy function and removes from registry.
   * Safe to call even if instance doesn't exist.
   *
   * @param id - Instance ID to unregister
   */
  function unregister(id: string): void {
    if (!isValidId(id)) {
      devError("Invalid instance ID for unregister:", id);
      return;
    }

    const tracked = instances.value.get(id);

    if (!tracked) {
      devWarn(`Instance ${id} not found for unregister`);
      return;
    }

    safelyDestroyInstance(tracked);
    instances.value.delete(id);
    triggerRef(instances);

    devLog(`Unregistered ${tracked.type}#${id}`);
  }

  /**
   * Destroy all instances
   *
   * Calls destroy on each instance and clears registry.
   * Errors in individual destroy calls are isolated.
   */
  function destroyAll(): void {
    if (instances.value.size === 0) {
      devLog("No instances to destroy");
      return;
    }

    devLog(`Destroying all ${instances.value.size} instances`);

    instances.value.forEach((instance) => {
      safelyDestroyInstance(instance);
    });

    instances.value.clear();
    triggerRef(instances);
  }

  /**
   * Clear instances by type
   *
   * Destroys and removes all instances of specified type.
   *
   * @param type - Instance type to clear
   */
  function clearByType(type: string): void {
    if (!isValidType(type)) {
      devError("Invalid type for clearByType:", type);
      return;
    }

    const instancesOfType = filterInstancesByType(instances.value, type);

    if (instancesOfType.length === 0) {
      devLog(`No instances of type '${type}' to clear`);
      return;
    }

    devLog(`Clearing ${instancesOfType.length} instances of type '${type}'`);

    instancesOfType.forEach((instance) => {
      safelyDestroyInstance(instance);
      instances.value.delete(instance.id);
    });

    triggerRef(instances);
  }

  /**
   * Get instance by ID
   *
   * @param id - Instance ID
   * @returns Tracked instance or undefined
   */
  function get(id: string): TrackedInstance<TData> | undefined {
    if (!isValidId(id)) {
      devError("Invalid instance ID for get:", id);
      return undefined;
    }

    return instances.value.get(id);
  }

  /**
   * Get instances by type
   *
   * @param type - Instance type
   * @returns Array of matching instances
   */
  function getByType(type: string): TrackedInstance<TData>[] {
    if (!isValidType(type)) {
      devError("Invalid type for getByType:", type);
      return [];
    }

    return filterInstancesByType(instances.value, type);
  }

  /**
   * Get all instances
   *
   * @returns Array of all tracked instances
   */
  function getAll(): TrackedInstance<TData>[] {
    return Array.from(instances.value.values());
  }

  /**
   * Check if instance exists
   *
   * @param id - Instance ID
   * @returns True if instance is registered
   */
  function has(id: string): boolean {
    if (!isValidId(id)) {
      return false;
    }

    return instances.value.has(id);
  }

  /**
   * Count instances (all or by type)
   *
   * @param type - Optional type filter
   * @returns Instance count
   */
  function count(type?: string): number {
    if (type === undefined) {
      return instances.value.size;
    }

    if (!isValidType(type)) {
      devError("Invalid type for count:", type);
      return 0;
    }

    return getByType(type).length;
  }

  /**
   * Get instance statistics
   *
   * @returns Statistics object with counts by type
   */
  function getStats(): InstanceStats {
    return createInstanceStats(instances.value);
  }

  /**
   * Update instance data (partial merge)
   *
   * Merges provided data with existing data.
   *
   * @param id - Instance ID
   * @param data - Partial data to merge
   */
  function updateData(id: string, data: Partial<TData>): void {
    if (!isValidId(id)) {
      devError("Invalid instance ID for updateData:", id);
      return;
    }

    const instance = instances.value.get(id);

    if (!instance) {
      devWarn(`Instance ${id} not found for updateData`);
      return;
    }

    instance.data = { ...instance.data, ...data } as TData;
    triggerRef(instances);

    devLog(`Updated data for ${instance.type}#${id}`);
  }

  /**
   * Replace instance data (full replace)
   *
   * Completely replaces instance data.
   *
   * @param id - Instance ID
   * @param data - New data
   */
  function replaceData(id: string, data: TData): void {
    if (!isValidId(id)) {
      devError("Invalid instance ID for replaceData:", id);
      return;
    }

    const instance = instances.value.get(id);

    if (!instance) {
      devWarn(`Instance ${id} not found for replaceData`);
      return;
    }

    instance.data = data;
    triggerRef(instances);

    devLog(`Replaced data for ${instance.type}#${id}`);
  }

  /**
   * Auto-cleanup on component unmount
   */
  onUnmounted(() => {
    if (instances.value.size > 0) {
      devWarn(
        `Unmounting with ${instances.value.size} tracked instances, cleaning up`,
      );
      destroyAll();
    }
  });

  const api: InstanceTracker<TData> = {
    instances: instances as unknown as DeepReadonly<
      Ref<Map<string, TrackedInstance<TData>>>
    >,
    totalCount,
    allTypes,
    hasInstances,
    register,
    unregister,
    destroyAll,
    clearByType,
    get,
    getByType,
    getAll,
    has,
    count,
    getStats,
    updateData,
    replaceData,
  };

  return api;
}

/**
 * Global singleton tracker for cross-surface coordination Use for instances that
 * need to be tracked across iframe boundaries or shared.
 */
export const globalInstanceTracker = (() => {
  const tracker = useInstanceTracking();

  // Expose to window for debugging (DEV only)
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    (window as WindowWithInstanceTracker).__ariaInstanceTracker = {
      getAll: tracker.getAll,
      getByType: tracker.getByType,
      count: tracker.count,
      destroyAll: tracker.destroyAll,
      getStats: tracker.getStats,
    };

    devLog("Global instance tracker exposed to window.__ariaInstanceTracker");
  }

  return tracker;
})();

export type {
  InstanceData,
  TrackedInstance,
  RegisterOptions,
  RegistrationHandle,
  InstanceStats,
  InstanceTracker,
};
