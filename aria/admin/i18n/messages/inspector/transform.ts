export const EN_INSPECTOR_TRANSFORM_MESSAGES = {
  "inspector.transform.preview": "Preview",
  "inspector.transform.translate": "Translate",
  "inspector.transform.rotate": "Rotate",
  "inspector.transform.scale": "Scale",
  "inspector.transform.skew": "Skew",
  "inspector.transform.origin": "Origin",
  "inspector.transform.linkAxes": "Link X and Y",
  "inspector.transform.center": "Center",
  "inspector.transform.unsupported":
    "Unsupported transform functions will be replaced if you edit this section.",
} as const;

export type InspectorTransformMessageKey =
  keyof typeof EN_INSPECTOR_TRANSFORM_MESSAGES;
export type InspectorTransformMessageCatalog = Record<
  InspectorTransformMessageKey,
  string
>;

export const FR_INSPECTOR_TRANSFORM_MESSAGES = {
  "inspector.transform.preview": "Aperçu",
  "inspector.transform.translate": "Translation",
  "inspector.transform.rotate": "Rotation",
  "inspector.transform.scale": "Échelle",
  "inspector.transform.skew": "Inclinaison",
  "inspector.transform.origin": "Origine",
  "inspector.transform.linkAxes": "Lier X et Y",
  "inspector.transform.center": "Centre",
  "inspector.transform.unsupported":
    "Les fonctions de transformation non prises en charge seront remplacées si vous modifiez cette section.",
} satisfies InspectorTransformMessageCatalog;
