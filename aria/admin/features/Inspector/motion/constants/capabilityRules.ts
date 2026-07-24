/**
 * Aria Motion section visibility by node type
 */

import type { MotionSectionId } from "./sections";

const TEXT_NODE_TYPES = new Set([
  "heading",
  "text",
  "paragraph",
  "span",
  "label",
  "link",
]);

const CONTAINER_NODE_TYPES = new Set([
  "container",
  "section",
  "list",
  "icon-list",
  "feature-grid",
  "hero",
  "pricing-card",
]);

export function getVisibleMotionSections(
  nodeType: string,
  enabled: boolean,
): MotionSectionId[] {
  const sections: MotionSectionId[] = ["enable"];

  if (!enabled) {
    return sections;
  }

  sections.push("parallax");

  sections.push("presets", "effects", "trigger", "timing", "hover", "loop");

  if (TEXT_NODE_TYPES.has(nodeType.toLowerCase())) {
    sections.push("text");
  }

  if (CONTAINER_NODE_TYPES.has(nodeType.toLowerCase())) {
    sections.push("stagger");
  }

  return sections;
}

export function nodeSupportsMotion(nodeType: string): boolean {
  const normalized = nodeType.toLowerCase();
  return !normalized.startsWith("slot") && normalized !== "code";
}
