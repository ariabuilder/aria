export const EN_INSPECTOR_SPACING_MESSAGES = {
  "inspector.spacing.margin": "Margin",
  "inspector.spacing.padding": "Padding",
  "inspector.spacing.toggleSides": "Toggle individual sides",
  "inspector.spacing.axisY": "Y axis",
  "inspector.spacing.axisX": "X axis",
  "inspector.spacing.top": "Top",
  "inspector.spacing.bottom": "Bottom",
  "inspector.spacing.left": "Left",
  "inspector.spacing.right": "Right",
} as const;
export type InspectorSpacingMessageKey =
  keyof typeof EN_INSPECTOR_SPACING_MESSAGES;
export type InspectorSpacingMessageCatalog = Record<
  InspectorSpacingMessageKey,
  string
>;
export const FR_INSPECTOR_SPACING_MESSAGES = {
  "inspector.spacing.margin": "Marge",
  "inspector.spacing.padding": "Marge intérieure",
  "inspector.spacing.toggleSides": "Basculer les côtés individuels",
  "inspector.spacing.axisY": "Axe Y",
  "inspector.spacing.axisX": "Axe X",
  "inspector.spacing.top": "Haut",
  "inspector.spacing.bottom": "Bas",
  "inspector.spacing.left": "Gauche",
  "inspector.spacing.right": "Droite",
} satisfies InspectorSpacingMessageCatalog;
