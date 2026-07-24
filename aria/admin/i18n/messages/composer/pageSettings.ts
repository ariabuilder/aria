export const EN_COMPOSER_PAGE_SETTINGS_MESSAGES = {
  "composer.pageSettings.unavailable":
    "Page settings are available when editing a page.",
  "composer.pageSettings.layoutIntro":
    "Choose whether this page inherits a shared layout or renders as a standalone page.",
  "composer.pageSettings.assignedLayout": "Assigned layout",
  "composer.pageSettings.noSharedLayout": "No shared layout",
  "composer.pageSettings.loadingLayouts": "Loading layouts...",
  "composer.pageSettings.noLayout": "No layout",
  "composer.pageSettings.noLayoutDescription":
    "Render this page without a shared layout shell.",
  "composer.pageSettings.sharedLayoutDescription":
    "Shared structure applied to this page.",
  "composer.pageSettings.renderDirectly": "Render page content directly.",
  "composer.pageSettings.layoutFallback": "Layout for this page.",
  "composer.pageSettings.noLayouts": "No layouts available.",
  "composer.pageSettings.layoutAppliesImmediately":
    "Layout changes apply immediately.",
  "composer.pageSettings.internalName": "Internal name and fallback title",
  "composer.pageSettings.metaTitle": "Meta title",
  "composer.pageSettings.searchDescriptionPlaceholder":
    "Short description for search results",
  "composer.pageSettings.route": "Route",
  "composer.pageSettings.robots": "Robots",
  "composer.pageSettings.routingAccess": "Routing & Access",
  "composer.pageSettings.routingAccessDescription":
    "Shared runtime policy for public routing, password gates, and 404 ownership",
  "composer.pageSettings.loadingAccess": "Loading page access settings...",
  "composer.pageSettings.role": "Page role",
  "composer.pageSettings.standardPage": "Standard page",
  "composer.pageSettings.notFoundOwner": "404 page owner",
  "composer.pageSettings.notFoundRoleHelp":
    "Use the 404 role only for the canonical page that should render when public requests miss.",
  "composer.pageSettings.publicAccess": "Public access",
  "composer.pageSettings.notFoundAlwaysPublic":
    "404 pages always stay publicly routable.",
  "composer.pageSettings.pagePassword": "Page password",
  "composer.pageSettings.keepPassword": "Keep current password",
  "composer.pageSettings.resetPassword": "Reset password",
  "composer.pageSettings.keepPasswordPlaceholder":
    "Leave blank to keep current password",
  "composer.pageSettings.newPasswordPlaceholder": "Enter a new password",
  "composer.pageSettings.replacePassword":
    "Enter a replacement password before saving.",
  "composer.pageSettings.currentPasswordHelp":
    "Visitors currently have an active password gate. Leave this blank to keep the current secret.",
  "composer.pageSettings.newPasswordHelp":
    "Set the password visitors must enter before the page renders.",
  "composer.pageSettings.promptTitle": "Prompt title",
  "composer.pageSettings.rememberAccess": "Remember access",
  "composer.pageSettings.promptDescription": "Prompt description",
  "composer.pageSettings.passwordPromptPlaceholder":
    "Enter the password to continue.",
  "composer.pageSettings.effectiveRole": "Effective role",
  "composer.pageSettings.effectiveAccess": "Effective access",
  "composer.pageSettings.passwordGrant": "Password grant",
  "composer.pageSettings.notApplicable": "Not applicable",
  "composer.pageSettings.configured": "Configured",
  "composer.pageSettings.optional": "Optional",
  "composer.pageSettings.previewTitle": "Preview title",
  "composer.pageSettings.previewDescription": "Preview description",
  "composer.pageSettings.previewImage": "Preview image",
  "composer.pageSettings.selected": "Selected",
  "composer.pageSettings.notSet": "Not set",
  "composer.pageSettings.useDefault": "Use default",
  "composer.pageSettings.advancedDescription":
    "Keywords, indexing, and structured data",
  "composer.pageSettings.keywords": "Keywords",
  "composer.pageSettings.noIndexHelp":
    "Prevent search engines from indexing this page",
  "composer.pageSettings.noFollowHelp":
    "Ask crawlers not to follow links on this page",
  "composer.pageSettings.effectiveRobots": "Effective robots state",
  "composer.pageSettings.structuredDataConfigured":
    "Structured data configured",
  "composer.pageSettings.noStructuredData": "No structured data configured",
  "composer.pageSettings.socialDescription":
    "Open Graph and Twitter card settings",
  "composer.pageSettings.twitterCard": "Twitter card",
  "composer.pageSettings.ogType": "OG type",
  "composer.pageSettings.twitterSite": "Twitter site",
  "composer.pageSettings.twitterCreator": "Twitter creator",
  "composer.pageSettings.saveAction": "Save page settings",
  "composer.pageSettings.rememberDaysInvalid":
    "Remember for days must be between 1 and 30",
  "composer.pageSettings.structuredDataInvalid":
    "Structured data must be valid JSON",
  "composer.pageSettings.twitterCardInvalid":
    "Twitter card must be one of: summary_large_image, summary, app, player",
  "composer.pageSettings.untitledPreview": "Untitled page",
  "composer.pageSettings.searchPreviewFallback":
    "Add a concise description so search previews explain the page before someone clicks.",
  "composer.pageSettings.socialPreviewFallback":
    "Your social card will feel more complete with a custom description and image.",
  "composer.pageSettings.notFoundAccessSummary":
    "Acts as the authored 404 owner. Public requests always resolve through the 404 surface.",
  "composer.pageSettings.passwordAccessWithCurrent":
    "Visitors need the page password. Leave the password blank to keep the current secret.",
  "composer.pageSettings.passwordAccess":
    "Visitors need a password before this page can be viewed publicly.",
  "composer.pageSettings.privateAccess":
    "Public requests behave like a missing page. Preview remains available to authenticated editors.",
  "composer.pageSettings.unlistedAccess":
    "The page stays publicly reachable by direct URL, but discovery surfaces should exclude it.",
  "composer.pageSettings.publicAccessSummary":
    "The page is public and participates in normal discovery and caching behavior.",
  "composer.pageSettings.loadPolicyFailed":
    "Failed to load page access settings",
  "composer.pageSettings.loadLayoutsFailed": "Failed to load layouts",
  "composer.pageSettings.savePolicyFailed":
    "Failed to save page access settings",
  "composer.pageSettings.loadPageFailed": "Failed to load current page",
  "composer.pageSettings.saveFailed": "Failed to save page settings",
} as const;

