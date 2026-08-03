import { nodesRequireIconifyRuntime } from "../../icons/customElement";
import { nodeTreeRequiresMotionRuntime } from "../../motion/runtime/requiresMotionRuntime";
import { nodeTreeRequiresNavRuntime } from "../../nav/requiresNavRuntime";
import type { BuilderNode } from "../../types/nodes";
import type { RenderRuntimeManifestV1 } from "./contract";

export function collectRuntimeManifest(
  nodes: readonly BuilderNode[],
): RenderRuntimeManifestV1 {
  const roots = [...nodes];

  return {
    motion: nodeTreeRequiresMotionRuntime(roots),
    navigation: nodeTreeRequiresNavRuntime(roots),
    legacyIconify: nodesRequireIconifyRuntime(roots),
  };
}
