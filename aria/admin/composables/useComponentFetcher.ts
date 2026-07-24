/**
 * UseComponentFetcher Fetches and caches component definitions on-demand for canvas rendering. Ensures
 * that when the master component changes, all pages using it.
 */

import { computed, shallowRef } from "vue";
import { actions } from "astro:actions";
import type { BuilderNode, ComponentDSL } from "../../lib/types/nodes";
import { validateComponentDSL } from "../../lib/schemas/nodes";

interface ComponentDef {
  id: string;
  nodes: BuilderNode[];
  name: string;
  slots?: ComponentDSL["slots"];
}

// Component cache: masterId -> component definition
const componentCache = new Map<string, ComponentDef>();

// Track which components are currently being fetched to avoid duplicate requests
const fetchInProgress = new Map<string, Promise<ComponentDef | null>>();

export function useComponentFetcher() {
  const cachedComponents = shallowRef(new Map<string, ComponentDef>());

  /**
   * Fetch a component by ID and expand component references within it recursively
   */
  async function fetchComponentDefinition(
    componentId: string,
  ): Promise<BuilderNode[]> {
    console.log("[useComponentFetcher] Fetching component:", componentId);

    // Check in-memory cache first
    if (componentCache.has(componentId)) {
      console.log("[useComponentFetcher] Cache HIT for:", componentId);
      const cached = componentCache.get(componentId);
      if (cached) return JSON.parse(JSON.stringify(cached.nodes)); // Deep clone
    }

    if (fetchInProgress.has(componentId)) {
      console.log(
        "[useComponentFetcher] Fetch already in progress for:",
        componentId,
      );
      const result = await fetchInProgress.get(componentId);
      if (result) return JSON.parse(JSON.stringify(result.nodes));
      return [];
    }

    // Fetch from server
    const fetchPromise = actions
      .getItem({
        collection: "components",
        slug: componentId,
      })
      .then((result: { data?: unknown }) => {
        if (result.data) {
          const parsedComponent = validateComponentDSL(result.data);
          if (!parsedComponent.success) {
            return null;
          }

          const componentData = parsedComponent.data;

          const componentDef: ComponentDef = {
            id: componentId,
            nodes: componentData.nodes || [],
            name: componentData.name || componentId,
            slots: componentData.slots,
          };

          componentCache.set(componentId, componentDef);
          cachedComponents.value.set(componentId, componentDef);
          console.log(
            "[useComponentFetcher] Cached component:",
            componentId,
            componentDef.nodes.length,
            "nodes",
          );

          return componentDef;
        }
        return null;
      })
      .catch((error) => {
        console.error(
          "[useComponentFetcher] Failed to fetch component:",
          componentId,
          error,
        );
        return null;
      })
      .finally(() => {
        // Remove from in-progress
        fetchInProgress.delete(componentId);
      });

    fetchInProgress.set(componentId, fetchPromise);
    const result = await fetchPromise;
    return result ? JSON.parse(JSON.stringify(result.nodes)) : [];
  }

  /**
   * Recursively expand all component references in a block tree
   * Handles nested component references
   */
  async function expandComponentReferencesClient(
    nodes: BuilderNode[],
  ): Promise<BuilderNode[]> {
    const expanded: BuilderNode[] = [];

    for (const node of nodes) {
      // Check if this is a component reference
      const rawComponentRefId =
        node.reference?.masterId ||
        node.reference?.id ||
        node.props?.componentId;
      const componentRefId =
        typeof rawComponentRefId === "string" ? rawComponentRefId : null;

      if (node.type === "Component" && componentRefId) {
        try {
          // Fetch the component definition
          const componentNodes = await fetchComponentDefinition(componentRefId);

          // Recursively expand any nested components within this component
          const expandedComponentNodes =
            await expandComponentReferencesClient(componentNodes);

          // Wrap in Container with data-component-ref for selection
          expanded.push({
            id: node.id,
            type: "Container",
            classNames: node.classNames,
            customClasses: node.customClasses,
            styles: node.styles || {},
            props: {
              ...node.props,
              "data-component-ref": componentRefId,
            },
            children: expandedComponentNodes,
            slot: node.slot,
            hydration: node.hydration,
            interactions: node.interactions,
            variants: node.variants,
            a11y: node.a11y,
            metadata: node.metadata,
          });
        } catch (error) {
          console.error(
            "[useComponentFetcher] Error expanding component:",
            componentRefId,
            error,
          );
          expanded.push(node);
        }
      } else {
        // Not a component reference, recursively expand children
        if (node.children && node.children.length > 0) {
          const expandedChildren = await expandComponentReferencesClient(
            node.children,
          );
          expanded.push({
            ...node,
            children: expandedChildren,
          });
        } else {
          expanded.push(node);
        }
      }
    }

    return expanded;
  }

  /**
   * Invalidate cache for a component (called when component is saved)
   */
  function invalidateComponent(componentId: string) {
    console.log("[useComponentFetcher] Invalidating cache for:", componentId);
    componentCache.delete(componentId);
    cachedComponents.value.delete(componentId);
  }

  /**
   * Clear entire cache
   */
  function clearCache() {
    console.log("[useComponentFetcher] Clearing all cached components");
    componentCache.clear();
    cachedComponents.value.clear();
  }

  return {
    fetchComponentDefinition,
    expandComponentReferencesClient,
    invalidateComponent,
    clearCache,
    cachedComponents: computed(() => cachedComponents.value),
  };
}
