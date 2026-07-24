import type { BuilderNode } from "../../lib/types/nodes";
import { collectIconReferences } from "../../lib/icons/iconReferences";
import {
  createIconRenderResources,
  type IconRenderResources,
} from "../../lib/icons/iconRenderResources";
import { resolveIconSvgData } from "./iconDataClient";

/** Resolve canonical icons for browser-rendered iframe previews. */
export async function resolveBrowserIconRenderResources(
  nodes: readonly BuilderNode[],
): Promise<IconRenderResources> {
  const ids = [...collectIconReferences(nodes)];
  if (ids.length === 0) return createIconRenderResources(new Map());

  const data = await resolveIconSvgData(ids);
  return createIconRenderResources(
    new Map(),
    new Map(
      Object.entries(data)
        .filter(([, value]) => Boolean(value.svg))
        .map(([id, value]) => [id, value.svg]),
    ),
  );
}
