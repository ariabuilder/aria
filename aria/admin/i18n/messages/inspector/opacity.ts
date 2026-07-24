export const EN_INSPECTOR_OPACITY_MESSAGES = {
  "inspector.opacity.variable": "Variable",
  "inspector.opacity.incompatibleVariable":
    "This variable cannot be used for opacity.",
  "inspector.opacity.saveFailed": "Failed to save opacity.",
} as const;

export type InspectorOpacityMessageKey =
  keyof typeof EN_INSPECTOR_OPACITY_MESSAGES;
export type InspectorOpacityMessageCatalog = Record<
  InspectorOpacityMessageKey,
  string
>;

export const FR_INSPECTOR_OPACITY_MESSAGES = {
  "inspector.opacity.variable": "Variable",
  "inspector.opacity.incompatibleVariable":
    "Cette variable ne peut pas être utilisée pour l’opacité.",
  "inspector.opacity.saveFailed": "Impossible d’enregistrer l’opacité.",
} satisfies InspectorOpacityMessageCatalog;
