import { STAGE_CONTENT_ROOT_ATTR, STAGE_OVERLAY_ROOT_ATTR } from "../composables/useIframeSetup";
import type { FrameViewportPoint } from "./geometry";
import { readStageEditableNodeId } from "../utils/findStageNodeElement";

export const INTERACTION_OVERLAY_ATTR = "data-aria-interaction-overlay";

export interface NodeCandidate {
  element: HTMLElement;
  nodeId: string;
  nodeType: string;
}

export interface HitTestingOptions {
  stopAt?: Element | null;
  lockComponentInstances?: boolean;
}

function isElementNode(target: EventTarget | null): target is Element {
  return (
    !!target &&
    typeof target === "object" &&
    "nodeType" in target &&
    (target as Node).nodeType === Node.ELEMENT_NODE
  );
}

export function resolveEventTargetElement(
  target: EventTarget | null,
): Element | null {
  if (isElementNode(target)) {
    return target;
  }

  if (target && typeof target === "object") {
    const parentElement = (target as { parentElement?: Element | null })
      .parentElement;
    if (parentElement) {
      return parentElement;
    }

    const parentNode = (target as { parentNode?: Node | null }).parentNode;
    if (parentNode?.nodeType === Node.ELEMENT_NODE) {
      return parentNode as Element;
    }
  }

  return null;
}

export function isInteractionOverlayElement(element: Element | null): boolean {
  if (!element) {
    return false;
  }

  return Boolean(
    element.closest(`[${STAGE_OVERLAY_ROOT_ATTR}]`) ||
      element.closest(`[${INTERACTION_OVERLAY_ATTR}]`),
  );
}

function readCandidate(element: Element): NodeCandidate | null {
  if (typeof element.getAttribute !== "function") {
    return null;
  }

  const nodeId = readStageEditableNodeId(element);
  if (!nodeId) {
    return null;
  }

  return {
    element: element as HTMLElement,
    nodeId,
    nodeType: element.getAttribute("data-aria-type") || element.tagName,
  };
}

function resolveComponentBoundary(
  candidate: NodeCandidate,
  stopAt: Element,
): NodeCandidate {
  const boundary = candidate.element.closest<HTMLElement>("[data-component-ref]");
  const boundaryNodeId = readStageEditableNodeId(boundary);
  if (!boundary || boundary === stopAt || !boundaryNodeId) {
    return candidate;
  }

  return {
    element: boundary,
    nodeId: boundaryNodeId,
    nodeType: boundary.getAttribute("data-aria-type") || "Component",
  };
}

function pushUnique(candidates: NodeCandidate[], candidate: NodeCandidate): void {
  if (candidates.some((entry) => entry.nodeId === candidate.nodeId)) {
    return;
  }
  candidates.push(candidate);
}

function elementDepth(element: Element): number {
  let depth = 0;
  let current = element.parentElement;
  while (current) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

function elementArea(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const area = rect.width * rect.height;
  return Number.isFinite(area) && area > 0 ? area : Number.MAX_SAFE_INTEGER;
}

function sortPointCandidates(candidates: NodeCandidate[]): NodeCandidate[] {
  return [...candidates].sort((a, b) => {
    const areaDelta = elementArea(a.element) - elementArea(b.element);
    if (Math.abs(areaDelta) > 0.5) {
      return areaDelta;
    }
    return elementDepth(b.element) - elementDepth(a.element);
  });
}

export function getStageContentRoot(doc: Document): HTMLElement {
  return (
    doc.querySelector<HTMLElement>(`[${STAGE_CONTENT_ROOT_ATTR}]`) ?? doc.body
  );
}

export function collectNodeCandidatesFromElement(
  target: Element | null,
  options: HitTestingOptions = {},
): NodeCandidate[] {
  if (!target || isInteractionOverlayElement(target)) {
    return [];
  }

  const doc = target.ownerDocument;
  const stopAt = options.stopAt ?? getStageContentRoot(doc);
  const candidates: NodeCandidate[] = [];
  let current: Element | null = target;

  while (current && current !== doc.documentElement) {
    if (current === stopAt.parentElement) {
      break;
    }

    const candidate = readCandidate(current);
    if (candidate) {
      pushUnique(
        candidates,
        options.lockComponentInstances
          ? resolveComponentBoundary(candidate, stopAt)
          : candidate,
      );
    }

    if (current === stopAt) {
      break;
    }

    current = current.parentElement;
  }

  return candidates;
}

export function collectNodeCandidatesAtPoint(
  doc: Document,
  point: FrameViewportPoint,
  options: HitTestingOptions = {},
): NodeCandidate[] {
  const candidates: NodeCandidate[] = [];
  if (typeof doc.elementsFromPoint !== "function") {
    return candidates;
  }

  for (const element of doc.elementsFromPoint(point.x, point.y)) {
    if (isInteractionOverlayElement(element)) {
      continue;
    }

    for (const candidate of collectNodeCandidatesFromElement(element, options)) {
      pushUnique(candidates, candidate);
    }
  }

  return sortPointCandidates(candidates);
}

export function resolveNodeAtPoint(
  doc: Document,
  point: FrameViewportPoint,
  options: HitTestingOptions = {},
): NodeCandidate | null {
  return collectNodeCandidatesAtPoint(doc, point, options)[0] ?? null;
}

export function resolveNodeFromEventTarget(
  target: EventTarget | null,
  options: HitTestingOptions = {},
): NodeCandidate | null {
  return collectNodeCandidatesFromElement(
    resolveEventTargetElement(target),
    options,
  )[0] ?? null;
}
