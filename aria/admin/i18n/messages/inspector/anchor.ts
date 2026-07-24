export const EN_INSPECTOR_ANCHOR_MESSAGES = {
  "inspector.anchor.label": "Section ID",
  "inspector.anchor.search": "Search section IDs...",
  "inspector.anchor.empty": "No matching section IDs.",
  "inspector.anchor.none":
    "No section IDs on this page yet. Set one in Attributes, or enter a custom ID below.",
  "inspector.anchor.useCustom": "Use custom ID:",
  "inspector.anchor.select": "Select section…",
  "inspector.anchor.custom": "Custom section ID",
} as const;

export type InspectorAnchorMessageKey =
  keyof typeof EN_INSPECTOR_ANCHOR_MESSAGES;
export type InspectorAnchorMessageCatalog = Record<
  InspectorAnchorMessageKey,
  string
>;

export const FR_INSPECTOR_ANCHOR_MESSAGES = {
  "inspector.anchor.label": "ID de section",
  "inspector.anchor.search": "Rechercher des ID de section...",
  "inspector.anchor.empty": "Aucun ID de section correspondant.",
  "inspector.anchor.none":
    "Aucun ID de section n’est encore défini sur cette page. Définissez-en un dans Attributs, ou saisissez un ID personnalisé ci-dessous.",
  "inspector.anchor.useCustom": "Utiliser un ID personnalisé :",
  "inspector.anchor.select": "Sélectionner une section…",
  "inspector.anchor.custom": "ID de section personnalisé",
} satisfies InspectorAnchorMessageCatalog;
