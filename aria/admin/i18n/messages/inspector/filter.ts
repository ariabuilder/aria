export const EN_INSPECTOR_FILTER_MESSAGES = {
  "inspector.filter.label": "Filter",
  "inspector.filter.backdrop": "Backdrop filter",
  "inspector.filter.backdropEffect": "Backdrop {{effect}}",
  "inspector.filter.toggle": "Toggle {{effect}}",
  "inspector.filter.blur": "Blur",
  "inspector.filter.brightness": "Brightness",
  "inspector.filter.contrast": "Contrast",
  "inspector.filter.grayscale": "Grayscale",
  "inspector.filter.hueRotate": "Hue rotate",
  "inspector.filter.invert": "Invert",
  "inspector.filter.saturate": "Saturate",
  "inspector.filter.sepia": "Sepia",
  "inspector.filter.dropShadow": "Drop shadow",
  "inspector.filter.offset": "Offset",
  "inspector.filter.color": "Color",
} as const;
export type InspectorFilterMessageKey =
  keyof typeof EN_INSPECTOR_FILTER_MESSAGES;
export type InspectorFilterMessageCatalog = Record<
  InspectorFilterMessageKey,
  string
>;
export const FR_INSPECTOR_FILTER_MESSAGES = {
  "inspector.filter.label": "Filtre",
  "inspector.filter.backdrop": "Filtre d’arrière-plan",
  "inspector.filter.backdropEffect": "{{effect}} d’arrière-plan",
  "inspector.filter.toggle": "Activer ou désactiver {{effect}}",
  "inspector.filter.blur": "Flou",
  "inspector.filter.brightness": "Luminosité",
  "inspector.filter.contrast": "Contraste",
  "inspector.filter.grayscale": "Niveaux de gris",
  "inspector.filter.hueRotate": "Rotation de teinte",
  "inspector.filter.invert": "Inverser",
  "inspector.filter.saturate": "Saturation",
  "inspector.filter.sepia": "Sépia",
  "inspector.filter.dropShadow": "Ombre portée",
  "inspector.filter.offset": "Décalage",
  "inspector.filter.color": "Couleur",
} satisfies InspectorFilterMessageCatalog;
