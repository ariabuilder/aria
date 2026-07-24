export const EN_INSPECTOR_POSITION_MESSAGES = {
  "inspector.position.mode": "Mode",
  "inspector.position.top": "Top",
  "inspector.position.right": "Right",
  "inspector.position.bottom": "Bottom",
  "inspector.position.left": "Left",
  "inspector.position.zIndex": "Z-index",
  "inspector.position.auto": "Auto",
  "inspector.position.mode.static": "Static",
  "inspector.position.mode.relative": "Relative",
  "inspector.position.mode.absolute": "Absolute",
  "inspector.position.mode.fixed": "Fixed",
  "inspector.position.mode.sticky": "Sticky",
} as const;

export type InspectorPositionMessageKey =
  keyof typeof EN_INSPECTOR_POSITION_MESSAGES;
export type InspectorPositionMessageCatalog = Record<
  InspectorPositionMessageKey,
  string
>;

export const FR_INSPECTOR_POSITION_MESSAGES = {
  "inspector.position.mode": "Mode",
  "inspector.position.top": "Haut",
  "inspector.position.right": "Droite",
  "inspector.position.bottom": "Bas",
  "inspector.position.left": "Gauche",
  "inspector.position.zIndex": "Indice Z",
  "inspector.position.auto": "Auto",
  "inspector.position.mode.static": "Statique",
  "inspector.position.mode.relative": "Relative",
  "inspector.position.mode.absolute": "Absolue",
  "inspector.position.mode.fixed": "Fixe",
  "inspector.position.mode.sticky": "Collante",
} satisfies InspectorPositionMessageCatalog;
