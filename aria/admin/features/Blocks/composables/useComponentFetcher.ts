/**
 * Fetch and cache component DSL payloads.
 */
import { shallowRef, computed, type ComputedRef } from "vue";
import { actions } from "astro:actions";
import { log } from "@/lib/utils/logger";
import { z } from "zod";
import { cloneDeep } from "../../Core/utils/clone";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type { ComponentDefinition } from "../types";
import {
  unwrapComponentFetcherComposeResult,
  unwrapComponentFetcherItemResult,
} from "./componentFetcherActionResults";

/**
 * Composable return type with strict typing
 */
interface UseComponentFetcherReturn {
  /** Fetch a component definition by ID */
  readonly fetchComponentDefinition: (
    componentId: string,
  ) => Promise<readonly BuilderNode[]>;

  /** Recursively expand all component references in a node tree */
  readonly expandComponentReferencesClient: (
    nodes: readonly BuilderNode[],
  ) => Promise<readonly BuilderNode[]>;

  /** Invalidate cache for a specific component */
  readonly invalidateComponent: (componentId: string) => void;

  /** Clear entire cache */
  readonly clearCache: () => void;

  /** Get all cached components (reactive) */
  readonly cachedComponents: ComputedRef<
    ReadonlyMap<string, ComponentDefinition>
  >;
}

// Global component cache: componentId -> ComponentDefinition
const componentCache = new Map<string, ComponentDefinition>();

// Track in-flight fetch requests to prevent duplicates
const fetchInProgress = new Map<string, Promise<ComponentDefinition | null>>();

// Reactive cached components map
const cachedComponentsRef = shallowRef(new Map<string, ComponentDefinition>());

function setCachedComponent(
  componentId: string,
  componentDef: ComponentDefinition,
): void {
  const next = new Map(cachedComponentsRef.value);
  next.set(componentId, componentDef);
  cachedComponentsRef.value = next;
}

function deleteCachedComponent(componentId: string): void {
  const next = new Map(cachedComponentsRef.value);
  next.delete(componentId);
  cachedComponentsRef.value = next;
}

const ComponentIdSchema = z.string().trim().min(1);

/**
 * Generate a unique wrapper ID for component instances
 */
function generateWrapperId(): string {
  return `component-wrapper-${crypto.randomUUID()}`;
}

function buildScopedRenderId(namespace: string, sourceId: string): string {
  return `${namespace}__${sourceId}`;
}

function isExpandedComponentBoundary(node: BuilderNode): boolean {
  return typeof node.props?.["data-component-ref"] === "string";
}

function scopeExpandedDescendantIds(
  nodes: readonly BuilderNode[],
  namespace: string,
): BuilderNode[] {
  return nodes.map((node, index) => {
    const sourceId =
      typeof node.id === "string" && node.id.trim().length > 0
        ? node.id
        : `node-${index}`;
    const scopedId = isExpandedComponentBoundary(node)
      ? sourceId
      : buildScopedRenderId(namespace, sourceId);
    const childNamespace = buildScopedRenderId(namespace, sourceId);

    return {
      ...node,
      id: scopedId,
      children: node.children?.length
        ? scopeExpandedDescendantIds(node.children, childNamespace)
        : node.children,
    };
  });
}

/**
 * Fetch and cache component DSL
 *
 * @example
 * ```typescript
 * const { fetchComponentDefinition, invalidateComponent } = useComponentFetcher();
 *
 * // Fetch component (cached automatically)
 * const nodes = await fetchComponentDefinition('hero-section');
 *
 * // Invalidate when component is edited
 * invalidateComponent('hero-section');
 * ```
 */
