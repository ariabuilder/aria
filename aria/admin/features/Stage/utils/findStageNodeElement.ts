import type { BuilderNode } from "../../../../lib/types/nodes";

export interface FindStageNodeElementOptions {
  preferredElement?: Element | null;
}

function isComponentBoundaryNode(node: BuilderNode): boolean {
  return (
    String(node.type ?? "").toLowerCase() === "component" ||
    typeof node.props?.["data-component-ref"] === "string"
  );
}

function findComponentBoundaryId(
  nodes: readonly BuilderNode[],
  targetId: string,
  activeBoundaryId: string | null = null,
): string | null | undefined {
  for (const node of nodes) {
    const nextBoundaryId = isComponentBoundaryNode(node)
      ? node.id
      : activeBoundaryId;

    if (node.id === targetId) {
      return isComponentBoundaryNode(node) ? node.id : activeBoundaryId;
    }

    if (node.children && node.children.length > 0) {
      const match = findComponentBoundaryId(
        node.children,
        targetId,
        nextBoundaryId,
      );

      if (match !== undefined) {
        return match;
      }
    }
  }

  return undefined;
}

function escapeAttributeSelectorValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function queryStageNodeElements(
  doc: Document,
  attrName: "data-aria-id" | "data-aria-template-id",
  nodeId: string,
): HTMLElement[] {
  return Array.from(
    doc.querySelectorAll<HTMLElement>(
      `[${attrName}="${escapeAttributeSelectorValue(nodeId)}"]`,
    ),
  );
}

export function readStageEditableNodeId(
  element: Element | null | undefined,
): string | null {
  if (!element || typeof element.getAttribute !== "function") {
    return null;
  }

  return (
    element.getAttribute("data-aria-template-id") ??
    element.getAttribute("data-aria-id")
  );
}

function readStageRuntimeNodeId(
  element: Element | null | undefined,
): string | null {
  if (!element || typeof element.getAttribute !== "function") {
    return null;
  }

  return element.getAttribute("data-aria-id");
}

function stageElementMatchesNodeId(element: Element, nodeId: string): boolean {
  return (
    readStageRuntimeNodeId(element) === nodeId ||
    element.getAttribute("data-aria-template-id") === nodeId
  );
}

function closestStageElementMatchingNodeId(
  element: Element | null | undefined,
  nodeId: string,
): HTMLElement | null {
  let current: Element | null = element ?? null;

  while (current) {
    if (stageElementMatchesNodeId(current, nodeId)) {
      return current as HTMLElement;
    }

    current = current.parentElement;
  }

  return null;
}

export function elementMatchesStageNodeId(
  element: Element | null | undefined,
  nodeId: string,
): boolean {
  if (!nodeId) {
    return false;
  }

  return closestStageElementMatchingNodeId(element, nodeId) !== null;
}

function pickStageNodeElementMatch(
  matches: HTMLElement[],
  blocks: readonly BuilderNode[],
  nodeId: string,
): HTMLElement | null {
  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0];
  }

  const boundaryId = findComponentBoundaryId(blocks, nodeId);

  if (boundaryId !== undefined) {
    if (boundaryId === null) {
      const pageMatch = matches.find(
        (entry) => !entry.closest("[data-component-ref]"),
      );

      if (pageMatch) {
        return pageMatch;
      }
    } else {
      const scopedMatch = matches.find((entry) => {
        const wrapper = entry.closest("[data-component-ref]");
        return readStageEditableNodeId(wrapper) === boundaryId;
      });

      if (scopedMatch) {
        return scopedMatch;
      }
    }
  }

  return matches[0];
}

export function findStageNodeElement(
  doc: Document,
  blocks: readonly BuilderNode[],
  nodeId: string,
  options: FindStageNodeElementOptions = {},
): HTMLElement | null {
  const preferredMatch = closestStageElementMatchingNodeId(
    options.preferredElement,
    nodeId,
  );
  if (preferredMatch?.isConnected && preferredMatch.ownerDocument === doc) {
    return preferredMatch;
  }

  const exactMatches = queryStageNodeElements(doc, "data-aria-id", nodeId);
  const exactMatch = pickStageNodeElementMatch(exactMatches, blocks, nodeId);
  if (exactMatch) {
    return exactMatch;
  }

  const templateMatches = queryStageNodeElements(
    doc,
    "data-aria-template-id",
    nodeId,
  );

  return pickStageNodeElementMatch(templateMatches, blocks, nodeId);
}
