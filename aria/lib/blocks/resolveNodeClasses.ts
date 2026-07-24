/**
 * Resolve all class names for a BuilderNode into a single
 * string. Reads from the canonical fields (classNames, customClasses) only.
 */

import type { BuilderNode } from "../types/nodes";
import { classNamesToString } from "../schemas/classEditor";
import type { BreakpointDefinition } from "../types/nodes";

/**
 * Resolve node classes without breakpoint resolution (base-only).
 * Used for Astro SSR, scan HTML, and other contexts where
 * responsive prefix expansion is handled elsewhere.
 */
export function resolveNodeClasses(node: BuilderNode): string {
  const parts: string[] = [];

  if (node.classNames) {
    const flat = classNamesToString(node.classNames);
    if (flat) parts.push(flat);
  }

  if (node.customClasses?.length) {
    parts.push(...node.customClasses);
  }

  return parts.join(" ");
}

/**
 * Resolve node classes with breakpoint resolution.
 * Used for HTML rendering where responsive prefixes need to be
 * expanded to actual class names.
 */
export function resolveNodeClassesWithBreakpoints(
  node: BuilderNode,
  breakpoints: BreakpointDefinition[],
): string {
  const parts: string[] = [];

  if (node.classNames) {
    const flat = classNamesToString(node.classNames, breakpoints);
    if (flat) parts.push(flat);
  }

  if (node.customClasses?.length) {
    parts.push(...node.customClasses);
  }

  return parts.join(" ");
}

/**
 * Resolve node classes as an array (for per-element rendering).
 * Useful when you need individual class names rather than a joined string.
 */
export function resolveNodeClassArray(node: BuilderNode): string[] {
  const classes: string[] = [];

  if (node.classNames) {
    for (const bpClasses of Object.values(node.classNames)) {
      if (Array.isArray(bpClasses)) {
        classes.push(...bpClasses);
      }
    }
  }

  if (node.customClasses?.length) {
    classes.push(...node.customClasses);
  }

  return classes;
}
