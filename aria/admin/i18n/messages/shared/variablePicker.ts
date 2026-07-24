export const EN_VARIABLEPICKER_MESSAGES = {
  "variablePicker.search": "Search variables...",
  "variablePicker.assign": "Assign variable",
  "variablePicker.assigned": "Variable assigned: {{variable}}",
  "variablePicker.loading": "Loading variables...",
  "variablePicker.empty": "No matching variables.",
  "variablePicker.mode": "Mode",
  "variablePicker.useDirect": "Use direct value",
  "variablePicker.directDescription": "Keep editing this field directly",
  "variablePicker.chooseField": "Choose field",
} as const;

export type VariablePickerMessageKey = keyof typeof EN_VARIABLEPICKER_MESSAGES;
export type VariablePickerMessageCatalog = Record<
  VariablePickerMessageKey,
  string
>;

export const FR_VARIABLEPICKER_MESSAGES = {
  "variablePicker.search": "Rechercher des variables...",
  "variablePicker.assign": "Attribuer une variable",
  "variablePicker.assigned": "Variable attribuée : {{variable}}",
  "variablePicker.loading": "Chargement des variables...",
  "variablePicker.empty": "Aucune variable correspondante.",
  "variablePicker.mode": "Mode",
  "variablePicker.useDirect": "Utiliser une valeur directe",
  "variablePicker.directDescription":
    "Continuer à modifier ce champ directement",
  "variablePicker.chooseField": "Choisir un champ",
} satisfies VariablePickerMessageCatalog;
