export const EN_INSPECTOR_CORNER_MESSAGES = {
  "inspector.corner.shape": "Shape",
  "inspector.corner.radius": "Radius",
  "inspector.corner.topLeft": "Top left",
  "inspector.corner.topRight": "Top right",
  "inspector.corner.bottomRight": "Bottom right",
  "inspector.corner.bottomLeft": "Bottom left",
  "inspector.corner.shape.round": "Round",
  "inspector.corner.shape.squircle": "Squircle",
  "inspector.corner.shape.bevel": "Bevel",
  "inspector.corner.shape.scoop": "Scoop",
  "inspector.corner.shape.notch": "Notch",
  "inspector.corner.shape.square": "Square",
  "inspector.corner.shape.softSuperellipse": "Soft superellipse",
  "inspector.corner.shape.pinchedSuperellipse": "Pinched superellipse",
  "inspector.corner.shape.softScoop": "Soft scoop",
  "inspector.corner.shape.deepScoop": "Deep scoop",
  "inspector.corner.superellipse": "Superellipse ({{value}})",
} as const;

export type InspectorCornerMessageKey =
  keyof typeof EN_INSPECTOR_CORNER_MESSAGES;
export type InspectorCornerMessageCatalog = Record<
  InspectorCornerMessageKey,
  string
>;

export const FR_INSPECTOR_CORNER_MESSAGES = {
  "inspector.corner.shape": "Forme",
  "inspector.corner.radius": "Rayon",
  "inspector.corner.topLeft": "Haut gauche",
  "inspector.corner.topRight": "Haut droit",
  "inspector.corner.bottomRight": "Bas droit",
  "inspector.corner.bottomLeft": "Bas gauche",
  "inspector.corner.shape.round": "Arrondie",
  "inspector.corner.shape.squircle": "Carré arrondi",
  "inspector.corner.shape.bevel": "Biseautée",
  "inspector.corner.shape.scoop": "Concave",
  "inspector.corner.shape.notch": "Encochée",
  "inspector.corner.shape.square": "Carrée",
  "inspector.corner.shape.softSuperellipse": "Superellipse douce",
  "inspector.corner.shape.pinchedSuperellipse": "Superellipse pincée",
  "inspector.corner.shape.softScoop": "Concavité douce",
  "inspector.corner.shape.deepScoop": "Concavité profonde",
  "inspector.corner.superellipse": "Superellipse ({{value}})",
} satisfies InspectorCornerMessageCatalog;
