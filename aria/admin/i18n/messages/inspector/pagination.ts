export const EN_INSPECTOR_PAGINATION_MESSAGES = {
  "inspector.pagination.title": "Pagination",
  "inspector.pagination.source": "Source",
  "inspector.pagination.connect": "Connect to list",
  "inspector.pagination.chooseContainer": "Choose list container",
  "inspector.pagination.perPage": "Per page",
  "inspector.pagination.inherit": "Inherit ({{count}})",
  "inspector.pagination.inheritLimit": "Inherit from list limit",
  "inspector.pagination.style": "Style",
  "inspector.pagination.numbers": "Numbers",
  "inspector.pagination.prevNext": "Previous / Next",
  "inspector.pagination.loadMore": "Load more",
  "inspector.pagination.pageButtons": "Page buttons",
} as const;

export type InspectorPaginationMessageKey =
  keyof typeof EN_INSPECTOR_PAGINATION_MESSAGES;
export type InspectorPaginationMessageCatalog = Record<
  InspectorPaginationMessageKey,
  string
>;

export const FR_INSPECTOR_PAGINATION_MESSAGES = {
  "inspector.pagination.title": "Pagination",
  "inspector.pagination.source": "Source",
  "inspector.pagination.connect": "Connecter à une liste",
  "inspector.pagination.chooseContainer": "Choisir un conteneur de liste",
  "inspector.pagination.perPage": "Par page",
  "inspector.pagination.inherit": "Hériter ({{count}})",
  "inspector.pagination.inheritLimit": "Hériter de la limite de la liste",
  "inspector.pagination.style": "Style",
  "inspector.pagination.numbers": "Numéros",
  "inspector.pagination.prevNext": "Précédent / Suivant",
  "inspector.pagination.loadMore": "Charger plus",
  "inspector.pagination.pageButtons": "Boutons de page",
} satisfies InspectorPaginationMessageCatalog;
