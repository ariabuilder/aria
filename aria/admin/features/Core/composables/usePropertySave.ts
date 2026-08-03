import {
  ref,
  computed,
  readonly,
  inject,
  type ComputedRef,
  type Ref,
} from "vue";
import {
  isEditorMutationLocked,
  trackEditorCommit,
} from "./editorCommitCoordinator";
import type {
  BuilderNode,
  JsonValue,
  NodeAccessibility,
} from "../../../../lib/types/nodes";
import {
  DEFAULT_NODE_MOTION,
  type NodeMotion,
} from "../../../../lib/motion/schemas/nodeMotion.schema";
import { useCanvasSignalBridge } from "./useCanvasSignalBridge";
import { useResponsiveTarget } from "../../../composables/useResponsiveTarget";
import { useCanonicalBreakpoints } from "../../../composables/useCanonicalBreakpoints";
import { z } from "zod";
import {
  JsonObjectSchema,
  JsonValueSchema,
} from "../../../../lib/schemas/json";
import {
  PropertySaveMutationUpdatesSchema,
  usePropertySaveHistory,
  type PropertySaveMutationUpdates,
} from "./usePropertySaveHistory";
import type {
  CanvasA11yUpdate,
  CanvasMotionUpdate,
  CanvasPropsUpdate,
  CanvasStyleUpdate,
} from "./useCanvasSignalBridge";
import { useSelectedNodeState } from "./useSelectedNodeState";
import { useSelectionTreeState } from "./useSelectionTreeState";
import { APP_INJECTION_KEYS } from "../types/injectionKeys";
import type { EditorNodeRegistry } from "../types/injectionKeys";
import { normalizeResponsiveStyleMap } from "../../../../lib/blocks/normalizeResponsiveStyleMap";
import { buildDesktopFirstCascadeStyleMutation } from "../../../../lib/styles/responsiveCascade";
import { DESKTOP_BASE_BREAKPOINT } from "../../../../lib/styles/responsiveBreakpoints";
import { getComputedValue } from "../utils/responsive";
import { log } from "@/lib/utils/logger";

type ItemType = "page" | "layout" | "component";

type CollectionName = "pages" | "layouts" | "components";

interface PropertySaveOptions {
  debug?: boolean;
  /** Auto-send canvas updates on successful saves */
  autoNotifyCanvas?: boolean;
}

export interface UsePropertySaveReturn {
  readonly selectedNode: ComputedRef<BuilderNode | null>;
  readonly selectedNodeId: Readonly<Ref<string | null>>;
  readonly selectedNodeIds: Readonly<Ref<string[]>>;
  readonly selectedNodes: Readonly<ComputedRef<BuilderNode[]>>;
  readonly breakpointName: ComputedRef<string>;
  readonly isLoading: Readonly<Ref<boolean>>;
  readonly error: Readonly<Ref<string | null>>;
  readonly isSaving: ComputedRef<boolean>;
  readonly hasTarget: ComputedRef<boolean>;
  readonly saveProperty: (
    propertyName: string,
    value: unknown,
    itemType?: ItemType,
    itemSlug?: string,
    targetNodeId?: string,
  ) => Promise<boolean>;
  readonly saveProperties: (
    updates: Record<string, unknown>,
    itemType?: ItemType,
    itemSlug?: string,
    targetNodeId?: string,
  ) => Promise<boolean>;
  readonly previewStyleProperties: (
    updates: Record<string, string | undefined>,
    targetNodeId?: string,
  ) => boolean;
  readonly previewResponsiveStyleUpdates: (
    styles: CanvasStyleUpdate["styles"],
    targetNodeId?: string,
  ) => boolean;
  readonly previewProps: (
    updates: Record<string, JsonValue>,
    targetNodeId?: string,
  ) => boolean;
  readonly saveNodeUpdates: (
    updates: PropertySaveMutationUpdates,
    itemType?: ItemType,
    itemSlug?: string,
    targetNodeId?: string,
  ) => Promise<boolean>;
  readonly clearError: () => void;
  readonly isStyleProperty: (
    propertyName: string,
  ) => propertyName is StylePropertyName;
  readonly getComputedStyleValue: (
    propertyName: string,
    fallback?: string,
    breakpoint?: string,
    targetNodeId?: string,
  ) => string | undefined;
}

interface NodePathContext {
  /** Collection name (pages, layouts, or components) */
  collection: CollectionName;
  id: string;
}

/**
 * CSS and style-related properties.
 * These are stored in the `styles` object with breakpoint-specific values.
 */
const STYLE_PROPERTY_NAMES = [
  "fontSize",
  "fontWeight",
  "fontFamily",
  "lineHeight",
  "textAlign",
  "letterSpacing",
  "textDecoration",
  "textTransform",
  "textWrap",
  "textUnderlineOffset",

  "color",
  "backgroundColor",
  "background",
  "backgroundImage",
  "backgroundSize",
  "backgroundPosition",
  "backgroundRepeat",
  "backgroundAttachment",
  "backgroundBlendMode",
  "borderColor",

  "display",
  "visibility",
  "flexDirection",
  "flexWrap",
  "justifyContent",
  "alignItems",
  "alignContent",
  "justifyItems",
  "gap",
  "flowTolerance",
  "gridColumn",
  "grid",
  "gridTemplateColumns",
  "gridTemplateRows",
  "listStyleType",
  "listStylePosition",

  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",

  "width",
  "height",
  "widthSizing",
  "heightSizing",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "alignSelf",
  "justifySelf",
  "objectFit",
  "objectPosition",

  "border",
  "borderWidth",
  "borderStyle",
  "borderRadius",
  "cornerShape",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",

  "boxShadow",
  "opacity",
  "transform",
  "transformOrigin",
  "transition",
  "filter",
  "backdropFilter",

  "position",
  "top",
  "right",
  "bottom",
  "left",
  "zIndex",
] as const;

type StylePropertyName = (typeof STYLE_PROPERTY_NAMES)[number];
type PropertyInputValue = z.infer<typeof PropertyInputValueSchema>;

const STYLE_PROPERTIES = new Set<StylePropertyName>(STYLE_PROPERTY_NAMES);

