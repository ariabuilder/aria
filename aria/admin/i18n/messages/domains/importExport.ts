export const EN_IMPORTEXPORT_MESSAGES = {
  "importExport.actions": "Import and export",
  "importExport.import": "Import",
  "importExport.export": "Export",
  "importExport.source": "Import source",
} as const;

export type ImportExportMessageKey = keyof typeof EN_IMPORTEXPORT_MESSAGES;
export type ImportExportMessageCatalog = Record<ImportExportMessageKey, string>;

export const FR_IMPORTEXPORT_MESSAGES = {
  "importExport.actions": "Importation et exportation",
  "importExport.import": "Importer",
  "importExport.export": "Exporter",
  "importExport.source": "Source d'importation",
} satisfies ImportExportMessageCatalog;
