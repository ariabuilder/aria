export const EN_COMPOSER_COMPONENT_SETTINGS_MESSAGES = {
  "composer.componentSettings.nameRequired": "Component name is required",
  "composer.componentSettings.categoryRequired": "Category is required",
  "composer.componentSettings.invalid": "Invalid component settings",
  "composer.componentSettings.saveFailed": "Failed to save component settings",
  "composer.componentSettings.saved": "Component settings saved",
  "composer.componentSettings.codeCopied": "Code copied",
  "composer.componentSettings.name": "Name",
  "composer.componentSettings.category": "Category",
  "composer.componentSettings.description": "Description",
  "composer.componentSettings.selectCategory": "Select category",
  "composer.componentSettings.descriptionPlaceholder":
    "Short description for your component library.",
  "composer.componentSettings.category.custom": "Custom",
  "composer.componentSettings.category.content": "Content",
  "composer.componentSettings.category.marketing": "Marketing",
  "composer.componentSettings.category.navigation": "Navigation",
  "composer.componentSettings.category.forms": "Forms",
  "composer.componentSettings.category.media": "Media",
  "composer.componentSettings.category.pricing": "Pricing",
  "composer.componentSettings.category.social": "Social",
  "composer.componentSettings.usage": "Usage",
  "composer.componentSettings.codePreview": "Code preview",
  "composer.componentSettings.codePreviewDescription":
    "Astro export for this component.",
  "composer.componentSettings.astroExport": "Astro export",
  "composer.componentSettings.generatingCode": "Generating code...",
  "composer.componentSettings.saveTitle": "Save component settings",
  "composer.componentSettings.saveDescription":
    "Saves component metadata and the current component canvas state.",
  "composer.componentSettings.saveAction": "Save component settings",
  "composer.componentSettings.info": "Component info",
  "composer.componentSettings.infoDescription":
    "Name, description, and category.",
  "composer.componentSettings.usageDescription":
    "Pages currently using this component.",
  "composer.componentSettings.loadingUsage": "Loading usage...",
  "composer.componentSettings.noUsage":
    "No pages are using this component yet.",
  "composer.componentSettings.layoutReferences":
    "Referenced in {{count}} layout(s).",
  "composer.componentSettings.instances": "{{count}} use(s)",
} as const;

export type ComposerComponentSettingsMessageKey =
  keyof typeof EN_COMPOSER_COMPONENT_SETTINGS_MESSAGES;
export type ComposerComponentSettingsMessageCatalog = Record<
  ComposerComponentSettingsMessageKey,
  string
>;

export const FR_COMPOSER_COMPONENT_SETTINGS_MESSAGES = {
  "composer.componentSettings.nameRequired": "Le nom du composant est requis",
  "composer.componentSettings.categoryRequired": "La catégorie est requise",
  "composer.componentSettings.invalid": "Paramètres de composant non valides",
  "composer.componentSettings.saveFailed":
    "Impossible d’enregistrer les paramètres du composant",
  "composer.componentSettings.saved": "Paramètres du composant enregistrés",
  "composer.componentSettings.codeCopied": "Code copié",
  "composer.componentSettings.name": "Nom",
  "composer.componentSettings.category": "Catégorie",
  "composer.componentSettings.description": "Description",
  "composer.componentSettings.selectCategory": "Sélectionner une catégorie",
  "composer.componentSettings.descriptionPlaceholder":
    "Courte description pour votre bibliothèque de composants.",
  "composer.componentSettings.category.custom": "Personnalisé",
  "composer.componentSettings.category.content": "Contenu",
  "composer.componentSettings.category.marketing": "Marketing",
  "composer.componentSettings.category.navigation": "Navigation",
  "composer.componentSettings.category.forms": "Formulaires",
  "composer.componentSettings.category.media": "Médias",
  "composer.componentSettings.category.pricing": "Tarification",
  "composer.componentSettings.category.social": "Réseaux sociaux",
  "composer.componentSettings.usage": "Utilisation",
  "composer.componentSettings.codePreview": "Aperçu du code",
  "composer.componentSettings.codePreviewDescription":
    "Exportation Astro pour ce composant.",
  "composer.componentSettings.astroExport": "Exportation Astro",
  "composer.componentSettings.generatingCode": "Génération du code...",
  "composer.componentSettings.saveTitle":
    "Enregistrer les paramètres du composant",
  "composer.componentSettings.saveDescription":
    "Enregistre les métadonnées du composant et l’état actuel de son canevas.",
  "composer.componentSettings.saveAction":
    "Enregistrer les paramètres du composant",
  "composer.componentSettings.info": "Informations sur le composant",
  "composer.componentSettings.infoDescription":
    "Nom, description et catégorie.",
  "composer.componentSettings.usageDescription":
    "Pages qui utilisent actuellement ce composant.",
  "composer.componentSettings.loadingUsage": "Chargement de l’utilisation...",
  "composer.componentSettings.noUsage":
    "Aucune page n’utilise encore ce composant.",
  "composer.componentSettings.layoutReferences":
    "Référencé dans {{count}} mise(s) en page.",
  "composer.componentSettings.instances": "{{count}} utilisation(s)",
} satisfies ComposerComponentSettingsMessageCatalog;
