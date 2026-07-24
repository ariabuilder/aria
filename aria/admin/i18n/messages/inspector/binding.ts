export const EN_INSPECTOR_BINDING_MESSAGES = {
  "inspector.binding.clear": "Clear binding",
} as const;

export type InspectorBindingMessageKey =
  keyof typeof EN_INSPECTOR_BINDING_MESSAGES;
export type InspectorBindingMessageCatalog = Record<
  InspectorBindingMessageKey,
  string
>;

export const FR_INSPECTOR_BINDING_MESSAGES = {
  "inspector.binding.clear": "Effacer la liaison",
} satisfies InspectorBindingMessageCatalog;
