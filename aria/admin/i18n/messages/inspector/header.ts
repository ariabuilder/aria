export const EN_INSPECTOR_HEADER_MESSAGES = {
  "inspector.header.noSelection": "No selection",
  "inspector.header.pseudoDisabled":
    "Select a custom class to enable pseudo states",
} as const;

export type InspectorHeaderMessageKey =
  keyof typeof EN_INSPECTOR_HEADER_MESSAGES;
export type InspectorHeaderMessageCatalog = Record<
  InspectorHeaderMessageKey,
  string
>;

export const FR_INSPECTOR_HEADER_MESSAGES = {
  "inspector.header.noSelection": "Aucune sélection",
  "inspector.header.pseudoDisabled":
    "Sélectionnez une classe personnalisée pour activer les pseudo-états",
} satisfies InspectorHeaderMessageCatalog;
