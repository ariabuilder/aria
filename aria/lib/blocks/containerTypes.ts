const LEGACY_CONTAINER_NODE_TYPE_ALIASES: Record<string, string> = {
  Div: "Container",
  div: "container",
  Block: "Container",
  block: "container",
};

const STRUCTURAL_CONTAINER_NODE_TYPE_KEYS = new Set([
  "container",
  "section",
  "navigation",
  "nav-items",
  "nav-item",
  "nav-toggle",
  "article",
  "aside",
  "header",
  "footer",
  "main",
  "nav",
  "form",
  "fieldset",
  "grid",
  "flex",
  "stack",
  "row",
  "column",
  "card",
  "modal",
  "dialog",
  "drawer",
  "accordion",
  "tabs",
  "layout",
  "component",
  "box",
  "wrapper",
  "group",
]);

const RENDERABLE_CONTAINER_NODE_TYPE_KEYS = new Set([
  "container",
  "section",
  "navigation",
  "nav-items",
  "nav-item",
  "nav-toggle",
  "header",
  "footer",
  "nav",
  "article",
  "aside",
  "main",
]);

export function normalizeContainerNodeType(type: string): string {
  return LEGACY_CONTAINER_NODE_TYPE_ALIASES[type] ?? type;
}

function getContainerNodeTypeKey(type: string): string {
  return normalizeContainerNodeType(type).toLowerCase();
}

export function isStructuralContainerNodeType(type: string): boolean {
  return STRUCTURAL_CONTAINER_NODE_TYPE_KEYS.has(getContainerNodeTypeKey(type));
}

export function isRenderableContainerNodeType(type: string): boolean {
  return RENDERABLE_CONTAINER_NODE_TYPE_KEYS.has(getContainerNodeTypeKey(type));
}

const NAVIGATION_CONTAINER_NODE_TYPE_KEYS = new Set([
  "navigation",
  "nav-items",
  "nav-item",
  "nav-toggle",
]);

export function isLinkableContainerNodeType(type: string): boolean {
  const key = getContainerNodeTypeKey(type);
  return (
    isStructuralContainerNodeType(type) &&
    !NAVIGATION_CONTAINER_NODE_TYPE_KEYS.has(key)
  );
}
