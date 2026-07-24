export const EN_INSPECTOR_CONTENT_MESSAGES = {
  "inspector.content.reset": "Reset content",
  "inspector.content.source": "Content source",
  "inspector.content.enter": "Enter text...",
} as const;

export type InspectorContentMessageKey =
  keyof typeof EN_INSPECTOR_CONTENT_MESSAGES;
export type InspectorContentMessageCatalog = Record<
  InspectorContentMessageKey,
  string
>;

export const FR_INSPECTOR_CONTENT_MESSAGES = {
  "inspector.content.reset": "Réinitialiser le contenu",
  "inspector.content.source": "Source du contenu",
  "inspector.content.enter": "Saisir du texte...",
} satisfies InspectorContentMessageCatalog;
