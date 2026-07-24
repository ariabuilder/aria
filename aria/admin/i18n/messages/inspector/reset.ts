export const EN_INSPECTOR_RESET_MESSAGES = {
  "inspector.reset": "Reset {{property}}",
} as const;

export type InspectorResetMessageKey = keyof typeof EN_INSPECTOR_RESET_MESSAGES;
export type InspectorResetMessageCatalog = Record<
  InspectorResetMessageKey,
  string
>;

export const FR_INSPECTOR_RESET_MESSAGES = {
  "inspector.reset": "Réinitialiser {{property}}",
} satisfies InspectorResetMessageCatalog;
