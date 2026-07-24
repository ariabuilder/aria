/**
 * Orchestrates all Inspector functionality. This is the primary
 * entry point for components needing Inspector features.
 */

import { computed, watch } from "vue";
import { isLinkableContainerNodeType, isStructuralContainerNodeType } from "../../../../lib/blocks/containerTypes";
import { useSelectedNodeState } from "../../Core";
import { useInspectorState } from "./useInspectorState";
import { useNodeMutations } from "./useNodeMutations";
import { usePropertySchema } from "./usePropertySchema";
import { useClassEditor } from "./useClassEditor";
import type {
  SelectedElementContext,
  ElementCapabilities,
  NodeTarget,
} from "../types/inspector";
import type {
  BuilderNode,
  JsonValue,
  StyleMap,
} from "../../../../lib/types/nodes";

const TEXT_ELEMENT_TYPES = new Set([
  "text",
  "heading",
  "paragraph",
  "button",
  "link",
  "span",
  "label",
]);

const HTML_TAGGABLE_NODE_TYPES = new Set([
  "text",
  "paragraph",
  "heading",
  "span",
]);

const IMAGE_ELEMENT_TYPES = new Set(["image", "img", "picture", "avatar"]);

const LINK_ELEMENT_TYPES = new Set(["link", "a", "button"]);

const CODE_ELEMENT_TYPES = new Set(["code", "pre"]);

const SVG_ELEMENT_TYPES = new Set(["svg"]);