const HISTORY_PROPERTY_GROUP_LABELS: Array<{
  label: string;
  properties: readonly string[];
}> = [
  {
    label: "Visibility",
    properties: ["display", "visibility"],
  },
  {
    label: "Opacity",
    properties: ["opacity"],
  },
  {
    label: "Content",
    properties: ["text", "content", "label", "level"],
  },
  {
    label: "Typography",
    properties: [
      "fontSize",
      "fontWeight",
      "fontFamily",
      "lineHeight",
      "textAlign",
      "letterSpacing",
      "textDecoration",
      "textTransform",
      "color",
    ],
  },
  {
    label: "List",
    properties: ["ordered", "listStyleType", "listStylePosition"],
  },
  {
    label: "Size",
    properties: [
      "width",
      "height",
      "minWidth",
      "maxWidth",
      "minHeight",
      "maxHeight",
    ],
  },
  {
    label: "Spacing",
    properties: [
      "padding",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "margin",
      "marginTop",
      "marginRight",
      "marginBottom",
      "marginLeft",
      "gap",
    ],
  },
  {
    label: "Background",
    properties: [
      "background",
      "backgroundColor",
      "backgroundImage",
      "backgroundSize",
      "backgroundPosition",
      "backgroundRepeat",
      "backgroundAttachment",
      "backgroundBlendMode",
    ],
  },
  {
    label: "Border",
    properties: [
      "border",
      "borderWidth",
      "borderStyle",
      "borderColor",
      "borderRadius",
      "cornerShape",
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius",
    ],
  },
  {
    label: "Shadow",
    properties: ["boxShadow"],
  },
  {
    label: "Layout",
    properties: [
      "flexDirection",
      "flexWrap",
      "justifyContent",
      "alignItems",
      "alignContent",
      "justifyItems",
      "flowTolerance",
      "gridColumn",
      "grid",
      "gridTemplateColumns",
      "gridTemplateRows",
      "position",
      "top",
      "right",
      "bottom",
      "left",
      "zIndex",
      "overflow",
      "transform",
      "transformOrigin",
      "transition",
      "filter",
      "backdropFilter",
    ],
  },
  {
    label: "Image",
    properties: ["src", "alt", "objectFit", "objectPosition"],
  },
  {
    label: "Link",
    properties: ["href", "target", "rel"],
  },
  {
    label: "Icon",
    properties: ["icon"],
  },
  {
    label: "Code",
    properties: ["code", "content", "language"],
  },
  {
    label: "SVG",
    properties: ["svg", "viewBox", "pathData"],
  },
  {
    label: "Attributes",
    properties: ["tag", "element", "id", "ariaLabel", "role"],
  },
  {
    label: "Component",
    properties: ["componentId", "componentSlug"],
  },
];

const HISTORY_PROPERTY_GROUPS = HISTORY_PROPERTY_GROUP_LABELS.reduce(
  (groups, { label, properties }) => {
    for (const property of properties) {
      if (!groups.has(property)) {
        groups.set(property, label);
      }
    }

    return groups;
  },
  new Map<string, string>(),
);

/**
 * Collection name mapping from item type.
 */
const COLLECTION_MAP: Record<ItemType, CollectionName> = {
  page: "pages",
  layout: "layouts",
  component: "components",
} as const;

const ItemTypeSchema = z.enum(["page", "layout", "component"]);
const PropertyInputValueSchema = z.union([JsonValueSchema, z.undefined()]);
const SavePropertiesInputSchema = z.object({
  updates: z
    .record(z.string().min(1), PropertyInputValueSchema)
    .refine((value) => Object.keys(value).length > 0, {
      message: "No properties to update",
    }),
  itemType: ItemTypeSchema,
  itemSlug: z.string().min(1),
});

/**
 * Checks if a property is a style property.
 *
 * @param propertyName - Property name to check
 * @returns True if property is a style property
 */
function isStyleProperty(
  propertyName: string,
): propertyName is StylePropertyName {
  return STYLE_PROPERTIES.has(propertyName as StylePropertyName);
}

function normalizeStyleValue(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }

  return typeof value === "string" ? value : String(value);
}

export function getHistoryPropertyGroupLabel(propertyName: string): string {
  return HISTORY_PROPERTY_GROUPS.get(propertyName) ?? "Properties";
}

export function buildPropertyHistoryDescription(options: {
  propertyNames: readonly string[];
  breakpoint?: string | null;
  breakpointLabelMap?: Readonly<Record<string, string>>;
}): string {
  const labels = Array.from(
    new Set(options.propertyNames.map(getHistoryPropertyGroupLabel)),
  );

  return labels.length === 1 ? `${labels[0]} updated` : "Properties updated";
}

/**
 * Validates item type.
 *
 * @param itemType - Item type to validate
 * @returns True if valid item type
 */
function isValidItemType(itemType: unknown): itemType is ItemType {
  return (
    itemType === "page" || itemType === "layout" || itemType === "component"
  );
}

/**
 * Validates required context parameters.
 *
 * @param itemType - Item type
 * @param itemSlug - Item slug
 * @returns True if both are valid
 */
function hasValidContext(itemType: unknown, itemSlug: unknown): boolean {
  return (
    isValidItemType(itemType) &&
    typeof itemSlug === "string" &&
    itemSlug.length > 0
  );
}

function findNodeInSelectionTree(
  nodes: unknown,
  targetNodeId: string,
): BuilderNode | null {
  const stack: BuilderNode[] = Array.isArray(nodes)
    ? [...(nodes as BuilderNode[])]
    : [];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (node.id === targetNodeId) {
      return node;
    }

    if (node.children.length > 0) {
      stack.push(...node.children);
    }
  }

  return null;
}

/**
 * Property save manager for Aria builder.
 *
 * Persist property edits, including per-breakpoint values.
 * Integrates with Astro actions for persistence and signals for live canvas updates.
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * const propertySave = usePropertySave({ debug: true });
 *
 * // Save single property
 * await propertySave.saveProperty(
 *   'fontSize',
 *   '16px',
 *   'page',
 *   'home'
 * );
 *
 * // Save multiple properties
 * await propertySave.saveProperties(
 *   { fontSize: '16px', color: '#333' },
 *   'page',
 *   'home'
 * );
 * ```
 */
