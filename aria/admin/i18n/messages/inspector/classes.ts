export const EN_INSPECTOR_CLASSES_MESSAGES = {
  "inspector.classes.copyStyles": "Copy styles from active class",
  "inspector.classes.pasteStyles": "Paste copied styles",
  "inspector.classes.editCss": "Edit raw CSS for this class",
  "inspector.classes.rename": "Rename class",
  "inspector.classes.done": "Done editing class",
  "inspector.classes.moreActions": "More class actions",
  "inspector.classes.duplicateForElement": "Duplicate for element",
  "inspector.classes.removeFromNode": "Remove from node",
  "inspector.classes.context.copyStyles": "Copy styles",
  "inspector.classes.context.editCss": "Edit CSS",
  "inspector.classes.context.rename": "Rename class",
  "inspector.classes.context.duplicate": "Duplicate class",
  "inspector.classes.context.remove": "Remove class",
  "inspector.classes.add": "Add class",
  "inspector.classes.browse": "Browse classes",
  "inspector.classes.custom": "Custom",
  "inspector.classes.utilities": "Utilities",
  "inspector.classes.noMatches": "No matches",
  "inspector.classes.legacy": "Legacy classes",
  "inspector.classes.legacyHint":
    "These classes were seeded into legacy class fields, not the managed Classes list.",
  "inspector.classes.renameHint":
    "Updates every custom-class reference across pages, layouts, and components.",
  "inspector.classes.addOrCreate": "Add or create class…",
  "inspector.classes.addBreakpoint": "Add {{breakpoint}} class…",
  "inspector.classes.pasteFrom": "Paste styles from .{{className}}",
} as const;

export type InspectorClassesMessageKey =
  keyof typeof EN_INSPECTOR_CLASSES_MESSAGES;
export type InspectorClassesMessageCatalog = Record<
  InspectorClassesMessageKey,
  string
>;

export const FR_INSPECTOR_CLASSES_MESSAGES = {
  "inspector.classes.copyStyles": "Copier les styles de la classe active",
  "inspector.classes.pasteStyles": "Coller les styles de classe copiés",
  "inspector.classes.editCss": "Modifier le CSS brut de cette classe",
  "inspector.classes.rename": "Renommer la classe",
  "inspector.classes.done": "Terminer la modification de la classe",
  "inspector.classes.moreActions": "Plus d’actions sur la classe",
  "inspector.classes.duplicateForElement": "Dupliquer pour l’élément",
  "inspector.classes.removeFromNode": "Retirer du nœud",
  "inspector.classes.context.copyStyles": "Copier les styles",
  "inspector.classes.context.editCss": "Modifier le CSS",
  "inspector.classes.context.rename": "Renommer la classe",
  "inspector.classes.context.duplicate": "Dupliquer la classe",
  "inspector.classes.context.remove": "Supprimer la classe",
  "inspector.classes.add": "Ajouter une classe",
  "inspector.classes.browse": "Parcourir les classes",
  "inspector.classes.custom": "Personnalisées",
  "inspector.classes.utilities": "Utilitaires",
  "inspector.classes.noMatches": "Aucun résultat",
  "inspector.classes.legacy": "Classes héritées",
  "inspector.classes.legacyHint":
    "Ces classes ont été placées dans les champs de classes héritées, et non dans la liste Classes gérée.",
  "inspector.classes.renameHint":
    "Met à jour chaque référence de classe personnalisée sur les pages, mises en page et composants.",
  "inspector.classes.addOrCreate": "Ajouter ou créer une classe…",
  "inspector.classes.addBreakpoint": "Ajouter une classe {{breakpoint}}…",
  "inspector.classes.pasteFrom": "Coller les styles de .{{className}}",
} satisfies InspectorClassesMessageCatalog;
