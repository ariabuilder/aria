export const EN_INSPECTOR_SHADOW_MESSAGES = {
  "inspector.shadow.offset": "Offset",
  "inspector.shadow.blurSpread": "Blur / Spread",
  "inspector.shadow.blur": "Blur",
  "inspector.shadow.spread": "Spread",
  "inspector.shadow.color": "Color",
} as const;
export type InspectorShadowMessageKey =
  keyof typeof EN_INSPECTOR_SHADOW_MESSAGES;
export type InspectorShadowMessageCatalog = Record<
  InspectorShadowMessageKey,
  string
>;
export const FR_INSPECTOR_SHADOW_MESSAGES = {
  "inspector.shadow.offset": "Décalage",
  "inspector.shadow.blurSpread": "Flou / Étendue",
  "inspector.shadow.blur": "Flou",
  "inspector.shadow.spread": "Étendue",
  "inspector.shadow.color": "Couleur",
} satisfies InspectorShadowMessageCatalog;
