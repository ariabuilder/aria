/**
 * Uses Vite's ? raw import to inline the CSS at build time.
 */

import ariaMotionCss from "../assets/aria-motion.css?raw";

export function readAriaMotionCss(): string {
  return ariaMotionCss;
}

/** No-op kept for API compatibility — the ?raw import is always fresh. */
export function clearAriaMotionCssCache(): void {
  // no-op
}
