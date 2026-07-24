export const EN_IMPORT_MESSAGES = {
  "import.wordpress.aria": "Import content",
  "import.wordpress.title": "WordPress Import",
  "import.wordpress.description":
    "Import a WordPress WXR/XML export into Aria CMS. Builder layouts, CSS, shortcodes, and raw builder metadata are excluded.",
  "import.wordpress.progress": "WordPress import progress",
  "import.wordpress.chooseAria": "Choose WordPress export",
  "import.wordpress.noXml": "No XML selected",
  "import.wordpress.xmlHint":
    "Use the standard WordPress XML export from Tools > Export.",
  "import.wordpress.chooseXml": "Choose XML",
  "import.wordpress.analyzing": "Analyzing...",
  "import.wordpress.analyzeXml": "Analyze XML",
  "import.wordpress.importing": "Importing WordPress content...",
  "import.wordpress.step.source": "Source",
  "import.wordpress.step.review": "Review",
  "import.wordpress.step.report": "Report",
  "import.wordpress.review.title": "Review import plan",
  "import.wordpress.review.description":
    "Choose the clean WordPress data Aria should bring in. Imported content starts as draft.",
  "import.wordpress.review.whatToImport": "What To Import",
  "import.wordpress.review.uncheckedSkipped": "Unchecked rows are skipped",
  "import.wordpress.review.needsAttention": "Needs Attention",
  "import.wordpress.review.back": "Back",
  "import.wordpress.review.importSelected": "Import Selected",
  "import.wordpress.scope.posts.title": "Posts",
  "import.wordpress.scope.posts.description":
    "Create draft entries in the posts collection.",
  "import.wordpress.scope.pages.title": "Pages",
  "import.wordpress.scope.pages.description":
    "Create draft entries from WordPress pages.",
  "import.wordpress.scope.customPostTypes.title": "Custom Post Types",
  "import.wordpress.scope.customPostTypes.description":
    "Create draft entries and collections for CPT content.",
  "import.wordpress.scope.media.title": "Media",
  "import.wordpress.scope.media.description":
    "Allow media attachments and featured image references.",
  "import.wordpress.scope.terms.title": "Terms",
  "import.wordpress.scope.terms.description":
    "Bring taxonomy and tag data into the import plan.",
  "import.wordpress.scope.authors.title": "Authors",
  "import.wordpress.scope.authors.description":
    "Keep WordPress authors as content data, not auth users.",
  "import.wordpress.scope.menus.title": "Menus",
  "import.wordpress.scope.menus.description":
    "Include navigation/menu items from WordPress.",
  "import.wordpress.scope.customFields.title": "Custom Fields",
  "import.wordpress.scope.customFields.description":
    "Import clean custom fields into entry frontmatter.",
  "import.wordpress.scope.seoFields.title": "SEO Fields",
  "import.wordpress.scope.seoFields.description":
    "Import supported Yoast and Rank Math metadata.",
  "import.markdown.title": "Import Markdown",
  "import.markdown.description":
    "Import Markdown or a ZIP archive into an existing collection. Content starts as draft.",
  "import.markdown.collection": "Target collection",
  "import.markdown.source": "Source",
  "import.markdown.preview": "Preview import",
  "import.markdown.apply": "Apply import",
  "import.markdown.aria": "Markdown import",
  "import.markdown.noCollections": "No collections available",
  "import.markdown.updateExisting": "Update existing entries",
  "import.markdown.updateExistingDescription":
    "Match entries by locale and slug. Otherwise, existing entries are skipped.",
  "import.markdown.checking": "Checking...",
  "import.markdown.importing": "Importing...",
  "import.markdown.summary.create": "Create",
  "import.markdown.summary.update": "Update",
  "import.markdown.summary.skip": "Skip",
  "import.markdown.summary.errors": "Errors",
  "import.markdown.summary.warnings": "Warnings",
  "import.markdown.resolveErrors":
    "Resolve the errors in the source before applying this import.",
  "import.markdown.suggestedFieldsAria": "Suggested collection fields",
  "import.markdown.addSuggestedFields": "Add suggested fields",
  "import.markdown.addSuggestedFieldsDescription":
    "Selected fields are added to the collection when you apply this import.",
} as const;

export type ImportMessageKey = keyof typeof EN_IMPORT_MESSAGES;
export type ImportMessageCatalog = Record<ImportMessageKey, string>;

