export const EN_INSPECTOR_DATEFORMAT_MESSAGES = {
  "inspector.dateFormat.format": "Format",
  "inspector.dateFormat.label": "Date format",
  "inspector.dateFormat.choose": "Choose format",
} as const;

export type InspectorDateFormatMessageKey =
  keyof typeof EN_INSPECTOR_DATEFORMAT_MESSAGES;
export type InspectorDateFormatMessageCatalog = Record<
  InspectorDateFormatMessageKey,
  string
>;

export const FR_INSPECTOR_DATEFORMAT_MESSAGES = {
  "inspector.dateFormat.format": "Format",
  "inspector.dateFormat.label": "Format de date",
  "inspector.dateFormat.choose": "Choisir un format",
} satisfies InspectorDateFormatMessageCatalog;
