export const EN_APPEARANCE_MESSAGES = {
  "appearance.interfaceLanguage": "Interface language",
  "appearance.interfaceLanguageDescription":
    "Choose the language used by Aria Studio.",
  "appearance.systemLanguage": "Use system language",
} as const;

export type AppearanceMessageKey = keyof typeof EN_APPEARANCE_MESSAGES;
export type AppearanceMessageCatalog = Record<AppearanceMessageKey, string>;

export const FR_APPEARANCE_MESSAGES = {
  "appearance.interfaceLanguage": "Langue de l'interface",
  "appearance.interfaceLanguageDescription":
    "Choisissez la langue utilisée par Aria Studio.",
  "appearance.systemLanguage": "Utiliser la langue du système",
} satisfies AppearanceMessageCatalog;
