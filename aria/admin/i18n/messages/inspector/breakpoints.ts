export const EN_INSPECTOR_BREAKPOINTS_MESSAGES = {
  "inspector.breakpoints.overrides": "Breakpoint overrides",
  "inspector.breakpoints.override": "{{breakpoint}} override",
  "inspector.breakpoints.overridesOn": "Overrides on {{breakpoint}}",
  "inspector.breakpoints.reset": "Reset {{breakpoint}} override",
} as const;

export type InspectorBreakpointsMessageKey =
  keyof typeof EN_INSPECTOR_BREAKPOINTS_MESSAGES;
export type InspectorBreakpointsMessageCatalog = Record<
  InspectorBreakpointsMessageKey,
  string
>;

export const FR_INSPECTOR_BREAKPOINTS_MESSAGES = {
  "inspector.breakpoints.overrides": "Remplacements de point de rupture",
  "inspector.breakpoints.override": "Remplacement pour {{breakpoint}}",
  "inspector.breakpoints.overridesOn": "Remplacements sur {{breakpoint}}",
  "inspector.breakpoints.reset":
    "Réinitialiser le remplacement pour {{breakpoint}}",
} satisfies InspectorBreakpointsMessageCatalog;
