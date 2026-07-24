/**
 * Detect whether published pages need the Aria Motion runtime script
 */

import type { BuilderNode } from "../../types/nodes";
import {
  DEFAULT_NODE_MOTION,
  NodeMotionSchema,
} from "../schemas/nodeMotion.schema";
import {
  DEFAULT_NODE_PARALLAX,
  NodeParallaxSchema,
} from "../schemas/nodeParallax.schema";

function nodeHasEnabledParallax(node: BuilderNode): boolean {
  const parallaxParsed = NodeParallaxSchema.safeParse(
    node.motion?.parallax ?? DEFAULT_NODE_PARALLAX,
  );
  return parallaxParsed.success && parallaxParsed.data.enabled;
}

function nodeRequiresMotionStyles(node: BuilderNode): boolean {
  if (nodeHasEnabledParallax(node)) {
    return true;
  }

  const parsed = NodeMotionSchema.safeParse(node.motion ?? DEFAULT_NODE_MOTION);
  return parsed.success && parsed.data.enabled;
}

function nodeRequiresMotionRuntime(node: BuilderNode): boolean {
  if (nodeHasEnabledParallax(node)) {
    return true;
  }

  const parsed = NodeMotionSchema.safeParse(node.motion ?? DEFAULT_NODE_MOTION);
  if (!parsed.success || !parsed.data.enabled) {
    return false;
  }

  const motion = parsed.data;

  if (["reveal", "now", "click", "scrub"].includes(motion.trigger)) {
    return true;
  }

  if (motion.stagger) {
    return true;
  }

  if (motion.text) {
    return true;
  }

  if (motion.magnetic) {
    return true;
  }

  return false;
}

export function requiresMotionStyles(nodes: readonly BuilderNode[]): boolean {
  const walk = (list: readonly BuilderNode[]): boolean => {
    for (const node of list) {
      if (nodeRequiresMotionStyles(node)) {
        return true;
      }
      if (node.children.length > 0 && walk(node.children)) {
        return true;
      }
    }
    return false;
  };

  return walk(nodes);
}

export function requiresMotionRuntime(nodes: readonly BuilderNode[]): boolean {
  const walk = (list: readonly BuilderNode[]): boolean => {
    for (const node of list) {
      if (nodeRequiresMotionRuntime(node)) {
        return true;
      }
      if (node.children.length > 0 && walk(node.children)) {
        return true;
      }
    }
    return false;
  };

  return walk(nodes);
}

export function nodeTreeRequiresMotionStyles(
  ...nodeSets: Array<readonly BuilderNode[] | null | undefined>
): boolean {
  for (const nodes of nodeSets) {
    if (nodes && requiresMotionStyles(nodes)) {
      return true;
    }
  }
  return false;
}

export function nodeTreeRequiresMotionRuntime(
  ...nodeSets: Array<readonly BuilderNode[] | null | undefined>
): boolean {
  for (const nodes of nodeSets) {
    if (nodes && requiresMotionRuntime(nodes)) {
      return true;
    }
  }
  return false;
}
