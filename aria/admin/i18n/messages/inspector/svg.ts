export const EN_INSPECTOR_SVG_MESSAGES = {
  "inspector.svg.reset": "Reset SVG",
  "inspector.svg.preview": "Preview",
  "inspector.svg.replace": "Replace",
  "inspector.svg.upload": "Upload",
  "inspector.svg.empty": "Upload an SVG to preview and replace it here.",
  "inspector.svg.hint":
    "SVGs are imported inline so they stay editable and render directly on the canvas.",
  "inspector.svg.select": "Select SVG",
  "inspector.svg.selectDescription":
    "Upload or choose an SVG from your media library.",
  "inspector.svg.selectFileError": "Select an SVG file to use here.",
  "inspector.svg.importError": "Could not import that SVG.",
} as const;

export type InspectorSvgMessageKey = keyof typeof EN_INSPECTOR_SVG_MESSAGES;
export type InspectorSvgMessageCatalog = Record<InspectorSvgMessageKey, string>;

export const FR_INSPECTOR_SVG_MESSAGES = {
  "inspector.svg.reset": "Réinitialiser le SVG",
  "inspector.svg.preview": "Aperçu",
  "inspector.svg.replace": "Remplacer",
  "inspector.svg.upload": "Importer",
  "inspector.svg.empty":
    "Importez un SVG pour l’apercevoir et le remplacer ici.",
  "inspector.svg.hint":
    "Les SVG sont importés en ligne afin de rester modifiables et de s’afficher directement sur le canevas.",
  "inspector.svg.select": "Sélectionner un SVG",
  "inspector.svg.selectDescription":
    "Importez ou choisissez un SVG depuis votre bibliothèque de médias.",
  "inspector.svg.selectFileError":
    "Sélectionnez un fichier SVG à utiliser ici.",
  "inspector.svg.importError": "Impossible d’importer ce SVG.",
} satisfies InspectorSvgMessageCatalog;
