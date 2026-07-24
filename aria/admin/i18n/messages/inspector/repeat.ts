export const EN_INSPECTOR_REPEAT_MESSAGES = {
  "inspector.repeat.title": "Loop",
  "inspector.repeat.mode": "Repeat mode",
  "inspector.repeat.static": "Static",
  "inspector.repeat.repeat": "Repeat",
  "inspector.repeat.loopItem": "Loop item",
  "inspector.repeat.collection": "Collection",
} as const;

export type InspectorRepeatMessageKey =
  keyof typeof EN_INSPECTOR_REPEAT_MESSAGES;
export type InspectorRepeatMessageCatalog = Record<
  InspectorRepeatMessageKey,
  string
>;

export const FR_INSPECTOR_REPEAT_MESSAGES = {
  "inspector.repeat.title": "Boucle",
  "inspector.repeat.mode": "Mode de répétition",
  "inspector.repeat.static": "Statique",
  "inspector.repeat.repeat": "Répéter",
  "inspector.repeat.loopItem": "Élément de boucle",
  "inspector.repeat.collection": "Collection",
} satisfies InspectorRepeatMessageCatalog;
