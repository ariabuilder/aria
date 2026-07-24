import {
  collectNodeCandidatesAtPoint,
  collectNodeCandidatesFromElement,
  resolveEventTargetElement,
  type HitTestingOptions,
  type NodeCandidate,
} from "./hitTesting";
import type { FrameViewportPoint } from "./geometry";

export interface SelectionResolverOptions extends HitTestingOptions {
  isTextContent?: (element: Element) => boolean;
  semanticPriority?: Record<string, number>;
}

export interface ResolvedSelectionTarget extends NodeCandidate {
  candidates: NodeCandidate[];
}

function chooseSemanticCandidate(
  candidates: readonly NodeCandidate[],
  semanticPriority: Record<string, number>,
): NodeCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((best, candidate) => {
    const bestPriority = semanticPriority[best.nodeType] ?? 1;
    const nextPriority = semanticPriority[candidate.nodeType] ?? 1;
    return nextPriority > bestPriority ? candidate : best;
  }, candidates[0]);
}

function resolveFromCandidates(
  candidates: NodeCandidate[],
  target: Element | null,
  options: SelectionResolverOptions,
): ResolvedSelectionTarget | null {
  if (candidates.length === 0) {
    return null;
  }

  const isTextHit =
    target && options.isTextContent ? options.isTextContent(target) : false;
  const selected =
    isTextHit && options.semanticPriority
      ? chooseSemanticCandidate(candidates, options.semanticPriority)
      : candidates[0];

  return selected ? { ...selected, candidates } : null;
}

export function resolveSelectionFromEventTarget(
  target: EventTarget | null,
  options: SelectionResolverOptions = {},
): ResolvedSelectionTarget | null {
  const element = resolveEventTargetElement(target);
  return resolveFromCandidates(
    collectNodeCandidatesFromElement(element, {
      ...options,
      lockComponentInstances: true,
    }),
    element,
    options,
  );
}

export function resolveSelectionAtPoint(
  doc: Document,
  point: FrameViewportPoint,
  options: SelectionResolverOptions = {},
): ResolvedSelectionTarget | null {
  const element =
    typeof doc.elementFromPoint === "function"
      ? doc.elementFromPoint(point.x, point.y)
      : null;
  return resolveFromCandidates(
    collectNodeCandidatesAtPoint(doc, point, {
      ...options,
      lockComponentInstances: true,
    }),
    element,
    options,
  );
}

export function resolveHoverFromEventTarget(
  target: EventTarget | null,
  options: HitTestingOptions = {},
): NodeCandidate | null {
  const element = resolveEventTargetElement(target);
  return (
    collectNodeCandidatesFromElement(element, {
      ...options,
      lockComponentInstances: true,
    })[0] ?? null
  );
}

export function resolveHoverAtPoint(
  doc: Document,
  point: FrameViewportPoint,
  options: HitTestingOptions = {},
): NodeCandidate | null {
  return (
    collectNodeCandidatesAtPoint(doc, point, {
      ...options,
      lockComponentInstances: true,
    })[0] ?? null
  );
}
