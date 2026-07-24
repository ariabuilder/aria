export const EN_INSPECTOR_SIZE_MESSAGES = {
  "inspector.size.width": "Width",
  "inspector.size.height": "Height",
  "inspector.size.constraints": "Constraints",
  "inspector.size.minWidth": "Min width",
  "inspector.size.minHeight": "Min height",
  "inspector.size.maxWidth": "Max width",
  "inspector.size.maxHeight": "Max height",
  "inspector.size.mode.hug": "Hug",
  "inspector.size.mode.fill": "Fill",
  "inspector.size.mode.exact": "Exact",
} as const;
export type InspectorSizeMessageKey = keyof typeof EN_INSPECTOR_SIZE_MESSAGES;
export type InspectorSizeMessageCatalog = Record<
  InspectorSizeMessageKey,
  string
>;
export const FR_INSPECTOR_SIZE_MESSAGES = {
  "inspector.size.width": "Largeur",
  "inspector.size.height": "Hauteur",
  "inspector.size.constraints": "Contraintes",
  "inspector.size.minWidth": "Largeur minimale",
  "inspector.size.minHeight": "Hauteur minimale",
  "inspector.size.maxWidth": "Largeur maximale",
  "inspector.size.maxHeight": "Hauteur maximale",
  "inspector.size.mode.hug": "Ajuster",
  "inspector.size.mode.fill": "Remplir",
  "inspector.size.mode.exact": "Exacte",
} satisfies InspectorSizeMessageCatalog;
