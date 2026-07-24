export const EN_INSPECTOR_TABS_MESSAGES = {
  "inspector.tabs.design": "Design",
  "inspector.tabs.props": "Props",
  "inspector.tabs.motion": "Aria Motion",
} as const;

export type InspectorTabsMessageKey = keyof typeof EN_INSPECTOR_TABS_MESSAGES;
export type InspectorTabsMessageCatalog = Record<
  InspectorTabsMessageKey,
  string
>;

export const FR_INSPECTOR_TABS_MESSAGES = {
  "inspector.tabs.design": "Conception",
  "inspector.tabs.props": "Propriétés",
  "inspector.tabs.motion": "Aria Motion",
} satisfies InspectorTabsMessageCatalog;
