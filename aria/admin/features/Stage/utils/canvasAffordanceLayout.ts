import type { CanvasAffordanceDescriptor } from "../../../../lib/rendering/canonical";

export interface CanvasAffordanceVisualLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  collapsed: boolean;
}

const COLLAPSED_RAIL_HIT_HEIGHT = 24;
const COLLAPSED_RAIL_DEPTH_INDENT = 12;
const MINIMUM_AFFORDANCE_SIZE = 24;

/**
 * Builds editor-only hit geometry without changing authored element geometry.
 * A collapsed node keeps its true zero-height anchor at the rail's center.
 */
export function resolveCanvasAffordanceVisualLayout(
  descriptor: CanvasAffordanceDescriptor,
): CanvasAffordanceVisualLayout {
  const { left, top, width, height } = descriptor.position;

  if (descriptor.presentation === "box") {
    return {
      left,
      top,
      width: Math.max(width, MINIMUM_AFFORDANCE_SIZE),
      height: Math.max(height, MINIMUM_AFFORDANCE_SIZE),
      collapsed: false,
    };
  }

  const availableIndent = Math.max(0, width - MINIMUM_AFFORDANCE_SIZE);
  const depthIndent = Math.min(
    descriptor.depth * COLLAPSED_RAIL_DEPTH_INDENT,
    availableIndent,
  );

  return {
    left: left + depthIndent,
    top: top - COLLAPSED_RAIL_HIT_HEIGHT / 2,
    width: Math.max(width - depthIndent, MINIMUM_AFFORDANCE_SIZE),
    height: COLLAPSED_RAIL_HIT_HEIGHT,
    collapsed: true,
  };
}
