import type { ComponentPublicInstance } from "vue";

export function resolveButtonEl(
  el: Element | ComponentPublicInstance | null,
): HTMLElement | null {
  if (el instanceof HTMLElement) return el;
  if (el && "$el" in el && el.$el instanceof HTMLElement) return el.$el;
  return null;
}
