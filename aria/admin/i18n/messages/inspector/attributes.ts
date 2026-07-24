export const EN_INSPECTOR_ATTRIBUTES_MESSAGES = {
  "inspector.attributes.reset": "Reset attributes",
  "inspector.attributes.tag": "Tag",
  "inspector.attributes.selectTag": "Select tag",
  "inspector.attributes.tagHint":
    "Choose the published HTML element for this node.",
  "inspector.attributes.id": "ID",
  "inspector.attributes.idHint":
    "Optional published DOM ID. Internal node IDs stay hidden.",
  "inspector.attributes.ariaLabel": "ARIA label",
  "inspector.attributes.ariaLabelPlaceholder": "Hero banner",
  "inspector.attributes.ariaLabelHint":
    "Optional accessible name for screen readers when visible text is missing or unclear.",
  "inspector.attributes.role": "Role",
  "inspector.attributes.roleHint":
    "Optional ARIA role override for advanced accessibility cases.",
  "inspector.attributes.duplicateDomId":
    "DOM ID “{{id}}” is already used by another element.",
  "inspector.attributes.invalidTag": "Invalid HTML tag.",
  "inspector.attributes.invalidDomId": "Invalid DOM ID.",
  "inspector.attributes.invalidAriaLabel": "Invalid ARIA label.",
  "inspector.attributes.invalidRole": "Use a valid ARIA role token.",
} as const;

export type InspectorAttributesMessageKey =
  keyof typeof EN_INSPECTOR_ATTRIBUTES_MESSAGES;
export type InspectorAttributesMessageCatalog = Record<
  InspectorAttributesMessageKey,
  string
>;

export const FR_INSPECTOR_ATTRIBUTES_MESSAGES = {
  "inspector.attributes.reset": "Réinitialiser les attributs",
  "inspector.attributes.tag": "Balise",
  "inspector.attributes.selectTag": "Sélectionner une balise",
  "inspector.attributes.tagHint":
    "Choisissez l’élément HTML publié pour ce nœud.",
  "inspector.attributes.id": "ID",
  "inspector.attributes.idHint":
    "ID DOM publié facultatif. Les ID internes des nœuds restent masqués.",
  "inspector.attributes.ariaLabel": "Libellé ARIA",
  "inspector.attributes.ariaLabelPlaceholder": "Bannière principale",
  "inspector.attributes.ariaLabelHint":
    "Nom accessible facultatif pour les lecteurs d’écran lorsque le texte visible est absent ou peu clair.",
  "inspector.attributes.role": "Rôle",
  "inspector.attributes.roleHint":
    "Remplacement facultatif du rôle ARIA pour les cas d’accessibilité avancés.",
  "inspector.attributes.duplicateDomId":
    "L’ID DOM « {{id}} » est déjà utilisé par un autre élément.",
  "inspector.attributes.invalidTag": "Balise HTML non valide.",
  "inspector.attributes.invalidDomId": "ID DOM non valide.",
  "inspector.attributes.invalidAriaLabel": "Libellé ARIA non valide.",
  "inspector.attributes.invalidRole": "Utilisez un jeton de rôle ARIA valide.",
} satisfies InspectorAttributesMessageCatalog;
