export const EN_INSPECTOR_NAVITEM_MESSAGES = {
  "inspector.navItem.source": "Nav item source",
  "inspector.navItem.labelField": "Label field",
  "inspector.navItem.hrefField": "Href field",
  "inspector.navItem.dropdown": "Dropdown",
  "inspector.navItem.show": "Show",
  "inspector.navItem.all": "All",
  "inspector.navItem.desktop": "Desktop",
} as const;

export type InspectorNavItemMessageKey =
  keyof typeof EN_INSPECTOR_NAVITEM_MESSAGES;
export type InspectorNavItemMessageCatalog = Record<
  InspectorNavItemMessageKey,
  string
>;

export const FR_INSPECTOR_NAVITEM_MESSAGES = {
  "inspector.navItem.source": "Source de l’élément de navigation",
  "inspector.navItem.labelField": "Champ de libellé",
  "inspector.navItem.hrefField": "Champ d’URL",
  "inspector.navItem.dropdown": "Menu déroulant",
  "inspector.navItem.show": "Afficher",
  "inspector.navItem.all": "Tous",
  "inspector.navItem.desktop": "Bureau",
} satisfies InspectorNavItemMessageCatalog;
