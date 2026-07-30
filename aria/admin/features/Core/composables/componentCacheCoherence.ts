import { log } from "@/lib/utils/logger";
import type { ComponentDSL } from "@/lib/types/nodes";
import {
  commitComponentDefinition,
  invalidateComponentDefinition,
} from "@/features/Blocks/composables/useComponentFetcher";
import {
  invalidateComponentResource,
  updateCachedComponentResource,
} from "@/features/Studio/components/composables/useComponentResourceBank";

/**
 * Keep the render definition and Studio resource caches aligned with the exact
 * component revision accepted by the server.
 */
export function commitSavedComponentToClientCaches(
  component: ComponentDSL,
): void {
  commitComponentDefinition({
    id: component.id,
    name: component.name,
    nodes: component.nodes,
    slots: component.slots,
  });

  try {
    updateCachedComponentResource(component);
  } catch (error) {
    // Studio metadata caching is an optimization. A valid server save and the
    // canvas definition commit must remain successful if that cache rejects.
    log("warn", "[componentCacheCoherence] Studio cache update failed", {
      componentId: component.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Evict both client representations when the changed revision is not local.
 */
export function invalidateComponentClientCaches(
  componentId: string,
  reason = "mutation",
): void {
  invalidateComponentDefinition(componentId);
  invalidateComponentResource(componentId, reason);
}