export type ComposerPageSettingsMessageKey =
  keyof typeof EN_COMPOSER_PAGE_SETTINGS_MESSAGES;
export type ComposerPageSettingsMessageCatalog = Record<
  ComposerPageSettingsMessageKey,
  string
>;

export const FR_COMPOSER_PAGE_SETTINGS_MESSAGES = {
  "composer.pageSettings.unavailable":
    "Les paramètres de page sont disponibles lors de la modification d’une page.",
  "composer.pageSettings.layoutIntro":
    "Choisissez si cette page hérite d’une mise en page partagée ou s’affiche seule.",
  "composer.pageSettings.assignedLayout": "Mise en page attribuée",
  "composer.pageSettings.noSharedLayout": "Aucune mise en page partagée",
  "composer.pageSettings.loadingLayouts": "Chargement des mises en page...",
  "composer.pageSettings.noLayout": "Aucune mise en page",
  "composer.pageSettings.noLayoutDescription":
    "Afficher cette page sans structure de mise en page partagée.",
  "composer.pageSettings.sharedLayoutDescription":
    "Structure partagée appliquée à cette page.",
  "composer.pageSettings.renderDirectly":
    "Afficher directement le contenu de la page.",
  "composer.pageSettings.layoutFallback": "Mise en page de cette page.",
  "composer.pageSettings.noLayouts": "Aucune mise en page disponible.",
  "composer.pageSettings.layoutAppliesImmediately":
    "Les changements de mise en page s’appliquent immédiatement.",
  "composer.pageSettings.internalName": "Nom interne et titre de remplacement",
  "composer.pageSettings.metaTitle": "Titre méta",
  "composer.pageSettings.searchDescriptionPlaceholder":
    "Courte description pour les résultats de recherche",
  "composer.pageSettings.route": "Itinéraire",
  "composer.pageSettings.robots": "Robots",
  "composer.pageSettings.routingAccess": "Routage et accès",
  "composer.pageSettings.routingAccessDescription":
    "Politique d’exécution partagée pour le routage public, les mots de passe et la page 404",
  "composer.pageSettings.loadingAccess":
    "Chargement des paramètres d’accès à la page...",
  "composer.pageSettings.role": "Rôle de la page",
  "composer.pageSettings.standardPage": "Page standard",
  "composer.pageSettings.notFoundOwner": "Responsable de la page 404",
  "composer.pageSettings.notFoundRoleHelp":
    "Utilisez le rôle 404 uniquement pour la page canonique qui doit s’afficher lorsqu’une demande publique échoue.",
  "composer.pageSettings.publicAccess": "Accès public",
  "composer.pageSettings.notFoundAlwaysPublic":
    "Les pages 404 restent toujours accessibles publiquement.",
  "composer.pageSettings.pagePassword": "Mot de passe de la page",
  "composer.pageSettings.keepPassword": "Conserver le mot de passe actuel",
  "composer.pageSettings.resetPassword": "Réinitialiser le mot de passe",
  "composer.pageSettings.keepPasswordPlaceholder":
    "Laissez vide pour conserver le mot de passe actuel",
  "composer.pageSettings.newPasswordPlaceholder":
    "Saisissez un nouveau mot de passe",
  "composer.pageSettings.replacePassword":
    "Saisissez un mot de passe de remplacement avant l’enregistrement.",
  "composer.pageSettings.currentPasswordHelp":
    "Les visiteurs passent actuellement par un mot de passe. Laissez ce champ vide pour conserver le secret actuel.",
  "composer.pageSettings.newPasswordHelp":
    "Définissez le mot de passe que les visiteurs doivent saisir avant l’affichage de la page.",
  "composer.pageSettings.promptTitle": "Titre de l’invite",
  "composer.pageSettings.rememberAccess": "Mémoriser l’accès",
  "composer.pageSettings.promptDescription": "Description de l’invite",
  "composer.pageSettings.passwordPromptPlaceholder":
    "Saisissez le mot de passe pour continuer.",
  "composer.pageSettings.effectiveRole": "Rôle appliqué",
  "composer.pageSettings.effectiveAccess": "Accès appliqué",
  "composer.pageSettings.passwordGrant": "Autorisation par mot de passe",
  "composer.pageSettings.notApplicable": "Sans objet",
  "composer.pageSettings.configured": "Configuré",
  "composer.pageSettings.optional": "Facultatif",
  "composer.pageSettings.previewTitle": "Titre de l’aperçu",
  "composer.pageSettings.previewDescription": "Description de l’aperçu",
  "composer.pageSettings.previewImage": "Image de l’aperçu",
  "composer.pageSettings.selected": "Sélectionnée",
  "composer.pageSettings.notSet": "Non définie",
  "composer.pageSettings.useDefault": "Utiliser la valeur par défaut",
  "composer.pageSettings.advancedDescription":
    "Mots-clés, indexation et données structurées",
  "composer.pageSettings.keywords": "Mots-clés",
  "composer.pageSettings.noIndexHelp":
    "Empêcher les moteurs de recherche d’indexer cette page",
  "composer.pageSettings.noFollowHelp":
    "Demander aux robots de ne pas suivre les liens de cette page",
  "composer.pageSettings.effectiveRobots": "État effectif des robots",
  "composer.pageSettings.structuredDataConfigured":
    "Données structurées configurées",
  "composer.pageSettings.noStructuredData":
    "Aucune donnée structurée configurée",
  "composer.pageSettings.socialDescription":
    "Paramètres Open Graph et de carte Twitter",
  "composer.pageSettings.twitterCard": "Carte Twitter",
  "composer.pageSettings.ogType": "Type OG",
  "composer.pageSettings.twitterSite": "Site Twitter",
  "composer.pageSettings.twitterCreator": "Créateur Twitter",
  "composer.pageSettings.saveAction": "Enregistrer les paramètres de la page",
  "composer.pageSettings.rememberDaysInvalid":
    "La durée de mémorisation doit être comprise entre 1 et 30 jours",
  "composer.pageSettings.structuredDataInvalid":
    "Les données structurées doivent être du JSON valide",
  "composer.pageSettings.twitterCardInvalid":
    "La carte Twitter doit être l’une des valeurs suivantes : summary_large_image, summary, app, player",
  "composer.pageSettings.untitledPreview": "Page sans titre",
  "composer.pageSettings.searchPreviewFallback":
    "Ajoutez une brève description afin que l’aperçu de recherche explique la page avant le clic.",
  "composer.pageSettings.socialPreviewFallback":
    "Votre carte sociale sera plus complète avec une description et une image personnalisées.",
  "composer.pageSettings.notFoundAccessSummary":
    "Cette page est responsable de la page 404. Les demandes publiques y sont toujours dirigées.",
  "composer.pageSettings.passwordAccessWithCurrent":
    "Les visiteurs ont besoin du mot de passe de la page. Laissez ce champ vide pour conserver le secret actuel.",
  "composer.pageSettings.passwordAccess":
    "Les visiteurs doivent saisir un mot de passe avant de pouvoir voir cette page publiquement.",
  "composer.pageSettings.privateAccess":
    "Les demandes publiques se comportent comme si la page était introuvable. L’aperçu reste accessible aux éditeurs authentifiés.",
  "composer.pageSettings.unlistedAccess":
    "La page reste publiquement accessible par URL directe, mais les surfaces de découverte doivent l’exclure.",
  "composer.pageSettings.publicAccessSummary":
    "La page est publique et participe normalement à la découverte et à la mise en cache.",
  "composer.pageSettings.loadPolicyFailed":
    "Impossible de charger les paramètres d’accès à la page",
  "composer.pageSettings.loadLayoutsFailed":
    "Impossible de charger les mises en page",
  "composer.pageSettings.savePolicyFailed":
    "Impossible d’enregistrer les paramètres d’accès à la page",
  "composer.pageSettings.loadPageFailed":
    "Impossible de charger la page actuelle",
  "composer.pageSettings.saveFailed":
    "Impossible d’enregistrer les paramètres de la page",
} satisfies ComposerPageSettingsMessageCatalog;
