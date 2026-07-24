export const EN_INSPECTOR_EMPTY_MESSAGES = {
  "inspector.empty.title": "No selection",
  "inspector.empty.description":
    "Click an element in the canvas to view and edit its properties.",
  "inspector.empty.selectElement": "Select element",
  "inspector.empty.deselect": "Deselect",
  "inspector.empty.navigateLayers": "Navigate layers",
} as const;

export type InspectorEmptyMessageKey = keyof typeof EN_INSPECTOR_EMPTY_MESSAGES;
export type InspectorEmptyMessageCatalog = Record<
  InspectorEmptyMessageKey,
  string
>;

export const FR_INSPECTOR_EMPTY_MESSAGES = {
  "inspector.empty.title": "Aucune sélection",
  "inspector.empty.description":
    "Cliquez sur un élément du canevas pour afficher et modifier ses propriétés.",
  "inspector.empty.selectElement": "Sélectionner l’élément",
  "inspector.empty.deselect": "Désélectionner",
  "inspector.empty.navigateLayers": "Parcourir les calques",
} satisfies InspectorEmptyMessageCatalog;
