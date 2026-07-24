export const EN_INSPECTOR_VALIDATION_MESSAGES = {
  "inspector.validation.invalidText": "Invalid text value.",
  "inspector.validation.invalidLink": "Invalid link configuration.",
  "inspector.validation.invalidSectionId": "Invalid section ID.",
  "inspector.validation.invalidSize": "Invalid size value.",
  "inspector.validation.invalidSpacing": "Invalid spacing value.",
  "inspector.validation.spacingHelp":
    "Enter a valid spacing value (for example, 16px or a spacing variable).",
  "inspector.validation.saveSpacing": "Failed to save spacing.",
  "inspector.validation.invalidPositionMode": "Invalid position mode.",
  "inspector.validation.invalidPosition": "Invalid position value.",
  "inspector.validation.invalidTransform": "Invalid transform value.",
  "inspector.validation.invalidBorder": "Invalid border value.",
  "inspector.validation.invalidRadius": "Invalid border radius value.",
  "inspector.validation.invalidCornerShape": "Invalid corner shape value.",
  "inspector.validation.invalidShadow": "Invalid shadow value.",
  "inspector.validation.invalidFilter": "Invalid filter value.",
  "inspector.validation.invalidOpacity": "Invalid opacity value.",
  "inspector.validation.invalidOpacityConfiguration":
    "Invalid opacity configuration.",
  "inspector.validation.invalidVisibility": "Invalid visibility configuration.",
  "inspector.validation.invalidList": "Invalid list configuration.",
  "inspector.validation.invalidComponentSelection":
    "Invalid component selection.",
  "inspector.validation.invalidComponentAssignment":
    "Invalid component assignment.",
  "inspector.validation.invalidCode": "Invalid code block.",
  "inspector.validation.invalidIcon": "Invalid icon value.",
  "inspector.validation.invalidIconColor": "Invalid icon color.",
  "inspector.validation.invalidIconSize": "Invalid icon size.",
} as const;

export type InspectorValidationMessageKey =
  keyof typeof EN_INSPECTOR_VALIDATION_MESSAGES;
export type InspectorValidationMessageCatalog = Record<
  InspectorValidationMessageKey,
  string
>;

export const FR_INSPECTOR_VALIDATION_MESSAGES = {
  "inspector.validation.invalidText": "Valeur de texte non valide.",
  "inspector.validation.invalidLink": "Configuration de lien non valide.",
  "inspector.validation.invalidSectionId": "ID de section non valide.",
  "inspector.validation.invalidSize": "Valeur de taille non valide.",
  "inspector.validation.invalidSpacing": "Valeur d’espacement non valide.",
  "inspector.validation.spacingHelp":
    "Saisissez une valeur d’espacement valide (par exemple, 16px ou une variable d’espacement).",
  "inspector.validation.saveSpacing": "Impossible d’enregistrer l’espacement.",
  "inspector.validation.invalidPositionMode": "Mode de position non valide.",
  "inspector.validation.invalidPosition": "Valeur de position non valide.",
  "inspector.validation.invalidTransform":
    "Valeur de transformation non valide.",
  "inspector.validation.invalidBorder": "Valeur de bordure non valide.",
  "inspector.validation.invalidRadius":
    "Valeur de rayon de bordure non valide.",
  "inspector.validation.invalidCornerShape":
    "Valeur de forme de coin non valide.",
  "inspector.validation.invalidShadow": "Valeur d’ombre non valide.",
  "inspector.validation.invalidFilter": "Valeur de filtre non valide.",
  "inspector.validation.invalidOpacity": "Valeur d’opacité non valide.",
  "inspector.validation.invalidOpacityConfiguration":
    "Configuration d’opacité non valide.",
  "inspector.validation.invalidVisibility":
    "Configuration de visibilité non valide.",
  "inspector.validation.invalidList": "Configuration de liste non valide.",
  "inspector.validation.invalidComponentSelection":
    "Sélection de composant non valide.",
  "inspector.validation.invalidComponentAssignment":
    "Affectation de composant non valide.",
  "inspector.validation.invalidCode": "Bloc de code non valide.",
  "inspector.validation.invalidIcon": "Valeur d’icône non valide.",
  "inspector.validation.invalidIconColor": "Couleur d’icône non valide.",
  "inspector.validation.invalidIconSize": "Taille d’icône non valide.",
} satisfies InspectorValidationMessageCatalog;
