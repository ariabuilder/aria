/**
 * Render Aria Motion runtime script tag for published HTML
 */

import { readAriaMotionCss } from "../css/readAriaMotionCss";

export const ARIA_MOTION_RUNTIME_URL = "/vendor/aria-motion/aria-motion.js";

export function renderMotionStyleTag(): string {
  return `<style data-aria-motion="true">${readAriaMotionCss()}</style>`;
}

export function renderMotionScriptTag(): string {
  return `<script src="${ARIA_MOTION_RUNTIME_URL}" defer></script>`;
}