export const FR_IMPORT_MESSAGES = {
  "import.wordpress.aria": "Importer du contenu",
  "import.wordpress.title": "Importation WordPress",
  "import.wordpress.description":
    "Importez une exportation WordPress WXR/XML dans le CMS Aria. Les mises en page Builder, le CSS, les codes courts et les métadonnées Builder brutes sont exclus.",
  "import.wordpress.progress": "Progression de l'importation WordPress",
  "import.wordpress.chooseAria": "Choisir une exportation WordPress",
  "import.wordpress.noXml": "Aucun fichier XML sélectionné",
  "import.wordpress.xmlHint":
    "Utilisez l'exportation XML WordPress standard depuis Outils > Exporter.",
  "import.wordpress.chooseXml": "Choisir un XML",
  "import.wordpress.analyzing": "Analyse en cours...",
  "import.wordpress.analyzeXml": "Analyser le XML",
  "import.wordpress.importing": "Importation du contenu WordPress...",
  "import.wordpress.step.source": "Source",
  "import.wordpress.step.review": "Revue",
  "import.wordpress.step.report": "Rapport",
  "import.wordpress.review.title": "Revoir le plan d'importation",
  "import.wordpress.review.description":
    "Choisissez les données WordPress propres qu'Aria doit importer. Le contenu importé commence comme brouillon.",
  "import.wordpress.review.whatToImport": "Éléments à importer",
  "import.wordpress.review.uncheckedSkipped":
    "Les lignes decochees sont ignorees",
  "import.wordpress.review.needsAttention": "A vérifier",
  "import.wordpress.review.back": "Retour",
  "import.wordpress.review.importSelected": "Importer la sélection",
  "import.wordpress.scope.posts.title": "Articles",
  "import.wordpress.scope.posts.description":
    "Créez des entrées en brouillon dans la collection d'articles.",
  "import.wordpress.scope.pages.title": "Pages",
  "import.wordpress.scope.pages.description":
    "Créez des entrées en brouillon depuis les pages WordPress.",
  "import.wordpress.scope.customPostTypes.title":
    "Types de publication personnalises",
  "import.wordpress.scope.customPostTypes.description":
    "Créez des entrées en brouillon et des collections pour le contenu CPT.",
  "import.wordpress.scope.media.title": "Medias",
  "import.wordpress.scope.media.description":
    "Autorisez les pieces jointes et les references d'image mise en avant.",
  "import.wordpress.scope.terms.title": "Termes",
  "import.wordpress.scope.terms.description":
    "Ajoutez les données de taxonomie et d'étiquettes au plan d'importation.",
  "import.wordpress.scope.authors.title": "Auteurs",
  "import.wordpress.scope.authors.description":
    "Conservez les auteurs WordPress comme données de contenu, et non comme utilisateurs authentifiés.",
  "import.wordpress.scope.menus.title": "Menus",
  "import.wordpress.scope.menus.description":
    "Incluez les éléments de navigation et de menu de WordPress.",
  "import.wordpress.scope.customFields.title": "Champs personnalises",
  "import.wordpress.scope.customFields.description":
    "Importez les champs personnalises propres dans le frontmatter des entrées.",
  "import.wordpress.scope.seoFields.title": "Champs SEO",
  "import.wordpress.scope.seoFields.description":
    "Importez les métadonnées Yoast et Rank Math prises en charge.",
  "import.markdown.title": "Importer du Markdown",
  "import.markdown.description":
    "Importez un fichier Markdown ou une archive ZIP dans une collection existante. Le contenu commence en brouillon.",
  "import.markdown.collection": "Collection cible",
  "import.markdown.source": "Source",
  "import.markdown.preview": "Prévisualiser l'importation",
  "import.markdown.apply": "Appliquer l'importation",
  "import.markdown.aria": "Importation Markdown",
  "import.markdown.noCollections": "Aucune collection disponible",
  "import.markdown.updateExisting": "Mettre à jour les entrées existantes",
  "import.markdown.updateExistingDescription":
    "Faites correspondre les entrées par langue et slug. Sinon, les entrées existantes sont ignorees.",
  "import.markdown.checking": "Vérification...",
  "import.markdown.importing": "Importation...",
  "import.markdown.summary.create": "Créer",
  "import.markdown.summary.update": "Mettre à jour",
  "import.markdown.summary.skip": "Ignorer",
  "import.markdown.summary.errors": "Erreurs",
  "import.markdown.summary.warnings": "Avertissements",
  "import.markdown.resolveErrors":
    "Resolvez les erreurs dans la source avant d'appliquer cette importation.",
  "import.markdown.suggestedFieldsAria": "Champs de collection suggeres",
  "import.markdown.addSuggestedFields": "Ajouter les champs suggeres",
  "import.markdown.addSuggestedFieldsDescription":
    "Les champs selectionnes sont ajoutes à la collection lorsque vous appliquez cette importation.",
} satisfies ImportMessageCatalog;