export function useComponentFetcher(): UseComponentFetcherReturn {

  /**
   * Fetch a component definition by ID
   *
   * Implements intelligent caching:
   * 1. Check memory cache first (instant return)
   * 2. Check if fetch already in progress (prevent duplicates)
   * 3. Fetch from storage via Astro actions
   * 4. Cache result for future requests
   *
   * @param componentId - Component slug/ID to fetch
   * @returns Deep cloned component nodes (safe to mutate)
   */
  const fetchComponentDefinition = async (
    componentId: string,
  ): Promise<readonly BuilderNode[]> => {
    const parsedComponentId = ComponentIdSchema.safeParse(componentId);
    if (!parsedComponentId.success) {
      log("warn", "[useComponentFetcher] Invalid component ID", {
        issues: parsedComponentId.error.issues,
      });
      return Object.freeze([]);
    }

    const validatedComponentId = parsedComponentId.data;

    // STEP 1: Check in-memory cache

    if (componentCache.has(validatedComponentId)) {
      const cached = componentCache.get(validatedComponentId)!;
      if (!Array.isArray(cached.nodes) || cached.nodes.length === 0) {
        componentCache.delete(validatedComponentId);
        deleteCachedComponent(validatedComponentId);
      } else {
        return Object.freeze(cloneDeep(cached.nodes));
      }
    }

    // STEP 2: Check if fetch already in progress

    if (fetchInProgress.has(validatedComponentId)) {
      const result = await fetchInProgress.get(validatedComponentId);
      if (result) {
        return Object.freeze(cloneDeep(result.nodes));
      }
      return Object.freeze([]);
    }

    // STEP 3: Fetch from storage via Astro actions

    const fetchPromise = (async (): Promise<ComponentDefinition | null> => {
      try {
        const result = await actions.getItem({
          collection: "components",
          slug: validatedComponentId,
        });

        if (result.error) {
          log("error", "[useComponentFetcher] Failed to fetch component", {
            componentId: validatedComponentId,
            error: result.error.message ?? "Unknown error",
          });
          return null;
        }

        if (!result.data) {
          log("warn", "[useComponentFetcher] Component not found", {
            componentId: validatedComponentId,
          });
          return null;
        }

        const parsedComponent = unwrapComponentFetcherItemResult(
          result,
          `Failed to load component "${validatedComponentId}"`,
          {
            source: "useComponentFetcher.fetchComponentDefinition",
            componentId: validatedComponentId,
          },
        );
        if (!parsedComponent.success) {
          return null;
        }

        let resolvedNodes = parsedComponent.data.nodes;

        if (resolvedNodes.length === 0) {
          const composedNodes = unwrapComponentFetcherComposeResult(
            await actions.compose({
              pageSlug: validatedComponentId,
              itemType: "component",
            }),
            `Failed to compose component "${validatedComponentId}"`,
            {
              source: "useComponentFetcher.fetchComponentDefinition",
              componentId: validatedComponentId,
            },
          );

          resolvedNodes = composedNodes.success ? composedNodes.data : [];
        }

        // Build typed component definition
        const componentDef: ComponentDefinition = {
          id: validatedComponentId,
          nodes: Object.freeze(resolvedNodes),
          name: parsedComponent.data.name || validatedComponentId,
          slots: parsedComponent.data.slots
            ? Object.freeze(parsedComponent.data.slots)
            : undefined,
        };

        // STEP 4: Cache the result

        if (componentDef.nodes.length > 0) {
          componentCache.set(validatedComponentId, componentDef);
          setCachedComponent(validatedComponentId, componentDef);
        }

        return componentDef;
      } catch (error) {
        log("error", "[useComponentFetcher] Fetch error", {
          componentId: validatedComponentId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    })();

    // Track in-progress fetch
    fetchInProgress.set(validatedComponentId, fetchPromise);

    try {
      const result = await fetchPromise;
      return result
        ? Object.freeze(cloneDeep(result.nodes))
        : Object.freeze([]);
    } finally {
      // Always clean up in-progress tracker
      fetchInProgress.delete(validatedComponentId);
    }
  };

  /**
   * Extract component ref ID from a node, if any.
   */
  function getComponentRefId(node: BuilderNode): string | null {
    const id =
      node.reference?.masterId || node.reference?.id || node.props?.componentId;
    const isRef =
      String(node.type || "").toLowerCase() === "component" &&
      typeof id === "string" &&
      id.length > 0;
    return isRef ? id : null;
  }

  /**
   * Collect all unique component reference IDs from a node tree.
   */
  function collectComponentRefIds(
    nodes: readonly BuilderNode[],
    ids: Set<string> = new Set(),
  ): Set<string> {
    for (const node of nodes) {
      const refId = getComponentRefId(node);
      if (refId) {
        ids.add(refId);
      }
      if (node.children && node.children.length > 0) {
        collectComponentRefIds(node.children, ids);
      }
    }
    return ids;
  }

  /**
   * Prefetch all component definitions in parallel so subsequent
   * expand calls hit cache.
   */
  async function prefetchAllComponents(
    nodes: readonly BuilderNode[],
  ): Promise<void> {
    const ids = collectComponentRefIds(nodes);
    if (ids.size === 0) return;
    // Fire all fetches in parallel — deduplication is handled by fetchInProgress
    await Promise.all(
      [...ids].map((id) => fetchComponentDefinition(id).catch(() => [])),
    );
  }

  /**
   * Recursively expand all component references in a node tree.
   *
   * Before expanding, prefetches all unique component refs in parallel
   * so that the recursive walk hits the in-memory cache for every component.
   *
   * @param nodes - Node tree to expand
   * @returns Expanded node tree with all components inlined
   */
  const expandComponentReferencesClient = async (
    nodes: readonly BuilderNode[],
  ): Promise<readonly BuilderNode[]> => {
    // Prefetch all component definitions in parallel before tree walk
    await prefetchAllComponents(nodes);

    return expandNodes(nodes);
  };

  /**
   * Inner recursive expansion — all component defs are already cached
   * from the prefetch pass, so fetches resolve instantly.
   */
  async function expandNodes(
    nodes: readonly BuilderNode[],
  ): Promise<readonly BuilderNode[]> {
    const expanded: BuilderNode[] = [];

    for (const node of nodes) {
      const componentRefId = getComponentRefId(node);

      if (componentRefId) {
        try {
          const componentNodes = await fetchComponentDefinition(componentRefId);
          const wrapperId = node.id || generateWrapperId();

          // Recursively prefetch + expand nested component refs
          await prefetchAllComponents(componentNodes);
          const expandedComponentNodes = await expandNodes(componentNodes);
          const scopedExpandedComponentNodes = scopeExpandedDescendantIds(
            expandedComponentNodes,
            wrapperId,
          );

          expanded.push({
            id: wrapperId,
            type: "Container",
            classNames: node.classNames,
            customClasses: node.customClasses,
            styles: node.styles || {},
            props: {
              ...node.props,
              "data-component-ref": componentRefId,
            },
            children: scopedExpandedComponentNodes,
            slot: node.slot,
            hydration: node.hydration,
            interactions: node.interactions,
            variants: node.variants,
            a11y: node.a11y,
            metadata: node.metadata,
            reference: node.reference,
            componentRef: node.componentRef,
            dataSource: node.dataSource,
          });
        } catch (error) {
          log("error", "[useComponentFetcher] Error expanding component", {
            componentRefId,
            error: error instanceof Error ? error.message : String(error),
          });
          expanded.push({ ...node });
        }
      } else {
        if (node.children && node.children.length > 0) {
          const expandedChildren = await expandNodes(node.children);
          expanded.push({
            ...node,
            children: [...expandedChildren],
          });
        } else {
          expanded.push({ ...node });
        }
      }
    }

    return Object.freeze(expanded);
  }

  /**
   * Invalidate cache for a specific component
   *
   * Called when a component is edited to force re-fetch on next access.
   *
   * @param componentId - Component ID to invalidate
   */
  const invalidateComponent = (componentId: string): void => {
    componentCache.delete(componentId);
    deleteCachedComponent(componentId);
  };

  /**
   * Clear entire component cache
   *
   * Useful for full refresh scenarios (e.g., user logout, project switch).
   */
  const clearCache = (): void => {
    componentCache.clear();
    cachedComponentsRef.value = new Map();
    fetchInProgress.clear();
  };

  /**
   * Reactive map of all cached components
   */
  const cachedComponents = computed(() => {
    return cachedComponentsRef.value as ReadonlyMap<
      string,
      ComponentDefinition
    >;
  });

  return {
    fetchComponentDefinition,
    expandComponentReferencesClient,
    invalidateComponent,
    clearCache,
    cachedComponents,
  };
}
