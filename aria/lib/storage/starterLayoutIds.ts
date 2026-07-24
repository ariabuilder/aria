/**
 * IDs of the four built-in starter layouts, isolated in their own dependency-free
 * module (no `fs`) so both server code (`aria/lib/storage/starterLayouts. Ts`) and client-side admin.
 */

export const STARTER_LAYOUT_IDS = [
  "full-width",
  "left-sidebar",
  "right-sidebar",
  "two-sidebar",
] as const;

export type StarterLayoutId = (typeof STARTER_LAYOUT_IDS)[number];

export function isStarterLayoutId(id: string): id is StarterLayoutId {
  return (STARTER_LAYOUT_IDS as readonly string[]).includes(id);
}