export function usePropertySave(
  options: PropertySaveOptions = {},
): UsePropertySaveReturn {
  const { debug = false, autoNotifyCanvas = true } = options;

  const {
    selectedNode,
    selectedNodeId,
    selectedNodeIds,
    selectedNodes,
    updateSelectedNodeProps,
    updateSelectedNodeStyles,
    updateSelectedNodeA11y,
    updateSelectedNodeMotion,
    updateSelectedNodeMetadata,
  } = useSelectedNodeState();
  const { selectionTreeRootNodes } = useSelectionTreeState();
  const editorNodeRegistry = inject<EditorNodeRegistry | null>(
    APP_INJECTION_KEYS.editorNodeRegistry,
    null,
  );
  const {
    signalA11yUpdate,
    signalMotionUpdate,
    signalPropsUpdate,
    signalStyleUpdate,
  } = useCanvasSignalBridge();
  const { targetBreakpoint } = useResponsiveTarget();
  const { activeBreakpoints } = useCanonicalBreakpoints({ autoLoad: true });
  const { executePropertySaveMutation, executePropertySaveBatchMutation } =
    usePropertySaveHistory();

  const isLoading = ref(false);
  const error = ref<string | null>(null);

  /**
   * Current breakpoint name from viewport.
   * Uses the canonical breakpoint id for the active viewport.
   */
  const breakpointName = computed<string>(() => {
    return targetBreakpoint.value || "base";
  });

  /**
   * Whether a save operation is in progress.
   */
  const isSaving = computed<boolean>(() => {
    return isLoading.value;
  });

  /**
   * Whether there's a selected node to save properties to.
   */
  const hasTarget = computed<boolean>(() => {
    return selectedNodeIds.value.length > 0 || selectedNodeId.value !== null;
  });

  function resolveTargetNodeId(targetNodeId?: string): string | null {
    return targetNodeId ?? selectedNodeId.value;
  }

  function resolveTargetNodeIds(targetNodeId?: string): string[] {
    if (targetNodeId) {
      return [targetNodeId];
    }

    if (selectedNodeIds.value.length > 0) {
      return [...selectedNodeIds.value];
    }

    return selectedNodeId.value ? [selectedNodeId.value] : [];
  }

  function getTargetNode(targetNodeId?: string): BuilderNode | null {
    const resolvedNodeId = resolveTargetNodeId(targetNodeId);
    if (!resolvedNodeId) {
      return null;
    }

    if (resolvedNodeId === selectedNodeId.value) {
      return selectedNode.value;
    }

    const fromSelectionTree = findNodeInSelectionTree(
      selectionTreeRootNodes.value,
      resolvedNodeId,
    );
    if (fromSelectionTree) {
      return fromSelectionTree;
    }

    return editorNodeRegistry?.findNode(resolvedNodeId) ?? null;
  }

  function getSelectedPropValue(
    propertyName: string,
    targetNodeId?: string,
  ): JsonValue | undefined {
    const value = getTargetNode(targetNodeId)?.props?.[propertyName];
    return JsonValueSchema.safeParse(value).success
      ? (value as JsonValue | undefined)
      : undefined;
  }

  function getSelectedStyleValue(
    propertyName: string,
    breakpoint: string,
    targetNodeId?: string,
  ): string | undefined {
    const rawValue = getTargetNode(targetNodeId)?.styles?.[propertyName];

    if (typeof rawValue === "string") {
      return breakpoint === DESKTOP_BASE_BREAKPOINT ? rawValue : undefined;
    }

    const value = normalizeResponsiveStyleMap(rawValue)[breakpoint];
    return typeof value === "string" ? value : undefined;
  }

  function buildCascadeStyleUpdatesForProperties(
    updates: Record<string, PropertyInputValue>,
    breakpoint: string,
    node: BuilderNode | null,
  ): NonNullable<PropertySaveMutationUpdates["styles"]> {
    const styles: NonNullable<PropertySaveMutationUpdates["styles"]> = {};

    for (const [propertyName, value] of Object.entries(updates)) {
      if (!isStyleProperty(propertyName)) {
        continue;
      }

      const normalizedValue = normalizeStyleValue(value);
      const cascadeMutation = buildDesktopFirstCascadeStyleMutation(
        activeBreakpoints.value,
        propertyName,
        breakpoint,
        normalizedValue,
        node?.styles?.[propertyName],
      );

      if (cascadeMutation?.[propertyName]) {
        styles[propertyName] = cascadeMutation[propertyName];
        continue;
      }

      styles[propertyName] = {
        [breakpoint]: normalizedValue,
      };
    }

    return styles;
  }

  function buildRestoreStylesForMutation(
    styles: NonNullable<PropertySaveMutationUpdates["styles"]>,
    nodeId: string,
  ): NonNullable<PropertySaveMutationUpdates["styles"]> {
    const restored: NonNullable<PropertySaveMutationUpdates["styles"]> = {};

    for (const [propertyName, breakpointValues] of Object.entries(styles)) {
      restored[propertyName] = Object.fromEntries(
        Object.keys(breakpointValues ?? {}).map((breakpoint) => [
          breakpoint,
          getSelectedStyleValue(propertyName, breakpoint, nodeId),
        ]),
      );
    }

    return restored;
  }

  function getSelectedA11yValue(
    propertyName: keyof NonNullable<NodeAccessibility>,
    targetNodeId?: string,
  ):
    | NonNullable<NodeAccessibility>[keyof NonNullable<NodeAccessibility>]
    | undefined {
    return getTargetNode(targetNodeId)?.a11y?.[propertyName];
  }

  function getSelectedMotionValue(targetNodeId?: string): NodeMotion {
    return getTargetNode(targetNodeId)?.motion ?? DEFAULT_NODE_MOTION;
  }

  function getComputedStyleValue(
    propertyName: string,
    fallback?: string,
    breakpoint: string = breakpointName.value,
    targetNodeId?: string,
  ): string | undefined {
    const value = getTargetNode(targetNodeId)?.styles?.[propertyName];

    if (typeof value === "string") {
      return value;
    }

    if (!value || typeof value !== "object") {
      return fallback;
    }

    const resolvedValue = getComputedValue<string>(
      normalizeResponsiveStyleMap(value),
      breakpoint,
      activeBreakpoints.value,
    );

    return typeof resolvedValue === "string" ? resolvedValue : fallback;
  }

  function resolveValidatedTargetNodeIds(
    targetNodeId?: string,
  ): string[] | null {
    const nodeIds = resolveTargetNodeIds(targetNodeId);
    if (nodeIds.length === 0) {
      error.value = "No node selected";
      return null;
    }

    const missingNodeId = nodeIds.find((nodeId) => !getTargetNode(nodeId));
    if (missingNodeId) {
      error.value = "No node selected";
      if (debug) {
        log("debug", "[usePropertySave] Target node missing", {
          nodeId: missingNodeId,
        });
      }
      return null;
    }

    return nodeIds;
  }

  /**
   * Builds node path context from item type and slug.
   *
   * @param itemType - Type of item (page/layout/component)
   * @param itemSlug - Item slug identifier
   * @returns Node path context or null if invalid
   */
  function buildNodePath(
    itemType?: ItemType,
    itemSlug?: string,
  ): NodePathContext | null {
    if (!itemType || !itemSlug || !hasValidContext(itemType, itemSlug)) {
      if (debug) {
        log("debug", "[usePropertySave] Invalid context", {
          itemType,
          itemSlug,
        });
      }
      return null;
    }

    return {
      collection: COLLECTION_MAP[itemType],
      id: itemSlug,
    };
  }

  /**
   * Notifies canvas of style changes for live preview.
   *
   * @param nodeId - Target node ID
   * @param propertyName - Updated property name
   * @param value - New property value
   * @param breakpoint - Active breakpoint
   */

  function notifyCanvasResponsiveStyleUpdates(
    nodeId: string,
    styles: NonNullable<PropertySaveMutationUpdates["styles"]>,
  ): void {
    if (!autoNotifyCanvas) {
      return;
    }

    const responsiveStyles: CanvasStyleUpdate["styles"] = {};

    for (const [propertyName, breakpointValues] of Object.entries(styles)) {
      if (!breakpointValues || typeof breakpointValues !== "object") {
        continue;
      }

      for (const [breakpoint, value] of Object.entries(breakpointValues)) {
        responsiveStyles[breakpoint] = {
          ...(responsiveStyles[breakpoint] ?? {}),
          [propertyName]: value,
        };
      }
    }

    if (Object.keys(responsiveStyles).length === 0) {
      return;
    }

    const payload: CanvasStyleUpdate = {
      nodeId,
      styles: responsiveStyles,
    };

    signalStyleUpdate(payload);

    if (debug) {
      log(
        "debug",
        "[usePropertySave] Canvas responsive styles notified",
        payload,
      );
    }
  }

  function previewResponsiveStyleUpdates(
    styles: CanvasStyleUpdate["styles"],
    targetNodeId?: string,
  ): boolean {
    const nodeIds = resolveValidatedTargetNodeIds(targetNodeId);
    if (!nodeIds || Object.keys(styles).length === 0) {
      return false;
    }

    for (const nodeId of nodeIds) {
      signalStyleUpdate({
        nodeId,
        styles,
      });
    }

    return true;
  }

  /**
   * Notifies canvas of prop changes for live preview.
   *
   * @param nodeId - Target node ID
   * @param updates - Updated prop key-values
   */
  function notifyCanvasPropsUpdate(
    nodeId: string,
    updates: Record<string, JsonValue | undefined>,
  ): void {
    if (!autoNotifyCanvas) return;

    const parsedProps = JsonObjectSchema.safeParse(
      JSON.parse(JSON.stringify(updates)),
    );
    if (!parsedProps.success || Object.keys(parsedProps.data).length === 0) {
      return;
    }

    const payload: CanvasPropsUpdate = {
      nodeId,
      props: parsedProps.data,
    };

    signalPropsUpdate(payload);

    if (debug) {
      log("debug", "[usePropertySave] Canvas props notified", payload);
    }
  }

  function notifyCanvasA11yUpdate(
    nodeId: string,
    updates: Partial<NonNullable<NodeAccessibility>>,
  ): void {
    if (!autoNotifyCanvas || Object.keys(updates).length === 0) return;

    const payload: CanvasA11yUpdate = {
      nodeId,
      a11y: updates,
    };

    signalA11yUpdate(payload);

    if (debug) {
      log("debug", "[usePropertySave] Canvas a11y notified", payload);
    }
  }

  function notifyCanvasMotionUpdate(nodeId: string, motion: NodeMotion): void {
    if (!autoNotifyCanvas) return;

    const payload: CanvasMotionUpdate = {
      nodeId,
      motion,
    };

    signalMotionUpdate(payload);

    if (debug) {
      log("debug", "[usePropertySave] Canvas motion notified", payload);
    }
  }

  interface PropertySaveTargetMutation {
    target: {
      collection: CollectionName;
      id: string;
      nodeId: string;
    };
    updates: PropertySaveMutationUpdates;
    restoreUpdates: PropertySaveMutationUpdates;
  }

  function applyStructuredUpdatesForTargets(
    targets: readonly PropertySaveTargetMutation[],
    mutationKey: "updates" | "restoreUpdates",
    _breakpoint: string,
  ): void {
    for (const target of targets) {
      const appliedUpdates = target[mutationKey];

      updateSelectedNodeStyles(
        target.target.nodeId,
        appliedUpdates.styles ?? {},
      );
      updateSelectedNodeProps(target.target.nodeId, appliedUpdates.props ?? {});
      updateSelectedNodeA11y(target.target.nodeId, appliedUpdates.a11y ?? {});

      if (appliedUpdates.motion) {
        updateSelectedNodeMotion(target.target.nodeId, appliedUpdates.motion);
      }

      if (Object.prototype.hasOwnProperty.call(appliedUpdates, "metadata")) {
        updateSelectedNodeMetadata(
          target.target.nodeId,
          appliedUpdates.metadata,
        );
      }

      if (appliedUpdates.styles) {
        notifyCanvasResponsiveStyleUpdates(
          target.target.nodeId,
          appliedUpdates.styles,
        );
      }

      if (appliedUpdates.props) {
        notifyCanvasPropsUpdate(target.target.nodeId, appliedUpdates.props);
      }

      if (appliedUpdates.a11y) {
        notifyCanvasA11yUpdate(target.target.nodeId, appliedUpdates.a11y);
      }

      if (appliedUpdates.motion) {
        notifyCanvasMotionUpdate(target.target.nodeId, appliedUpdates.motion);
      }
    }
  }

  async function saveNodeUpdates(
    updates: PropertySaveMutationUpdates,
    itemType?: ItemType,
    itemSlug?: string,
    targetNodeId?: string,
  ): Promise<boolean> {
    const targetNodeIds = resolveValidatedTargetNodeIds(targetNodeId);
    if (!targetNodeIds) {
      error.value = "No node selected";
      if (debug) {
        log(
          "debug",
          "[usePropertySave] Structured save skipped: no node selected",
        );
      }
      return false;
    }

    const nodePath = buildNodePath(itemType, itemSlug);
    if (!nodePath) {
      error.value = "Missing context (itemType/itemSlug)";
      return false;
    }

    const validation = PropertySaveMutationUpdatesSchema.safeParse(updates);
    if (!validation.success) {
      error.value =
        validation.error.issues[0]?.message ??
        "Invalid structured update payload";
      if (debug) {
        log("warn", "[usePropertySave] Invalid structured payload", {
          issues: validation.error.issues,
        });
      }
      return false;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const currentBreakpoint = breakpointName.value;
      const validatedUpdates = validation.data;
      const touchedPropertyNames = [
        ...Object.keys(validatedUpdates.props ?? {}),
        ...Object.keys(validatedUpdates.styles ?? {}),
        ...Object.keys(validatedUpdates.a11y ?? {}),
        ...(validatedUpdates.motion ? ["motion"] : []),
        ...(Object.prototype.hasOwnProperty.call(validatedUpdates, "metadata")
          ? ["media"]
          : []),
      ];
      const breakpointLabelMap = Object.fromEntries(
        activeBreakpoints.value.map((breakpoint) => [
          breakpoint.name,
          breakpoint.label ?? breakpoint.name,
        ]),
      );

      const targets: PropertySaveTargetMutation[] = targetNodeIds.map(
        (nodeId) => ({
          target: {
            collection: nodePath.collection,
            id: nodePath.id,
            nodeId,
          },
          updates: validatedUpdates,
          restoreUpdates: {
            ...(validatedUpdates.props
              ? {
                  props: Object.fromEntries(
                    Object.keys(validatedUpdates.props).map((key) => [
                      key,
                      getSelectedPropValue(key, nodeId),
                    ]),
                  ),
                }
              : {}),
            ...(validatedUpdates.styles
              ? {
                  styles: Object.fromEntries(
                    Object.entries(validatedUpdates.styles).map(
                      ([key, breakpointValues]) => [
                        key,
                        Object.fromEntries(
                          Object.keys(breakpointValues ?? {}).map(
                            (breakpoint) => [
                              breakpoint,
                              getSelectedStyleValue(key, breakpoint, nodeId),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                }
              : {}),
            ...(validatedUpdates.a11y
              ? {
                  a11y: Object.fromEntries(
                    Object.keys(validatedUpdates.a11y).map((key) => [
                      key,
                      getSelectedA11yValue(
                        key as keyof NonNullable<NodeAccessibility>,
                        nodeId,
                      ),
                    ]),
                  ),
                }
              : {}),
            ...(validatedUpdates.motion
              ? {
                  motion: getSelectedMotionValue(nodeId),
                }
              : {}),
            ...(Object.prototype.hasOwnProperty.call(
              validatedUpdates,
              "metadata",
            )
              ? {
                  metadata: getTargetNode(nodeId)?.metadata,
                }
              : {}),
          },
        }),
      );

      const executeResult = await (targets.length === 1
        ? executePropertySaveMutation({
            metadata: {
              type: "batch-nodes",
              description: buildPropertyHistoryDescription({
                propertyNames: touchedPropertyNames,
                breakpoint: validatedUpdates.styles ? currentBreakpoint : null,
                breakpointLabelMap,
              }),
              affectedNodeIds: targetNodeIds,
            },
            target: targets[0].target,
            updates: targets[0].updates,
            restoreUpdates: targets[0].restoreUpdates,
            breakpoint: currentBreakpoint,
            onUndo: async () => {
              applyStructuredUpdatesForTargets(
                targets,
                "restoreUpdates",
                currentBreakpoint,
              );
            },
            onRedo: async () => {
              applyStructuredUpdatesForTargets(
                targets,
                "updates",
                currentBreakpoint,
              );
            },
          })
        : executePropertySaveBatchMutation({
            metadata: {
              type: "batch-nodes",
              description: buildPropertyHistoryDescription({
                propertyNames: touchedPropertyNames,
                breakpoint: validatedUpdates.styles ? currentBreakpoint : null,
                breakpointLabelMap,
              }),
              affectedNodeIds: targetNodeIds,
            },
            targets,
            breakpoint: currentBreakpoint,
            onUndo: async () => {
              applyStructuredUpdatesForTargets(
                targets,
                "restoreUpdates",
                currentBreakpoint,
              );
            },
            onRedo: async () => {
              applyStructuredUpdatesForTargets(
                targets,
                "updates",
                currentBreakpoint,
              );
            },
          }));

      if (!executeResult.success) {
        error.value =
          executeResult.error || "Failed to execute structured update";
        return false;
      }

      if (debug) {
        log("debug", "[usePropertySave] Structured save successful", {
          updates: validatedUpdates,
          breakpoint: currentBreakpoint,
          nodeIds: targetNodeIds,
          context: nodePath,
        });
      }

      // Notify the canvas for live updates immediately after save
      if (validatedUpdates.motion) {
        for (const nodeId of targetNodeIds) {
          notifyCanvasMotionUpdate(nodeId, validatedUpdates.motion);
        }
      }

      return true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unexpected structured save error";
      error.value = errorMessage;

      log("error", "[usePropertySave] Structured save exception", {
        error: err,
        message: errorMessage,
        stack: err instanceof Error ? err.stack : undefined,
      });

      return false;
    } finally {
      isLoading.value = false;
    }
  }

  function previewStyleProperties(
    updates: Record<string, string | undefined>,
    targetNodeId?: string,
  ): boolean {
    const nodeIds = resolveValidatedTargetNodeIds(targetNodeId);
    if (!nodeIds) {
      return false;
    }

    const currentBreakpoint = breakpointName.value;
    const styleEntries = Object.entries(updates).filter(([propertyName]) =>
      isStyleProperty(propertyName),
    );

    if (styleEntries.length === 0) {
      return false;
    }

    for (const nodeId of nodeIds) {
      const node = getTargetNode(nodeId);
      const cascadeStyles = buildCascadeStyleUpdatesForProperties(
        Object.fromEntries(styleEntries),
        currentBreakpoint,
        node ?? null,
      );

      notifyCanvasResponsiveStyleUpdates(nodeId, cascadeStyles);
    }

    return true;
  }

  function previewProps(
    updates: Record<string, JsonValue>,
    targetNodeId?: string,
  ): boolean {
    const nodeIds = resolveValidatedTargetNodeIds(targetNodeId);
    if (!nodeIds) {
      return false;
    }

    const propEntries = Object.entries(updates).filter(
      ([, value]) => JsonValueSchema.safeParse(value).success,
    );

    if (propEntries.length === 0) {
      return false;
    }

    for (const nodeId of nodeIds) {
      notifyCanvasPropsUpdate(
        nodeId,
        Object.fromEntries(propEntries) as Record<string, JsonValue>,
      );
    }

    return true;
  }

  /**
   * Saves a single property value to storage.
   *
   * Automatically detects whether property is a style or prop.
   * Style properties are saved with breakpoint-specific values.
   * Props are saved globally without breakpoints.
   *
   * @param propertyName - Property name to update
   * @param value - New property value
   * @param itemType - Current item type
   * @param itemSlug - Current item slug
   * @returns Promise resolving to success boolean
   *
   * @example
   * ```ts
   * const success = await saveProperty(
   *   'fontSize',
   *   '18px',
   *   'page',
   *   'home'
   * );
   *
   * if (success) {
   *   console.log('Saved successfully!');
   * }
   * ```
   */
  async function saveProperty(
    propertyName: string,
    value: unknown,
    itemType?: ItemType,
    itemSlug?: string,
    targetNodeId?: string,
  ): Promise<boolean> {
    const targetNodeIds = resolveValidatedTargetNodeIds(targetNodeId);
    if (!targetNodeIds) {
      error.value = "No node selected";
      if (debug) {
        log("debug", "[usePropertySave] Save skipped: no node selected");
      }
      return false;
    }

    const nodePath = buildNodePath(itemType, itemSlug);
    if (!nodePath) {
      error.value = "Missing context (itemType/itemSlug)";
      return false;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const isStyle = isStyleProperty(propertyName);
      const currentBreakpoint = breakpointName.value;
      const parsedValue = isStyle
        ? ({ success: true, data: value as PropertyInputValue } as const)
        : PropertyInputValueSchema.safeParse(value);

      if (!parsedValue.success) {
        error.value = parsedValue.error.issues[0]?.message ?? "Invalid value";
        return false;
      }

      const nextValue = parsedValue.data;

      if (debug) {
        log("debug", "[usePropertySave] Saving property", {
          propertyName,
          value: nextValue,
          isStyle,
          breakpoint: currentBreakpoint,
          nodeIds: targetNodeIds,
          context: nodePath,
        });
      }

      const breakpointLabelMap = Object.fromEntries(
        activeBreakpoints.value.map((breakpoint) => [
          breakpoint.name,
          breakpoint.label ?? breakpoint.name,
        ]),
      );

      const targets = targetNodeIds.map((nodeId) => {
        const node = getTargetNode(nodeId);
        const oldValue = isStyle
          ? getSelectedStyleValue(propertyName, currentBreakpoint, nodeId)
          : getSelectedPropValue(propertyName, nodeId);

        const styleUpdates = isStyle
          ? buildCascadeStyleUpdatesForProperties(
              { [propertyName]: nextValue },
              currentBreakpoint,
              node ?? null,
            )
          : undefined;

        return {
          target: {
            collection: nodePath.collection,
            id: nodePath.id,
            nodeId,
          },
          updates: isStyle
            ? { styles: styleUpdates }
            : {
                props: {
                  [propertyName]: nextValue,
                },
              },
          restoreUpdates: isStyle
            ? {
                styles: buildRestoreStylesForMutation(
                  styleUpdates ?? {},
                  nodeId,
                ),
              }
            : {
                props: {
                  [propertyName]: oldValue,
                },
              },
          oldValue,
        };
      });

      const executeResult = await (targets.length === 1
        ? executePropertySaveMutation({
            metadata: {
              type: isStyle ? "update-node-styles" : "update-node-props",
              description: buildPropertyHistoryDescription({
                propertyNames: [propertyName],
                breakpoint: isStyle ? currentBreakpoint : null,
                breakpointLabelMap,
              }),
              affectedNodeIds: targetNodeIds,
            },
            target: targets[0].target,
            updates: targets[0].updates,
            restoreUpdates: targets[0].restoreUpdates,
            breakpoint: currentBreakpoint,
            onUndo: async () => {
              for (const target of targets) {
                if (isStyle) {
                  updateSelectedNodeStyles(
                    target.target.nodeId,
                    target.restoreUpdates.styles ?? {},
                  );
                  notifyCanvasResponsiveStyleUpdates(
                    target.target.nodeId,
                    target.restoreUpdates.styles ?? {},
                  );
                  continue;
                }

                updateSelectedNodeProps(
                  target.target.nodeId,
                  target.restoreUpdates.props ?? {},
                );
                notifyCanvasPropsUpdate(target.target.nodeId, {
                  [propertyName]: target.oldValue,
                });
              }
            },
            onRedo: async () => {
              for (const target of targets) {
                if (isStyle) {
                  updateSelectedNodeStyles(
                    target.target.nodeId,
                    target.updates.styles ?? {},
                  );
                  notifyCanvasResponsiveStyleUpdates(
                    target.target.nodeId,
                    target.updates.styles ?? {},
                  );
                  continue;
                }

                updateSelectedNodeProps(
                  target.target.nodeId,
                  target.updates.props ?? {},
                );
                notifyCanvasPropsUpdate(target.target.nodeId, {
                  [propertyName]: nextValue as JsonValue | undefined,
                });
              }
            },
          })
        : executePropertySaveBatchMutation({
            metadata: {
              type: "batch-nodes",
              description: buildPropertyHistoryDescription({
                propertyNames: [propertyName],
                breakpoint: isStyle ? currentBreakpoint : null,
                breakpointLabelMap,
              }),
              affectedNodeIds: targetNodeIds,
            },
            targets: targets.map(({ target, updates, restoreUpdates }) => ({
              target,
              updates,
              restoreUpdates,
            })),
            breakpoint: currentBreakpoint,
            onUndo: async () => {
              for (const target of targets) {
                if (isStyle) {
                  updateSelectedNodeStyles(
                    target.target.nodeId,
                    target.restoreUpdates.styles ?? {},
                  );
                  notifyCanvasResponsiveStyleUpdates(
                    target.target.nodeId,
                    target.restoreUpdates.styles ?? {},
                  );
                  continue;
                }

                updateSelectedNodeProps(
                  target.target.nodeId,
                  target.restoreUpdates.props ?? {},
                );
                notifyCanvasPropsUpdate(target.target.nodeId, {
                  [propertyName]: target.oldValue,
                });
              }
            },
            onRedo: async () => {
              for (const target of targets) {
                if (isStyle) {
                  updateSelectedNodeStyles(
                    target.target.nodeId,
                    target.updates.styles ?? {},
                  );
                  notifyCanvasResponsiveStyleUpdates(
                    target.target.nodeId,
                    target.updates.styles ?? {},
                  );
                  continue;
                }

                updateSelectedNodeProps(
                  target.target.nodeId,
                  target.updates.props ?? {},
                );
                notifyCanvasPropsUpdate(target.target.nodeId, {
                  [propertyName]: nextValue as JsonValue | undefined,
                });
              }
            },
          }));

      if (!executeResult.success) {
        error.value = executeResult.error || "Failed to execute operation";
        return false;
      }

      if (debug) {
        log("debug", "[usePropertySave] Save successful with history");
      }

      return true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unexpected save error";
      error.value = errorMessage;

      log("error", "[usePropertySave] Save exception", {
        error: err,
        message: errorMessage,
        stack: err instanceof Error ? err.stack : undefined,
      });

      return false;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Saves multiple properties in a single operation.
   *
   * More efficient than calling saveProperty multiple times.
   * Automatically segregates style and prop updates.
   *
   * @param updates - Map of property names to values
   * @param itemType - Current item type
   * @param itemSlug - Current item slug
   * @returns Promise resolving to success boolean
   *
   * @example
   * ```ts
   * const success = await saveProperties(
   *   {
   *     fontSize: '18px',
   *     color: '#333',
   *     padding: '20px',
   *     alt: 'Hero image'
   *   },
   *   'page',
   *   'home'
   * );
   * ```
   */
  async function saveProperties(
    updates: Record<string, unknown>,
    itemType?: ItemType,
    itemSlug?: string,
    targetNodeId?: string,
  ): Promise<boolean> {
    const targetNodeIds = resolveValidatedTargetNodeIds(targetNodeId);
    if (!targetNodeIds) {
      error.value = "No node selected";
      if (debug) {
        log("debug", "[usePropertySave] Batch save skipped: no node selected");
      }
      return false;
    }

    const nodePath = buildNodePath(itemType, itemSlug);
    if (!nodePath) {
      error.value = "Missing context (itemType/itemSlug)";
      return false;
    }

    const validation = SavePropertiesInputSchema.safeParse({
      updates,
      itemType,
      itemSlug,
    });
    if (!validation.success) {
      error.value =
        validation.error.issues[0]?.message ?? "Invalid batch save payload";
      if (debug) {
        log("warn", "[usePropertySave] Invalid batch payload", {
          issues: validation.error.issues,
        });
      }
      return false;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const currentBreakpoint = breakpointName.value;
      const validatedUpdates = validation.data.updates;

      if (debug) {
        log("debug", "[usePropertySave] Batch saving properties", {
          updates: validatedUpdates,
          breakpoint: currentBreakpoint,
          nodeIds: targetNodeIds,
          context: nodePath,
        });
      }

      const hasStyleUpdates = Object.keys(validatedUpdates).some((key) =>
        isStyleProperty(key),
      );
      const breakpointLabelMap = Object.fromEntries(
        activeBreakpoints.value.map((breakpoint) => [
          breakpoint.name,
          breakpoint.label ?? breakpoint.name,
        ]),
      );

      const targets = targetNodeIds.map((nodeId) => {
        const node = getTargetNode(nodeId);
        const styleCascadeUpdates = buildCascadeStyleUpdatesForProperties(
          validatedUpdates,
          currentBreakpoint,
          node ?? null,
        );
        const propUpdates = Object.fromEntries(
          Object.entries(validatedUpdates).filter(
            ([key]) => !isStyleProperty(key),
          ),
        );
        const oldPropValues = Object.fromEntries(
          Object.entries(validatedUpdates)
            .filter(([key]) => !isStyleProperty(key))
            .map(([key]) => [key, getSelectedPropValue(key, nodeId)]),
        );

        return {
          target: {
            collection: nodePath.collection,
            id: nodePath.id,
            nodeId,
          },
          updates: {
            styles:
              Object.keys(styleCascadeUpdates).length > 0
                ? styleCascadeUpdates
                : undefined,
            props:
              Object.keys(propUpdates).length > 0 ? propUpdates : undefined,
          },
          restoreUpdates: {
            styles: buildRestoreStylesForMutation(styleCascadeUpdates, nodeId),
            props:
              Object.keys(oldPropValues).length > 0 ? oldPropValues : undefined,
          },
        };
      });

      const executeResult = await (targets.length === 1
        ? executePropertySaveMutation({
            metadata: {
              type: "batch-nodes",
              description: buildPropertyHistoryDescription({
                propertyNames: Object.keys(validatedUpdates),
                breakpoint: hasStyleUpdates ? currentBreakpoint : null,
                breakpointLabelMap,
              }),
              affectedNodeIds: targetNodeIds,
            },
            target: targets[0].target,
            updates: targets[0].updates,
            restoreUpdates: targets[0].restoreUpdates,
            breakpoint: currentBreakpoint,
            onUndo: async () => {
              for (const target of targets) {
                updateSelectedNodeStyles(
                  target.target.nodeId,
                  target.restoreUpdates.styles ?? {},
                );
                updateSelectedNodeProps(
                  target.target.nodeId,
                  target.restoreUpdates.props ?? {},
                );

                notifyCanvasResponsiveStyleUpdates(
                  target.target.nodeId,
                  target.restoreUpdates.styles ?? {},
                );

                if (Object.keys(target.restoreUpdates.props ?? {}).length > 0) {
                  notifyCanvasPropsUpdate(
                    target.target.nodeId,
                    target.restoreUpdates.props as Record<
                      string,
                      JsonValue | undefined
                    >,
                  );
                }
              }
            },
            onRedo: async () => {
              for (const target of targets) {
                updateSelectedNodeStyles(
                  target.target.nodeId,
                  target.updates.styles ?? {},
                );
                updateSelectedNodeProps(
                  target.target.nodeId,
                  target.updates.props ?? {},
                );

                notifyCanvasResponsiveStyleUpdates(
                  target.target.nodeId,
                  target.updates.styles ?? {},
                );

                if (Object.keys(target.updates.props ?? {}).length > 0) {
                  notifyCanvasPropsUpdate(
                    target.target.nodeId,
                    target.updates.props as Record<
                      string,
                      JsonValue | undefined
                    >,
                  );
                }
              }
            },
          })
        : executePropertySaveBatchMutation({
            metadata: {
              type: "batch-nodes",
              description: buildPropertyHistoryDescription({
                propertyNames: Object.keys(validatedUpdates),
                breakpoint: hasStyleUpdates ? currentBreakpoint : null,
                breakpointLabelMap,
              }),
              affectedNodeIds: targetNodeIds,
            },
            targets: targets.map(({ target, updates, restoreUpdates }) => ({
              target,
              updates,
              restoreUpdates,
            })),
            breakpoint: currentBreakpoint,
            onUndo: async () => {
              for (const target of targets) {
                updateSelectedNodeStyles(
                  target.target.nodeId,
                  target.restoreUpdates.styles ?? {},
                );
                updateSelectedNodeProps(
                  target.target.nodeId,
                  target.restoreUpdates.props ?? {},
                );

                notifyCanvasResponsiveStyleUpdates(
                  target.target.nodeId,
                  target.restoreUpdates.styles ?? {},
                );

                if (Object.keys(target.restoreUpdates.props ?? {}).length > 0) {
                  notifyCanvasPropsUpdate(
                    target.target.nodeId,
                    target.restoreUpdates.props as Record<
                      string,
                      JsonValue | undefined
                    >,
                  );
                }
              }
            },
            onRedo: async () => {
              for (const target of targets) {
                updateSelectedNodeStyles(
                  target.target.nodeId,
                  target.updates.styles ?? {},
                );
                updateSelectedNodeProps(
                  target.target.nodeId,
                  target.updates.props ?? {},
                );

                notifyCanvasResponsiveStyleUpdates(
                  target.target.nodeId,
                  target.updates.styles ?? {},
                );

                if (Object.keys(target.updates.props ?? {}).length > 0) {
                  notifyCanvasPropsUpdate(
                    target.target.nodeId,
                    target.updates.props as Record<
                      string,
                      JsonValue | undefined
                    >,
                  );
                }
              }
            },
          }));

      if (!executeResult.success) {
        error.value =
          executeResult.error || "Failed to execute batch operation";
        return false;
      }

      if (debug) {
        log("debug", "[usePropertySave] Batch save successful");
      }

      return true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unexpected batch save error";
      error.value = errorMessage;

      log("error", "[usePropertySave] Batch save exception", {
        error: err,
        message: errorMessage,
        stack: err instanceof Error ? err.stack : undefined,
      });

      return false;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Clears the current error state.
   */
  function clearError(): void {
    error.value = null;
  }

  return {
    // State (readonly to prevent external mutations)
    selectedNode,
    selectedNodeId,
    selectedNodeIds,
    selectedNodes,
    breakpointName,
    isLoading: readonly(isLoading),
    error: readonly(error),

    isSaving,
    hasTarget,

    saveProperty: (...args) =>
      isEditorMutationLocked()
        ? Promise.resolve(false)
        : trackEditorCommit(saveProperty(...args), "Property change"),
    saveProperties: (...args) =>
      isEditorMutationLocked()
        ? Promise.resolve(false)
        : trackEditorCommit(saveProperties(...args), "Property changes"),
    previewStyleProperties: (...args) =>
      isEditorMutationLocked() ? false : previewStyleProperties(...args),
    previewResponsiveStyleUpdates: (...args) =>
      isEditorMutationLocked() ? false : previewResponsiveStyleUpdates(...args),
    previewProps: (...args) =>
      isEditorMutationLocked() ? false : previewProps(...args),
    saveNodeUpdates: (...args) =>
      isEditorMutationLocked()
        ? Promise.resolve(false)
        : trackEditorCommit(saveNodeUpdates(...args), "Node property change"),
    clearError,

    isStyleProperty,
    getComputedStyleValue,
  };
}
