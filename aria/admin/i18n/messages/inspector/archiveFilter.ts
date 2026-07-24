export const EN_INSPECTOR_ARCHIVEFILTER_MESSAGES = {
  "inspector.archiveFilter.label": "Archive filter",
  "inspector.archiveFilter.filter": "Filter",
  "inspector.archiveFilter.none": "None",
  "inspector.archiveFilter.tagged": "Tagged with current entry",
  "inspector.archiveFilter.referenced": "Referenced by current entry",
  "inspector.archiveFilter.field": "Field",
} as const;

export type InspectorArchiveFilterMessageKey =
  keyof typeof EN_INSPECTOR_ARCHIVEFILTER_MESSAGES;
export type InspectorArchiveFilterMessageCatalog = Record<
  InspectorArchiveFilterMessageKey,
  string
>;

export const FR_INSPECTOR_ARCHIVEFILTER_MESSAGES = {
  "inspector.archiveFilter.label": "Filtre d’archive",
  "inspector.archiveFilter.filter": "Filtrer",
  "inspector.archiveFilter.none": "Aucun",
  "inspector.archiveFilter.tagged": "Étiqueté avec l’entrée actuelle",
  "inspector.archiveFilter.referenced": "Référencé par l’entrée actuelle",
  "inspector.archiveFilter.field": "Champ",
} satisfies InspectorArchiveFilterMessageCatalog;
