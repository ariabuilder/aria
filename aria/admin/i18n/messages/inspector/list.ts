export const EN_INSPECTOR_LIST_MESSAGES = {
  "inspector.list.reset": "Reset list",
  "inspector.list.addItem": "Add list item",
  "inspector.list.type": "Type",
  "inspector.list.bullets": "Bullets",
  "inspector.list.numbers": "Numbers",
  "inspector.list.marker": "Marker",
  "inspector.list.position": "Position",
  "inspector.list.marker.decimal": "Decimal",
  "inspector.list.marker.lowerAlpha": "Lower alpha",
  "inspector.list.marker.upperAlpha": "Upper alpha",
  "inspector.list.marker.lowerRoman": "Lower Roman",
  "inspector.list.marker.upperRoman": "Upper Roman",
  "inspector.list.marker.disc": "Disc",
  "inspector.list.marker.circle": "Circle",
  "inspector.list.marker.square": "Square",
  "inspector.list.marker.none": "None",
  "inspector.list.position.outside": "Outside",
  "inspector.list.position.inside": "Inside",
} as const;

export type InspectorListMessageKey = keyof typeof EN_INSPECTOR_LIST_MESSAGES;
export type InspectorListMessageCatalog = Record<
  InspectorListMessageKey,
  string
>;

export const FR_INSPECTOR_LIST_MESSAGES = {
  "inspector.list.reset": "Réinitialiser la liste",
  "inspector.list.addItem": "Ajouter un élément",
  "inspector.list.type": "Type",
  "inspector.list.bullets": "Puces",
  "inspector.list.numbers": "Numéros",
  "inspector.list.marker": "Marqueur",
  "inspector.list.position": "Position",
  "inspector.list.marker.decimal": "Décimal",
  "inspector.list.marker.lowerAlpha": "Lettres minuscules",
  "inspector.list.marker.upperAlpha": "Lettres majuscules",
  "inspector.list.marker.lowerRoman": "Chiffres romains minuscules",
  "inspector.list.marker.upperRoman": "Chiffres romains majuscules",
  "inspector.list.marker.disc": "Disque",
  "inspector.list.marker.circle": "Cercle",
  "inspector.list.marker.square": "Carré",
  "inspector.list.marker.none": "Aucun",
  "inspector.list.position.outside": "À l’extérieur",
  "inspector.list.position.inside": "À l’intérieur",
} satisfies InspectorListMessageCatalog;
