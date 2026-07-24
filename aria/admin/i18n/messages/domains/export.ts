export const EN_EXPORT_MESSAGES = {
  "export.aria": "Site exports",
  "export.title": "Export",
  "export.description":
    "Generate a portable archive with selectable sections: pages, CMS, media, redirects, and more.",
  "export.preset": "Preset",
  "export.preset.fullSite": "Full site",
  "export.preset.dataOnly": "Data only",
  "export.preset.codeOnly": "Code only",
  "export.preset.mediaOnly": "Media only",
  "export.preset.fullSiteDescription":
    "Complete portable archive with code, CMS, and media",
  "export.preset.dataOnlyDescription":
    "CMS collections and settings without pages or media",
  "export.preset.codeOnlyDescription":
    "Pages, layouts, and design system without CMS or media",
  "export.preset.mediaOnlyDescription":
    "Uploaded media files and site settings",
  "export.sections": "Sections",
  "export.section.pages": "Pages",
  "export.section.layouts": "Layouts",
  "export.section.components": "Components",
  "export.section.designSystem": "Design system",
  "export.section.siteSettings": "Site settings",
  "export.section.media": "Media files",
  "export.section.cms": "CMS collections",
  "export.section.redirects": "Redirects",
  "export.section.discovery": "Discovery (robots, sitemap)",
  "export.section.contentState": "Content state & ordering",
  "export.section.pageMetadata": "Page metadata",
  "export.generating": "Generating...",
  "export.generate": "Generate Export",
  "export.retention": "Retention",
  "export.retentionDescription":
    "How long exports stay available before expiring",
  "export.archives": "Exports",
  "export.archivesDescription": "Your generated portable site archives",
  "export.empty": "No exports generated",
  "export.emptyDescription":
    "Generate an export to create a downloadable archive of your entire site, including CMS content and metadata.",
  "export.deleteTitle": "Delete export?",
  "export.deleteDescription":
    "This archive will be permanently removed. You won't be able to download it again.",
} as const;

export type ExportMessageKey = keyof typeof EN_EXPORT_MESSAGES;
export type ExportMessageCatalog = Record<ExportMessageKey, string>;

export const FR_EXPORT_MESSAGES = {
  "export.aria": "Exports du site",
  "export.title": "Exporter",
  "export.description":
    "Générez une archive portable avec des sections selectionnables : pages, CMS, medias, redirections et plus encore.",
  "export.preset": "Preconfiguration",
  "export.preset.fullSite": "Site complet",
  "export.preset.dataOnly": "Données seulement",
  "export.preset.codeOnly": "Code seulement",
  "export.preset.mediaOnly": "Medias seulement",
  "export.preset.fullSiteDescription":
    "Archive portable complete avec code, CMS et medias",
  "export.preset.dataOnlyDescription":
    "Collections CMS et paramètres sans pages ni medias",
  "export.preset.codeOnlyDescription":
    "Pages, mises en page et système de conception sans CMS ni medias",
  "export.preset.mediaOnlyDescription":
    "Fichiers medias téléversés et paramètres du site",
  "export.sections": "Sections",
  "export.section.pages": "Pages",
  "export.section.layouts": "Mises en page",
  "export.section.components": "Composants",
  "export.section.designSystem": "Système de conception",
  "export.section.siteSettings": "Paramètres du site",
  "export.section.media": "Fichiers medias",
  "export.section.cms": "Collections CMS",
  "export.section.redirects": "Redirections",
  "export.section.discovery": "Découvrabilité (robots, plan du site)",
  "export.section.contentState": "État et ordre du contenu",
  "export.section.pageMetadata": "Métadonnées de page",
  "export.generating": "Génération...",
  "export.generate": "Générer l'export",
  "export.retention": "Conservation",
  "export.retentionDescription":
    "Durée de disponibilite des exports avant expiration",
  "export.archives": "Exports",
  "export.archivesDescription": "Vos archives de site portables generees",
  "export.empty": "Aucun export généré",
  "export.emptyDescription":
    "Générez un export pour créer une archive telechargeable de votre site entier, y compris le contenu CMS et les métadonnées.",
  "export.deleteTitle": "Supprimer l'export ?",
  "export.deleteDescription":
    "Cette archive sera définitivement supprimee. Vous ne pourrez plus la telecharger.",
} satisfies ExportMessageCatalog;
