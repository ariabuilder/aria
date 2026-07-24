export const EN_INSPECTOR_CODE_MESSAGES = {
  "inspector.code.reset": "Reset code",
  "inspector.code.edit": "Edit",
  "inspector.code.render": "Render",
  "inspector.code.editor": "Code editor",
  "inspector.code.saveHint": "Cmd/Ctrl + Enter saves",
  "inspector.code.save": "Save code",
} as const;

export type InspectorCodeMessageKey = keyof typeof EN_INSPECTOR_CODE_MESSAGES;
export type InspectorCodeMessageCatalog = Record<
  InspectorCodeMessageKey,
  string
>;

export const FR_INSPECTOR_CODE_MESSAGES = {
  "inspector.code.reset": "Réinitialiser le code",
  "inspector.code.edit": "Modifier",
  "inspector.code.render": "Rendu",
  "inspector.code.editor": "Éditeur de code",
  "inspector.code.saveHint": "Cmd/Ctrl + Entrée pour enregistrer",
  "inspector.code.save": "Enregistrer le code",
} satisfies InspectorCodeMessageCatalog;
