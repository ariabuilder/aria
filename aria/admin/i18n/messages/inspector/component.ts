export const EN_INSPECTOR_COMPONENT_MESSAGES = {
  "inspector.component.reset": "Reset component assignment",
  "inspector.component.assigned": "Assigned component",
  "inspector.component.select": "Select a component",
  "inspector.component.unassigned": "Unassigned",
} as const;

export type InspectorComponentMessageKey =
  keyof typeof EN_INSPECTOR_COMPONENT_MESSAGES;
export type InspectorComponentMessageCatalog = Record<
  InspectorComponentMessageKey,
  string
>;

export const FR_INSPECTOR_COMPONENT_MESSAGES = {
  "inspector.component.reset": "Réinitialiser l’affectation du composant",
  "inspector.component.assigned": "Composant affecté",
  "inspector.component.select": "Sélectionner un composant",
  "inspector.component.unassigned": "Non affecté",
} satisfies InspectorComponentMessageCatalog;
