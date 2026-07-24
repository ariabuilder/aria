export const EN_INSPECTOR_PROPS_MESSAGES = {
  "inspector.props.inheritedLoop": "Inside loop — inherits parent collection",
  "inspector.props.loop": "Loop",
  "inspector.props.array": "Array",
  "inspector.props.loopMode": "Loop mode",
  "inspector.props.static": "Static",
  "inspector.props.dynamic": "Dynamic",
  "inspector.props.collection": "Collection",
  "inspector.props.wrapLoopItem": "Wrap each looped item in a link.",
  "inspector.props.contentDetails": "Content details",
  "inspector.props.lockForContentEditing":
    "Lock this field for content editing",
  "inspector.props.lockedInContentDetail": "Locked in content detail",
  "inspector.props.editableInContentDetail": "Editable in content detail",
  "inspector.props.properties": "Properties",
  "inspector.props.elementProps": "Element props",
  "inspector.props.mode": "Mode",
  "inspector.props.bindingMode": "{{property}} binding mode",
  "inspector.props.value": "Value",
  "inspector.props.studioEditable": "Studio editable",
  "inspector.props.hiddenFromStudio": "Hidden from Studio",
  "inspector.props.chooseField": "Choose field",
  "inspector.props.noCollections": "No CMS collections are available yet.",
  "inspector.props.currentLoopItem": "Current loop item",
  "inspector.props.loadingCollections": "Loading collections",
  "inspector.props.selectCollection": "Select collection",
  "inspector.props.source": "Source",
  "inspector.props.sourceMode": "Source mode",
  "inspector.props.singleEntry": "Single entry",
  "inspector.props.loopCollection": "Loop collection",
  "inspector.props.loopsRequireContainer":
    "Loops are available on containers or elements with children.",
  "inspector.props.previewEntry": "Preview entry",
  "inspector.props.chooseEntry": "Choose entry",
  "inspector.props.cannotLoop":
    "This element cannot loop entries. Choose Static or Single Entry, or select a container.",
} as const;

export type InspectorPropsMessageKey = keyof typeof EN_INSPECTOR_PROPS_MESSAGES;
export type InspectorPropsMessageCatalog = Record<
  InspectorPropsMessageKey,
  string
>;

export const FR_INSPECTOR_PROPS_MESSAGES = {
  "inspector.props.inheritedLoop":
    "Dans une boucle — hérite de la collection parente",
  "inspector.props.loop": "Boucle",
  "inspector.props.array": "Tableau",
  "inspector.props.loopMode": "Mode de boucle",
  "inspector.props.static": "Statique",
  "inspector.props.dynamic": "Dynamique",
  "inspector.props.collection": "Collection",
  "inspector.props.wrapLoopItem":
    "Envelopper chaque élément de la boucle dans un lien.",
  "inspector.props.contentDetails": "Détails du contenu",
  "inspector.props.lockForContentEditing":
    "Verrouiller ce champ pour la modification du contenu",
  "inspector.props.lockedInContentDetail":
    "Verrouillé dans les détails du contenu",
  "inspector.props.editableInContentDetail":
    "Modifiable dans les détails du contenu",
  "inspector.props.properties": "Propriétés",
  "inspector.props.elementProps": "Propriétés de l’élément",
  "inspector.props.mode": "Mode",
  "inspector.props.bindingMode": "Mode de liaison de {{property}}",
  "inspector.props.value": "Valeur",
  "inspector.props.studioEditable": "Modifiable dans Studio",
  "inspector.props.hiddenFromStudio": "Masqué dans Studio",
  "inspector.props.chooseField": "Choisir un champ",
  "inspector.props.noCollections":
    "Aucune collection CMS n’est encore disponible.",
  "inspector.props.currentLoopItem": "Élément actuel de la boucle",
  "inspector.props.loadingCollections": "Chargement des collections",
  "inspector.props.selectCollection": "Sélectionner une collection",
  "inspector.props.source": "Source",
  "inspector.props.sourceMode": "Mode de source",
  "inspector.props.singleEntry": "Entrée unique",
  "inspector.props.loopCollection": "Boucler la collection",
  "inspector.props.loopsRequireContainer":
    "Les boucles sont disponibles sur les conteneurs ou les éléments avec enfants.",
  "inspector.props.previewEntry": "Aperçu de l’entrée",
  "inspector.props.chooseEntry": "Choisir une entrée",
  "inspector.props.cannotLoop":
    "Cet élément ne peut pas boucler les entrées. Choisissez Statique ou Entrée unique, ou sélectionnez un conteneur.",
} satisfies InspectorPropsMessageCatalog;