const ICON_ELEMENT_TYPES = new Set(["icon", "i"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getComponentReferenceId(node: BuilderNode | null): string | null {
  if (!node) {
    return null;
  }

  if (typeof node.componentRef === "string" && node.componentRef.trim()) {
    return node.componentRef;
  }

  const reference = isRecord(node.reference) ? node.reference : null;
  if (reference) {
    if (typeof reference.masterId === "string" && reference.masterId.trim()) {
      return reference.masterId;
    }

    if (typeof reference.id === "string" && reference.id.trim()) {
      return reference.id;
    }
  }

  const nodeProps = isRecord(node.props) ? node.props : null;
  if (nodeProps) {
    if (
      typeof nodeProps.componentId === "string" &&
      nodeProps.componentId.trim()
    ) {
      return nodeProps.componentId;
    }

    if (
      typeof nodeProps["data-component-ref"] === "string" &&
      nodeProps["data-component-ref"].trim()
    ) {
      return nodeProps["data-component-ref"];
    }
  }

  return null;
}

function formatNodeTypeLabel(type: string | null | undefined): string {
  const value = String(type ?? "").trim();
  if (!value) {
    return "Element";
  }
  if (value.toLowerCase() === "svg") {
    return "SVG";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

let inspectorSingleton: ReturnType<typeof createInspector> | null = null;

/**
 * useInspector - Main orchestrator for Inspector feature (shared singleton)
 *
 * @example
 * ```typescript
 * const {
 *   elementContext,
 *   activeTab,
 *   setTab,
 *   updateProperty,
 *   canEdit,
 * } = useInspector();
 *
 * // Check if editing is allowed
 * if (canEdit.value) {
 *   // Update a property
 *   await updateProperty('props.title', 'New Title');
 * }
 * ```
 */
export function useInspector() {
  if (!inspectorSingleton) {
    inspectorSingleton = createInspector();
  }
  return inspectorSingleton;
}

/**
 * @internal Shared inspector implementation.
 */
function createInspector() {

  const selection = useSelectedNodeState();
  const state = useInspectorState();
  const mutations = useNodeMutations();
  const schema = usePropertySchema();
  const classEditor = useClassEditor();

  /**
   * Determine element capabilities based on node type
   */
  function getCapabilities(node: BuilderNode | null): ElementCapabilities {
    if (!node) {
      return {
        hasText: false,
        hasImage: false,
        hasLink: false,
        hasCode: false,
        hasSvg: false,
        hasIcon: false,
        hasComponent: false,
        isContainer: false,
        isComponentInstance: false,
        isSlot: false,
        supportsTypography: false,
        supportsBackground: true,
        supportsHtmlTag: false,
      };
    }

    const nodeType = node.type?.toLowerCase() ?? "";
    const componentReferenceId = getComponentReferenceId(node);

    return {
      hasText: TEXT_ELEMENT_TYPES.has(nodeType),
      hasImage: IMAGE_ELEMENT_TYPES.has(nodeType),
      hasLink:
        LINK_ELEMENT_TYPES.has(nodeType) ||
        isLinkableContainerNodeType(nodeType),
      hasCode: CODE_ELEMENT_TYPES.has(nodeType),
      hasSvg: SVG_ELEMENT_TYPES.has(nodeType),
      hasIcon: ICON_ELEMENT_TYPES.has(nodeType),
      hasComponent: nodeType === "component",
      isContainer: isStructuralContainerNodeType(nodeType),
      isComponentInstance: Boolean(componentReferenceId),
      isSlot: nodeType === "slot" || Boolean(node.slot),
      supportsTypography: TEXT_ELEMENT_TYPES.has(nodeType),
      supportsBackground:
        isStructuralContainerNodeType(nodeType) || nodeType === "body",
      supportsHtmlTag:
        isStructuralContainerNodeType(nodeType) ||
        HTML_TAGGABLE_NODE_TYPES.has(nodeType),
    };
  }

  /**
   * Full context for the selected element
   */
  const elementContext = computed<SelectedElementContext>(() => {
    const node = selection.selectedNode.value;
    const nodeId = selection.selectedNodeId.value;
    const capabilities = getCapabilities(node as BuilderNode | null);

    return {
      node: node as BuilderNode | null,
      nodeId,
      nodeType: node ? formatNodeTypeLabel(node.type) : "None",
      displayName: node ? formatNodeTypeLabel(node.type) : "No Selection",
      capabilities,
      canEdit: !capabilities.isComponentInstance,
      componentRef: getComponentReferenceId(node as BuilderNode | null),
    };
  });

  /**
   * Whether the inspector can edit the current selection
   */
  const canEdit = computed(() => elementContext.value.canEdit);

  /**
   * Whether something is selected
   */
  const hasSelection = computed(() => elementContext.value.node !== null);

  /**
   * Current node target (path + nodeId) for mutations
   * This must be provided by the parent component via context or props
   */
  let currentNodePath: {
    collection: "pages" | "layouts" | "components";
    id: string;
    version?: string;
  } | null = null;

  /**
   * Set the current document path (called by parent component)
   */
  function setDocumentPath(
    collection: "pages" | "layouts" | "components",
    id: string,
    version?: string,
  ): void {
    currentNodePath = { collection, id, version };
  }

  /**
   * Get the current document path (without requiring live canvas selection).
   */
  function getDocumentPath() {
    return currentNodePath;
  }

  /**
   * Get the current node target
   */
  function getNodeTarget(): NodeTarget | null {
    if (!currentNodePath || !elementContext.value.nodeId) {
      return null;
    }
    return {
      path: currentNodePath,
      nodeId: elementContext.value.nodeId,
    };
  }

  /**
   * Update a property on the selected node
   */
  async function updateProperty<T>(
    propertyPath: string,
    value: T,
    options?: {
      breakpoint?: string;
      description?: string;
      validate?: boolean;
      schemaKey?: string;
      /** Explicit pre-optimistic value to use for history restoration. */
      restoreValue?: unknown;
    },
  ) {
    const target = getNodeTarget();
    if (!target) {
      console.warn("[useInspector] Cannot update: no target");
      return { success: false, error: "No target" };
    }

    if (!canEdit.value) {
      console.warn("[useInspector] Cannot update: element is locked");
      return { success: false, error: "Element is locked" };
    }

    return mutations.updateProperty(
      target,
      {
        path: propertyPath,
        value: value as JsonValue | undefined,
        breakpoint: options?.breakpoint,
      },
      {
        description: options?.description ?? `Update ${propertyPath}`,
        validate: options?.validate,
        schemaKey: options?.schemaKey,
        ...(options && Object.prototype.hasOwnProperty.call(options, "restoreValue")
          ? { restoreValue: options.restoreValue }
          : {}),
      },
    );
  }

  /**
   * Update styles on the selected node
   */
  async function updateStyle(
    styles: Partial<StyleMap>,
    options?: {
      breakpoint?: string;
      description?: string;
    },
  ) {
    const target = getNodeTarget();
    if (!target) {
      return { success: false, error: "No target" };
    }

    if (!canEdit.value) {
      return { success: false, error: "Element is locked" };
    }

    return mutations.updateStyle(
      target,
      { styles, breakpoint: options?.breakpoint },
      { description: options?.description },
    );
  }

  /**
   * Update className on the selected node
   */
  async function updateClassName(
    className: string,
    options?: { description?: string },
  ) {
    const target = getNodeTarget();
    if (!target) {
      return { success: false, error: "No target" };
    }

    if (!canEdit.value) {
      return { success: false, error: "Element is locked" };
    }

    return mutations.updateClassName(target, className, options);
  }

  /**
   * Batch update multiple properties
   */
  async function batchUpdate(
    updates: Record<string, unknown>,
    options?: {
      breakpoint?: string;
      description?: string;
    },
  ) {
    const target = getNodeTarget();
    if (!target) {
      return { success: false, error: "No target" };
    }

    if (!canEdit.value) {
      return { success: false, error: "Element is locked" };
    }

    return mutations.batchUpdate(target, updates, options);
  }

  // Update inspector mode when selection changes
  watch(
    () => elementContext.value.capabilities.isComponentInstance,
    (isInstance) => {
      if (isInstance) {
        state.setLocked();
      } else {
        state.enableEditing();
      }
    },
  );

  // Remember tab preference per element type
  watch(
    () => elementContext.value.nodeType,
    (newType, oldType) => {
      if (oldType && oldType !== "none") {
        state.rememberTabForType(oldType);
      }
      if (newType && newType !== "none") {
        state.restoreTabForType(newType);
      }
    },
  );

  watch(
    () => selection.selectedNodeId.value,
    (nodeId, previousNodeId) => {
      if (!nodeId || nodeId !== previousNodeId) {
        state.resetPseudo();
      }
    },
  );

  watch(
    () => classEditor.activeClassName.value,
    (activeClassName) => {
      if (!activeClassName) {
        state.resetPseudo();
      }
    },
    { immediate: true },
  );

  return {
    elementContext,
    hasSelection,
    canEdit,

    activeTab: state.activeTab,
    mode: state.mode,
    isCollapsed: state.isCollapsed,
    expandedSections: state.expandedSections,
    selectedPseudo: state.selectedPseudo,
    isEditing: state.isEditing,
    isReadonly: state.isReadonly,
    isLocked: state.isLocked,

    setTab: state.setTab,
    previousTab: state.previousTab,
    nextTab: state.nextTab,

    isSectionExpanded: state.isSectionExpanded,
    toggleSection: state.toggleSection,
    expandSection: state.expandSection,
    collapseSection: state.collapseSection,
    expandAll: state.expandAll,
    collapseAll: state.collapseAll,

    toggleCollapsed: state.toggleCollapsed,
    collapse: state.collapse,
    expand: state.expand,

    setSelectedPseudo: state.setSelectedPseudo,
    resetPseudo: state.resetPseudo,

    // Document path (set by parent)
    setDocumentPath,
    getDocumentPath,
    getNodeTarget,

    updateProperty,
    updateStyle,
    updateClassName,
    batchUpdate,
    isUpdating: mutations.isUpdating,
    lastError: mutations.lastError,
    hasError: mutations.hasError,
    clearError: mutations.clearError,

    validate: schema.validate,
    isValid: schema.isValid,
    getDefault: schema.getDefault,
    getSchema: schema.getSchema,

    // Sub-composables (for advanced use)
    selection,
    state,
    mutations,
    schema,
  };
}
