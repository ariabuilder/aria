export const EN_LOCALIZATION_MESSAGES = {
  "localization.title": "Localization",
  "localization.description":
    "Configure the languages available for your site content.",
  "localization.defaultLocale": "Default content language",
  "localization.defaultLocaleDescription":
    "The default content language and source for new translations.",
  "localization.enabledLocales": "Content languages",
  "localization.languageListDescription":
    "Configure public language variants and the order in which content falls back.",
  "localization.activeCount": "{count} active",
  "localization.disabledCount": "{count} disabled",
  "localization.language": "Language",
  "localization.status": "Status",
  "localization.actions": "Actions",
  "localization.statusDefault": "Default",
  "localization.statusActive": "Active",
  "localization.statusDisabled": "Disabled",
  "localization.none": "None",
  "localization.unnamedLanguage": "Unnamed language",
  "localization.newLocale": "New locale",
  "localization.searchLanguages": "Search languages…",
  "localization.noLanguagesFound": "No languages found.",
  "localization.availableLanguages": "Available languages",
  "localization.addCustomLocale": "Add custom locale",
  "localization.editLanguage": "Edit language",
  "localization.languageConfiguration": "Language configuration",
  "localization.newLanguageDescription": "Configure this new language variant",
  "localization.codeLocked": "Code is locked",
  "localization.defaultAlwaysEnabled":
    "The default language must remain enabled.",
  "localization.enabledDescription":
    "Disabled languages are not available on public routes.",
  "localization.fallbackDescription":
    "Used in order when this language does not have localized content.",
  "localization.addFallback": "Add fallback",
  "localization.noFallbacks":
    "No fallback languages. Missing content resolves to the default language.",
  "localization.configurationNeedsAttention": "Configuration needs attention",
  "localization.unsavedChanges": "You have unsaved localization changes.",
  "localization.allChangesSaved": "All localization changes are saved.",
  "localization.discardChanges": "Discard changes",
  "localization.fallbacks": "Fallback languages",
  "localization.direction": "Writing direction",
  "localization.directionLtr": "Left to right",
  "localization.directionRtl": "Right to left",
  "localization.addLocale": "Add language",
  "localization.localeCode": "Language code",
  "localization.localeLabel": "Language name",
  "localization.enabled": "Enabled",
  "localization.removeLocale": "Remove language",
  "localization.removeConfirmationTitle": "Remove language?",
  "localization.removeConfirmationDescription":
    "Remove {language} from this site’s content languages? This change takes effect when you save.",
  "localization.disableLocale": "Disable language",
  "localization.saveSuccess": "Localization settings saved",
} as const;

export type LocalizationMessageKey = keyof typeof EN_LOCALIZATION_MESSAGES;
export type LocalizationMessageCatalog = Record<LocalizationMessageKey, string>;

export const FR_LOCALIZATION_MESSAGES = {
  "localization.title": "Localisation",
  "localization.description":
    "Configurez les langues disponibles pour le contenu de votre site.",
  "localization.defaultLocale": "Langue de contenu par défaut",
  "localization.defaultLocaleDescription":
    "Utilisée lorsqu’aucune langue visiteur ne correspond et comme source des nouvelles traductions.",
  "localization.enabledLocales": "Langues de contenu",
  "localization.languageListDescription":
    "Configurez les variantes publiques et l’ordre de repli du contenu.",
  "localization.activeCount": "{count} actives",
  "localization.disabledCount": "{count} désactivées",
  "localization.language": "Langue",
  "localization.status": "État",
  "localization.actions": "Actions",
  "localization.statusDefault": "Par défaut",
  "localization.statusActive": "Active",
  "localization.statusDisabled": "Désactivée",
  "localization.none": "Aucune",
  "localization.unnamedLanguage": "Langue sans nom",
  "localization.newLocale": "Nouvelle langue",
  "localization.searchLanguages": "Rechercher des langues…",
  "localization.noLanguagesFound": "Aucune langue trouvée.",
  "localization.availableLanguages": "Langues disponibles",
  "localization.addCustomLocale": "Ajouter une langue personnalisée",
  "localization.editLanguage": "Modifier la langue",
  "localization.languageConfiguration": "Configuration de la langue",
  "localization.newLanguageDescription":
    "Configurez cette nouvelle variante linguistique",
  "localization.codeLocked": "Code verrouillé",
  "localization.defaultAlwaysEnabled":
    "La langue par défaut doit rester active.",
  "localization.enabledDescription":
    "Les langues désactivées ne sont pas accessibles par les routes publiques.",
  "localization.fallbackDescription":
    "Utilisée dans l’ordre lorsque le contenu n’est pas traduit dans cette langue.",
  "localization.addFallback": "Ajouter un repli",
  "localization.noFallbacks":
    "Aucune langue de repli. Le contenu manquant utilise la langue par défaut.",
  "localization.configurationNeedsAttention":
    "La configuration nécessite votre attention",
  "localization.unsavedChanges":
    "Vous avez des modifications de localisation non enregistrées.",
  "localization.allChangesSaved":
    "Toutes les modifications de localisation sont enregistrées.",
  "localization.discardChanges": "Ignorer les modifications",
  "localization.fallbacks": "Langues de secours",
  "localization.direction": "Sens d’écriture",
  "localization.directionLtr": "De gauche à droite",
  "localization.directionRtl": "De droite à gauche",
  "localization.addLocale": "Ajouter une langue",
  "localization.localeCode": "Code de langue",
  "localization.localeLabel": "Nom de la langue",
  "localization.enabled": "Activee",
  "localization.removeLocale": "Supprimer la langue",
  "localization.removeConfirmationTitle": "Supprimer la langue ?",
  "localization.removeConfirmationDescription":
    "Supprimer {language} des langues de contenu de ce site ? Cette modification prendra effet lors de l’enregistrement.",
  "localization.disableLocale": "Désactiver la langue",
  "localization.saveSuccess": "Paramètres de localisation enregistrés",
} satisfies LocalizationMessageCatalog;
