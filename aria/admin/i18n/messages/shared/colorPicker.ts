export const EN_COLORPICKER_MESSAGES = {
  "colorPicker.copied": "Copied",
  "colorPicker.unresolved": "Unresolved variable",
  "colorPicker.editCustom": "Edit as custom color",
  "colorPicker.edit": "Edit",
  "colorPicker.pickFromScreen": "Pick color from screen",
  "colorPicker.copy": "Copy",
  "colorPicker.copyColor": "Copy color",
  "colorPicker.loading": "Loading…",
  "colorPicker.palette": "Color palette",
  "colorPicker.semanticColors": "Semantic colors",
  "colorPicker.searchVariables": "Search variables...",
  "colorPicker.recentColors": "Recent colors",
  "colorPicker.hue": "Hue",
  "colorPicker.alpha": "Alpha",
  "colorPicker.slider": "Slider",
  "colorPicker.contrastRatio": "Contrast ratio {{ratio}}",
} as const;

export type ColorPickerMessageKey = keyof typeof EN_COLORPICKER_MESSAGES;
export type ColorPickerMessageCatalog = Record<ColorPickerMessageKey, string>;

export const FR_COLORPICKER_MESSAGES = {
  "colorPicker.copied": "Copié",
  "colorPicker.unresolved": "Variable non résolue",
  "colorPicker.editCustom": "Modifier comme couleur personnalisée",
  "colorPicker.edit": "Modifier",
  "colorPicker.pickFromScreen": "Prélever une couleur à l’écran",
  "colorPicker.copy": "Copier",
  "colorPicker.copyColor": "Copier la couleur",
  "colorPicker.loading": "Chargement…",
  "colorPicker.palette": "Palette de couleurs",
  "colorPicker.semanticColors": "Couleurs sémantiques",
  "colorPicker.searchVariables": "Rechercher des variables...",
  "colorPicker.recentColors": "Couleurs récentes",
  "colorPicker.hue": "Teinte",
  "colorPicker.alpha": "Opacité",
  "colorPicker.slider": "Curseur",
  "colorPicker.contrastRatio": "Rapport de contraste {{ratio}}",
} satisfies ColorPickerMessageCatalog;
