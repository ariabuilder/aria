export const EN_INSPECTOR_QUERY_MESSAGES = {
  "inspector.query.entries": "Entries",
  "inspector.query.sort": "Sort",
  "inspector.query.newest": "Newest",
  "inspector.query.oldestPublished": "Oldest published",
  "inspector.query.recentlyUpdated": "Recently updated",
  "inspector.query.leastRecentlyUpdated": "Least recently updated",
  "inspector.query.newestCreated": "Newest created",
  "inspector.query.oldestCreated": "Oldest created",
  "inspector.query.titleAsc": "Title A–Z",
  "inspector.query.titleDesc": "Title Z–A",
  "inspector.query.slugAsc": "Slug A–Z",
  "inspector.query.slugDesc": "Slug Z–A",
  "inspector.query.status": "Status",
  "inspector.query.offset": "Offset",
  "inspector.query.locale": "Locale",
  "inspector.query.pageLocale": "Page locale",
} as const;

export type InspectorQueryMessageKey = keyof typeof EN_INSPECTOR_QUERY_MESSAGES;
export type InspectorQueryMessageCatalog = Record<
  InspectorQueryMessageKey,
  string
>;

export const FR_INSPECTOR_QUERY_MESSAGES = {
  "inspector.query.entries": "Entrées",
  "inspector.query.sort": "Tri",
  "inspector.query.newest": "Plus récentes",
  "inspector.query.oldestPublished": "Publications les plus anciennes",
  "inspector.query.recentlyUpdated": "Récemment mises à jour",
  "inspector.query.leastRecentlyUpdated": "Mises à jour les moins récentes",
  "inspector.query.newestCreated": "Créations les plus récentes",
  "inspector.query.oldestCreated": "Créations les plus anciennes",
  "inspector.query.titleAsc": "Titre A–Z",
  "inspector.query.titleDesc": "Titre Z–A",
  "inspector.query.slugAsc": "Slug A–Z",
  "inspector.query.slugDesc": "Slug Z–A",
  "inspector.query.status": "État",
  "inspector.query.offset": "Décalage",
  "inspector.query.locale": "Langue",
  "inspector.query.pageLocale": "Langue de la page",
} satisfies InspectorQueryMessageCatalog;
