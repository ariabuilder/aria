import type { BuilderNode } from "../types/nodes";

/** Resolves every supported persisted component-reference representation. */
export function getComponentReferenceId(node: BuilderNode): string | null {
  const referenceMasterId = node.reference?.masterId;
  if (typeof referenceMasterId === "string" && referenceMasterId.length > 0) {
    return referenceMasterId;
  }

  const referenceId = node.reference?.id;
  if (typeof referenceId === "string" && referenceId.length > 0) {
    return referenceId;
  }

  const propComponentId = node.props?.componentId;
  if (typeof propComponentId === "string" && propComponentId.length > 0) {
    return propComponentId;
  }

  return null;
}
