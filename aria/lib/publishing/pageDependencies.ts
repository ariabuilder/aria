import { getComponentReferenceId } from "../blocks/nodeUtils";
import type { StorageAdapter } from "../storage/adapter";
import type {
  BuilderNode,
  PageDSL,
  PagePublicationDependencies,
} from "../types/nodes";

function collectComponentIds(
  nodes: readonly BuilderNode[],
  target: Set<string>,
): void {
  for (const node of nodes) {
    const componentId = getComponentReferenceId(node);
    if (node.type === "Component" && componentId) {
      target.add(componentId);
    }
    if (node.children?.length) {
      collectComponentIds(node.children, target);
    }
  }
}

/**
 * Captures the exact layout and recursively referenced component revisions
 * that a published page must render. Draft previews intentionally ignore these
 * pins and continue to resolve current definitions.
 */
export async function resolvePagePublicationDependencies(
  page: PageDSL,
  adapter: StorageAdapter,
): Promise<PagePublicationDependencies> {
  const pendingComponentIds = new Set<string>();
  const visitedComponentIds = new Set<string>();
  const componentVersions: Record<string, string> = {};
  let layoutDependency: PagePublicationDependencies["layout"];

  collectComponentIds(page.nodes ?? [], pendingComponentIds);

  if (page.layout) {
    const layout = await adapter.getLayoutDSL(page.layout);
    if (!layout?.version) {
      throw new Error(
        `Cannot publish because layout "${page.layout}" has no saved revision`,
      );
    }

    layoutDependency = {
      id: page.layout,
      version: layout.version,
    };
    collectComponentIds(layout.nodes ?? [], pendingComponentIds);
    for (const slot of layout.slots ?? []) {
      collectComponentIds(slot.defaultContent ?? [], pendingComponentIds);
    }

    const regions = layout.regions ?? layout.metadata?.regions;
    if (regions?.headerComponent) {
      pendingComponentIds.add(regions.headerComponent);
    }
    if (regions?.footerComponent) {
      pendingComponentIds.add(regions.footerComponent);
    }
  }

  while (pendingComponentIds.size > 0) {
    const componentId = pendingComponentIds.values().next().value as
      | string
      | undefined;
    if (!componentId) break;
    pendingComponentIds.delete(componentId);
    if (visitedComponentIds.has(componentId)) continue;
    visitedComponentIds.add(componentId);

    const component = await adapter.getComponentDSL(componentId);
    if (!component?.version) {
      throw new Error(
        `Cannot publish because component "${componentId}" has no saved revision`,
      );
    }

    componentVersions[componentId] = component.version;
    collectComponentIds(component.nodes ?? [], pendingComponentIds);
  }

  return {
    ...(layoutDependency ? { layout: layoutDependency } : {}),
    components: Object.fromEntries(
      Object.entries(componentVersions).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
}
