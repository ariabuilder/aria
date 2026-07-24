export const EN_INSPECTOR_LOCKED_MESSAGES = {
  "inspector.locked.title": "Component instance",
  "inspector.locked.description":
    'This is a locked instance of "{{component}}". Edit the source component or detach this instance to customize it here.',
  "inspector.locked.editComponent": "Edit component",
  "inspector.locked.detach": "Detach instance",
} as const;

export type InspectorLockedMessageKey =
  keyof typeof EN_INSPECTOR_LOCKED_MESSAGES;
export type InspectorLockedMessageCatalog = Record<
  InspectorLockedMessageKey,
  string
>;

export const FR_INSPECTOR_LOCKED_MESSAGES = {
  "inspector.locked.title": "Instance de composant",
  "inspector.locked.description":
    "Il s’agit d’une instance verrouillée de « {{component}} ». Modifiez le composant source, ou détachez cette instance pour la personnaliser ici.",
  "inspector.locked.editComponent": "Modifier le composant",
  "inspector.locked.detach": "Détacher l’instance",
} satisfies InspectorLockedMessageCatalog;
