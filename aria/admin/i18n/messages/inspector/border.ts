export const EN_INSPECTOR_BORDER_MESSAGES = {
  "inspector.border.color": "Color",
  "inspector.border.size": "Size",
  "inspector.border.width": "Width",
  "inspector.border.type": "Type",
  "inspector.border.radius": "Radius",
  "inspector.border.topLeft": "Top left",
  "inspector.border.topRight": "Top right",
  "inspector.border.bottomRight": "Bottom right",
  "inspector.border.bottomLeft": "Bottom left",
  "inspector.border.style.none": "None",
  "inspector.border.style.hidden": "Hidden",
  "inspector.border.style.solid": "Solid",
  "inspector.border.style.dashed": "Dashed",
  "inspector.border.style.dotted": "Dotted",
  "inspector.border.style.double": "Double",
  "inspector.border.style.groove": "Groove",
  "inspector.border.style.ridge": "Ridge",
  "inspector.border.style.inset": "Inset",
  "inspector.border.style.outset": "Outset",
} as const;

export type InspectorBorderMessageKey =
  keyof typeof EN_INSPECTOR_BORDER_MESSAGES;
export type InspectorBorderMessageCatalog = Record<
  InspectorBorderMessageKey,
  string
>;

export const FR_INSPECTOR_BORDER_MESSAGES = {
  "inspector.border.color": "Couleur",
  "inspector.border.size": "Taille",
  "inspector.border.width": "Largeur",
  "inspector.border.type": "Type",
  "inspector.border.radius": "Rayon",
  "inspector.border.topLeft": "Haut gauche",
  "inspector.border.topRight": "Haut droit",
  "inspector.border.bottomRight": "Bas droit",
  "inspector.border.bottomLeft": "Bas gauche",
  "inspector.border.style.none": "Aucune",
  "inspector.border.style.hidden": "Masquée",
  "inspector.border.style.solid": "Pleine",
  "inspector.border.style.dashed": "Tirets",
  "inspector.border.style.dotted": "Pointillés",
  "inspector.border.style.double": "Double",
  "inspector.border.style.groove": "Rainure",
  "inspector.border.style.ridge": "Relief",
  "inspector.border.style.inset": "Enfoncée",
  "inspector.border.style.outset": "En relief",
} satisfies InspectorBorderMessageCatalog;
