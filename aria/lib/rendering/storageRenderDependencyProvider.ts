import type { StorageAdapter } from "../storage/adapter";
import type { LayoutDSL } from "../types/nodes";
import type { RenderDependencyProvider } from "./canonical";

export interface StorageRenderDependencyProviderOptions {
  layoutOverride?: LayoutDSL | null;
}

/**
 * Adapts the shared SQLite/D1 storage contract to the portable render resolver.
 * Exact revision selection remains an adapter responsibility in both runtimes.
 */
export function createStorageRenderDependencyProvider(
  adapter: StorageAdapter,
  options: StorageRenderDependencyProviderOptions = {},
): RenderDependencyProvider {
  return {
    getLayout: async (ref) =>
      options.layoutOverride?.id === ref.id
        ? options.layoutOverride
        : adapter.getLayoutDSL(ref.id, ref.version),
    getComponent: async (ref) => adapter.getComponentDSL(ref.id, ref.version),
  };
}
