import type { RuntimeLocals } from "../cloudflare/env";
import {
  createStaticIconProvider,
  StaticIconProvider,
  type IconProvider,
} from "./staticIconProvider";
import {
  createIconRenderResources,
  type IconRenderResources,
} from "./iconRenderResources";
import { collectIconReferences } from "./iconReferences";

export { collectIconReferences } from "./iconReferences";

/** Resolve all icons once after components/layouts/CMS have been expanded. */
export async function resolveIconRenderResources(
  nodes: readonly import("../types/nodes").BuilderNode[],
  options: { locals?: RuntimeLocals; provider?: IconProvider } = {},
): Promise<IconRenderResources> {
  const provider = options.provider ?? createStaticIconProvider({ locals: options.locals });
  if (!provider) return createIconRenderResources(new Map());
  const ids = [...collectIconReferences(nodes)];
  if (ids.length === 0) return createIconRenderResources(new Map());
  const startedAt = Date.now();
  try {
    const result = await provider.resolve(ids);
    const providerMetrics =
      provider instanceof StaticIconProvider ? provider.getReadMetrics() : undefined;
    return createIconRenderResources(
      new Map(Object.entries(result.icons)),
      undefined,
      {
        durationMs: Date.now() - startedAt,
        requestedIconCount: ids.length,
        ...providerMetrics,
      },
    );
  } catch {
    // A partial asset rollout must not take down a public page. The renderer
    // preserves its existing safe icon-class fallback until the next request.
    return createIconRenderResources(new Map());
  }
}
