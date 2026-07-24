/**
 * State and operations for the Design tab. Handles
 * styling properties like spacing, typography, borders, etc.
 */

import { computed } from "vue";
import { useInspector } from "./useInspector";
import { useCanonicalBreakpoints } from "../../../composables/useCanonicalBreakpoints";
import { useResponsiveTarget } from "../../../composables/useResponsiveTarget";
import type { StyleMap } from "../../../../lib/types/nodes";

export type DesignSection =
  | "classes"
  | "htmlTag"
  | "typography"
  | "spacing"
  | "size"
  | "background"
  | "border"
  | "corner"
  | "shadow"
  | "opacity"
  | "visibility"
  | "link"
  | "image";

interface SectionVisibility {
  classes: boolean;
  htmlTag: boolean;
  typography: boolean;
  spacing: boolean;
  size: boolean;
  background: boolean;
  border: boolean;
  corner: boolean;
  shadow: boolean;
  opacity: boolean;
  visibility: boolean;
  link: boolean;
  image: boolean;
}

/**
 * useDesignEditor - Design tab logic
 *
 * @example
 * ```typescript
 * const {
 *   visibleSections,
 *   currentBreakpoint,
 *   updateSpacing,
 *   updateTypography,
 * } = useDesignEditor();
 * ```
 */
export function useDesignEditor() {
  const inspector = useInspector();
  const { targetBreakpoint } = useResponsiveTarget();
  const { activeBreakpoints } = useCanonicalBreakpoints({ autoLoad: true });

  /**
   * Current breakpoint name based on explicit write target
   */
  const currentBreakpoint = computed(() => {
    return targetBreakpoint.value ?? "base";
  });

  /**
   * Current breakpoint label for display
   */
  const currentBreakpointLabel = computed(() => {
    const bp = activeBreakpoints.value.find(
      (b) => b.name === currentBreakpoint.value,
    );
    return bp?.label ?? bp?.name ?? currentBreakpoint.value;
  });

  /**
   * Whether we're editing for a specific breakpoint (not default)
   */
  const isResponsiveEditing = computed(() => {
    return (
      currentBreakpoint.value !== "default" &&
      currentBreakpoint.value !== "base"
    );
  });

  /**
   * Which sections should be visible based on element capabilities
   */
  const visibleSections = computed<SectionVisibility>(() => {
    const caps = inspector.elementContext.value.capabilities;

    return {
      classes: true, // Always show
      htmlTag: caps.supportsHtmlTag,
      typography: caps.supportsTypography || caps.hasText,
      spacing: true, // Always show
      size: true, // Always show
      background: caps.supportsBackground || caps.isContainer,
      border: true, // Always show
      corner: true, // Always show
      shadow: true, // Always show
      opacity: true, // Always show
      visibility: true, // Always show
      link: caps.hasLink,
      image: caps.hasImage,
    };
  });

  /**
   * List of visible section IDs
   */
  const visibleSectionIds = computed(() => {
    return Object.entries(visibleSections.value)
      .filter(([, visible]) => visible)
      .map(([id]) => id as DesignSection);
  });

  /**
   * Get current style value for a property at a specific breakpoint
   * Returns the string value, not the Responsive wrapper
   */
  function getStyleValue<K extends keyof StyleMap>(
    property: K,
    breakpoint?: string,
  ): string | undefined {
    const node = inspector.elementContext.value.node;
    if (!node?.styles) return undefined;

    const styleValue = node.styles[property];
    if (!styleValue) return undefined;

    const bp = breakpoint ?? currentBreakpoint.value;
    return styleValue[bp] ?? styleValue["default"];
  }

  /**
   * Get all style values for a property across breakpoints
   * Returns the full Responsive object
   */
  function getResponsiveStyleValue<K extends keyof StyleMap>(
    property: K,
  ): StyleMap[K] | undefined {
    const node = inspector.elementContext.value.node;
    if (!node?.styles) return undefined;
    return node.styles[property];
  }

  /**
   * Update a single style property
   */
  async function updateStyleProperty<K extends keyof StyleMap>(
    property: K,
    value: string,
    options?: { breakpoint?: string; description?: string },
  ) {
    const bp = options?.breakpoint ?? currentBreakpoint.value;

    return inspector.updateStyle(
      { [property]: { [bp]: value } },
      {
        breakpoint: bp,
        description: options?.description ?? `Update ${String(property)}`,
      },
    );
  }

  /**
   * Update spacing (margin/padding)
   */
  async function updateSpacing(
    type: "margin" | "padding",
    side: "top" | "right" | "bottom" | "left" | "all",
    value: string,
  ) {
    const bp = currentBreakpoint.value;
    const prefix = type === "margin" ? "margin" : "padding";

    if (side === "all") {
      return inspector.updateStyle(
        {
          [`${prefix}Top`]: { [bp]: value },
          [`${prefix}Right`]: { [bp]: value },
          [`${prefix}Bottom`]: { [bp]: value },
          [`${prefix}Left`]: { [bp]: value },
        },
        { description: `Update ${type}` },
      );
    }

    const property = `${prefix}${side.charAt(0).toUpperCase()}${side.slice(1)}`;
    return updateStyleProperty(property as keyof StyleMap, value, {
      description: `Update ${type}-${side}`,
    });
  }

  /**
   * Update typography property
   */
  async function updateTypography(
    property:
      | "fontFamily"
      | "fontSize"
      | "fontWeight"
      | "lineHeight"
      | "letterSpacing"
      | "textAlign"
      | "textTransform"
      | "textDecoration"
      | "textWrap"
      | "color",
    value: string,
  ) {
    return updateStyleProperty(property, value, {
      description: `Update ${property}`,
    });
  }

  /**
   * Update border property
   */
  async function updateBorder(
    property: "borderWidth" | "borderStyle" | "borderColor",
    value: string,
    side?: "top" | "right" | "bottom" | "left",
  ) {
    if (side) {
      const sideProperty = `border${side.charAt(0).toUpperCase()}${side.slice(1)}${property.replace("border", "")}`;
      return updateStyleProperty(sideProperty as keyof StyleMap, value);
    }
    return updateStyleProperty(property, value);
  }

  /**
   * Update size property
   */
  async function updateSize(
    property:
      | "width"
      | "height"
      | "minWidth"
      | "minHeight"
      | "maxWidth"
      | "maxHeight",
    value: string,
  ) {
    return updateStyleProperty(property, value);
  }

  /**
   * Update background
   */
  async function updateBackground(property: "backgroundColor", value: string) {
    return updateStyleProperty(property, value);
  }

  /**
   * Update corner (border-radius)
   */
  async function updateCorner(
    value: string,
    corner?: "topLeft" | "topRight" | "bottomRight" | "bottomLeft",
  ) {
    if (corner) {
      const property = `border${corner.charAt(0).toUpperCase()}${corner.slice(1)}Radius`;
      return updateStyleProperty(property as keyof StyleMap, value);
    }
    return updateStyleProperty("borderRadius", value);
  }

  /**
   * Update shadow
   */
  async function updateShadow(value: string) {
    return updateStyleProperty("boxShadow", value);
  }

  /**
   * Update visibility/display
   */
  async function updateDisplay(value: string) {
    return updateStyleProperty("display", value);
  }

  /**
   * Expand all visible sections
   */
  function expandAll() {
    inspector.expandAll(visibleSectionIds.value);
  }

  /**
   * Collapse all sections
   */
  function collapseAll() {
    inspector.collapseAll();
  }

  return {
    currentBreakpoint,
    currentBreakpointLabel,
    isResponsiveEditing,

    visibleSections,
    visibleSectionIds,

    getStyleValue,
    getResponsiveStyleValue,

    updateStyleProperty,
    updateSpacing,
    updateTypography,
    updateBorder,
    updateSize,
    updateBackground,
    updateCorner,
    updateShadow,
    updateDisplay,

    expandAll,
    collapseAll,

    // From inspector
    elementContext: inspector.elementContext,
    canEdit: inspector.canEdit,
    isUpdating: inspector.isUpdating,
    hasError: inspector.hasError,
    lastError: inspector.lastError,
  };
}
