import { computed, type ComputedRef } from "vue";

import type { BuilderNode } from "../../../../lib/types/nodes";
import { normalizeResponsiveStyleMap } from "../../../../lib/blocks/normalizeResponsiveStyleMap";
import type { CanvasStyleUpdate } from "../../Core/composables/useCanvasSignalBridge";
import type { UsePropertySaveReturn } from "../../Core";
import {
  getComputedValue,
} from "../../Core/utils/responsive";
import { useCanonicalBreakpoints } from "../../../composables/useCanonicalBreakpoints";
import {
  DESKTOP_BASE_BREAKPOINT,
  getDownstreamBreakpointNames,
  isUpstreamOfDesktopBase,
} from "../../../../lib/styles/responsiveBreakpoints";
import type { InspectorStyleDefaults } from "../lib/resolveInspectorGlobalStyleDefaults";
import { useClassEditor } from "./useClassEditor";
import { useInspectorState } from "./useInspectorState";
import { cssPropertiesEquivalent } from "../../../../lib/types/classes";

type ItemType = "page" | "layout" | "component";

type StyleTargetPropertySave = Pick<
  UsePropertySaveReturn,
  | "selectedNode"
  | "selectedNodeId"
  | "selectedNodes"
  | "breakpointName"
  | "isLoading"
  | "error"
  | "previewStyleProperties"
  | "previewResponsiveStyleUpdates"
  | "getComputedStyleValue"
  | "saveProperty"
  | "saveProperties"
>;

export type InspectorResponsiveStyleMap = Record<string, string | undefined>;

export interface InspectorStyleValueState {
  value: string | undefined;
  isMixed: boolean;
}

interface GlobalDefaultsContext {
  readonly isActive: ComputedRef<boolean>;
  readonly primaryDefaults: ComputedRef<InspectorStyleDefaults>;
  readonly compareAcrossSelection: (
    propertyName: string,
  ) => { value: string | undefined; isMixed: boolean };
  readonly coalesceSaveValue: (
    propertyName: string,
    value: string,
  ) => string | undefined;
}

interface UseInspectorStyleTargetOptions {
  propertySave: StyleTargetPropertySave;
  targetNode?: ComputedRef<BuilderNode | null>;
  targetNodeId?: ComputedRef<string | null>;
  globalDefaults?: GlobalDefaultsContext;
}

interface UseInspectorStyleTargetReturn {
  readonly isClassEditing: ComputedRef<boolean>;
  readonly activeClassName: ReturnType<
    typeof useClassEditor
  >["activeClassName"];
  readonly activeClass: ReturnType<typeof useClassEditor>["activeClass"];
  readonly isLoading: ComputedRef<boolean>;
  readonly error: ComputedRef<string | null>;
  getResponsiveStyleMap: (propertyName: string) => InspectorResponsiveStyleMap;
  getStyleValueState: (
    propertyName: string,
    breakpoint?: string,
  ) => InspectorStyleValueState;
  getStyleValue: (
    propertyName: string,
    fallback?: string,
    breakpoint?: string,
  ) => string | undefined;
  saveStyleProperty: (
    propertyName: string,
    value: string,
    itemType?: ItemType,
    itemSlug?: string,
  ) => Promise<boolean>;
  coalesceStylePropertySaveValue: (
    propertyName: string,
    value: string,
  ) => string | undefined;
  saveStyleProperties: (
    updates: Record<string, string | undefined>,
    itemType?: ItemType,
    itemSlug?: string,
  ) => Promise<boolean>;
  previewStyleProperties: (
    updates: Record<string, string | undefined>,
  ) => boolean;
  captureAuthoredStylePreviewSnapshot: (
    propertyNames: readonly string[],
  ) => Record<string, InspectorResponsiveStyleMap>;
  restoreAuthoredStylePreviewSnapshot: (
    propertyNames: readonly string[],
    snapshot: Record<string, InspectorResponsiveStyleMap>,
  ) => boolean;
  clearStyleProperties: (
    propertyNames: readonly string[],
    itemType?: ItemType,
    itemSlug?: string,
  ) => Promise<boolean>;
}

export function normalizeInspectorResponsiveStyleMap(
  value: unknown,
): InspectorResponsiveStyleMap {
  return normalizeResponsiveStyleMap(value);
}

function hasDirectStyleValueAtBreakpoint(
  value: unknown,
  breakpoint: string,
): boolean {
  if (typeof value === "string") {
    return breakpoint === DESKTOP_BASE_BREAKPOINT;
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    typeof normalizeInspectorResponsiveStyleMap(value)[breakpoint] === "string"
  );
}

export function useInspectorStyleTarget(
  options: UseInspectorStyleTargetOptions,
): UseInspectorStyleTargetReturn {
  const { propertySave } = options;
  const classEditor = useClassEditor();
  const inspectorState = useInspectorState();
  const canonicalBreakpoints = useCanonicalBreakpoints({ autoLoad: true });
  const activePseudoState = computed(() => inspectorState.selectedPseudo.value);

  const isClassEditing = computed(
    () =>
      (!options.targetNodeId?.value ||
        options.targetNodeId.value === propertySave.selectedNodeId.value) &&
      classEditor.editingMode.value === "class" &&
      classEditor.activeClassName.value !== null,
  );

  const isLoading = computed(() =>
    isClassEditing.value
      ? classEditor.isLoading.value
      : propertySave.isLoading.value,
  );

  const error = computed(() =>
    isClassEditing.value ? classEditor.error.value : propertySave.error.value,
  );

  function clearCanvasInlineStyleOverrides(
    propertyNames: readonly string[],
  ): void {
    if (activePseudoState.value === "default" || propertyNames.length === 0) {
      return;
    }

    const updates = Object.fromEntries(
      propertyNames.map((propertyName) => [propertyName, undefined]),
    );
    const targetNodeId = options.targetNodeId?.value;

    if (targetNodeId == null) {
      propertySave.previewStyleProperties(updates);
      return;
    }

    propertySave.previewStyleProperties(updates, targetNodeId);
  }

  async function clearConflictingInlineStyles(
    propertyNames: readonly string[],
    itemType?: ItemType,
    itemSlug?: string,
  ): Promise<void> {
    if (
      activePseudoState.value === "default" ||
      !itemType ||
      !itemSlug ||
      propertyNames.length === 0
    ) {
      return;
    }

    const targetNode =
      options.targetNode?.value ?? propertySave.selectedNode.value;
    if (!targetNode?.styles) {
      return;
    }

    const breakpoint = propertySave.breakpointName.value;
    const updates = Object.fromEntries(
      propertyNames
        .filter((propertyName) =>
          hasDirectStyleValueAtBreakpoint(
            targetNode.styles?.[propertyName],
            breakpoint,
          ),
        )
        .map((propertyName) => [propertyName, undefined]),
    );

    if (Object.keys(updates).length === 0) {
      return;
    }

    const targetNodeId = options.targetNodeId?.value;

    if (targetNodeId == null) {
      await propertySave.saveProperties(updates, itemType, itemSlug);
      return;
    }

    await propertySave.saveProperties(
      updates,
      itemType,
      itemSlug,
      targetNodeId,
    );
  }

  function getResponsiveStyleMap(
    propertyName: string,
  ): InspectorResponsiveStyleMap {
    if (!isClassEditing.value) {
      return normalizeInspectorResponsiveStyleMap(
        (options.targetNode?.value ?? propertySave.selectedNode.value)
          ?.styles?.[propertyName],
      );
    }

    const activeClass = classEditor.activeClass.value;
    if (!activeClass) {
      return {};
    }

    const responsiveMap: InspectorResponsiveStyleMap = {};

    if (activePseudoState.value !== "default") {
      for (const variant of activeClass.pseudoVariants) {
        if (variant.state !== activePseudoState.value) {
          continue;
        }

        const rule = variant.rules.find((entry) =>
          cssPropertiesEquivalent(entry.property, propertyName),
        );
        if (rule) {
          responsiveMap[variant.breakpoint] = rule.value;
        }
      }

      return responsiveMap;
    }

    for (const variant of activeClass.variants) {
      const rule = variant.rules.find((entry) =>
        cssPropertiesEquivalent(entry.property, propertyName),
      );
      if (rule) {
        responsiveMap[variant.breakpoint] = rule.value;
      }
    }

    return responsiveMap;
  }

  function getResolvedSelectionNodes(): BuilderNode[] {
    if (options.targetNode?.value) {
      return [options.targetNode.value];
    }

    if ((propertySave.selectedNodes?.value.length ?? 0) > 0) {
      return propertySave.selectedNodes.value;
    }

    return propertySave.selectedNode.value
      ? [propertySave.selectedNode.value]
      : [];
  }

  function getNodeStyleValue(
    node: BuilderNode,
    propertyName: string,
    breakpoint: string,
  ): string | undefined {
    if (isClassEditing.value) {
      const responsiveMap = getResponsiveStyleMap(propertyName);
      const value = getComputedValue(
        responsiveMap,
        breakpoint,
        canonicalBreakpoints.activeBreakpoints.value,
      );

      return typeof value === "string" ? value : undefined;
    }

    return propertySave.getComputedStyleValue(
      propertyName,
      undefined,
      breakpoint,
      node.id,
    );
  }

  function resolveGlobalDefaultForProperty(
    propertyName: string,
  ): { value: string | undefined; isMixed: boolean } {
    const globalDefaults = options.globalDefaults;
    if (!globalDefaults?.isActive.value) {
      return { value: undefined, isMixed: false };
    }

    const targetNodes = getResolvedSelectionNodes();
    if (targetNodes.length > 1) {
      return globalDefaults.compareAcrossSelection(propertyName);
    }

    const primaryValue =
      globalDefaults.primaryDefaults.value[
        propertyName as keyof InspectorStyleDefaults
      ];

    return {
      value: primaryValue,
      isMixed: false,
    };
  }

  function coalesceAuthoredValueWithGlobalDefault(
    propertyName: string,
    authoredValue: string | undefined,
    isMixed: boolean,
  ): InspectorStyleValueState {
    if (isMixed) {
      return { value: undefined, isMixed: true };
    }

    if (typeof authoredValue === "string") {
      return { value: authoredValue, isMixed: false };
    }

    const globalDefault = resolveGlobalDefaultForProperty(propertyName);
    if (globalDefault.isMixed) {
      return { value: undefined, isMixed: true };
    }

    return {
      value: globalDefault.value,
      isMixed: false,
    };
  }

  function getStyleValueState(
    propertyName: string,
    breakpoint: string = propertySave.breakpointName.value,
  ): InspectorStyleValueState {
    if (isClassEditing.value) {
      const responsiveMap = getResponsiveStyleMap(propertyName);
      const value = getComputedValue(
        responsiveMap,
        breakpoint,
        canonicalBreakpoints.activeBreakpoints.value,
      );

      return {
        value: typeof value === "string" ? value : undefined,
        isMixed: false,
      };
    }

    const targetNodes = getResolvedSelectionNodes();
    if (targetNodes.length <= 1) {
      const targetNodeId =
        options.targetNode?.value?.id ??
        options.targetNodeId?.value ??
        propertySave.selectedNodeId.value ??
        undefined;
      const value = propertySave.getComputedStyleValue(
        propertyName,
        undefined,
        breakpoint,
        targetNodeId ?? undefined,
      );

      return coalesceAuthoredValueWithGlobalDefault(
        propertyName,
        value,
        false,
      );
    }

    const firstValue = getNodeStyleValue(
      targetNodes[0],
      propertyName,
      breakpoint,
    );
    for (const node of targetNodes.slice(1)) {
      if (getNodeStyleValue(node, propertyName, breakpoint) !== firstValue) {
        return coalesceAuthoredValueWithGlobalDefault(
          propertyName,
          undefined,
          true,
        );
      }
    }

    return coalesceAuthoredValueWithGlobalDefault(
      propertyName,
      firstValue,
      false,
    );
  }

  function getStyleValue(
    propertyName: string,
    fallback?: string,
    breakpoint: string = propertySave.breakpointName.value,
  ): string | undefined {
    const styleValueState = getStyleValueState(propertyName, breakpoint);
    return styleValueState.value ?? fallback;
  }

  function coalesceStylePropertySaveValue(
    propertyName: string,
    value: string,
  ): string | undefined {
    if (isClassEditing.value || !options.globalDefaults?.isActive.value) {
      return value;
    }

    return options.globalDefaults.coalesceSaveValue(propertyName, value);
  }

  async function saveStyleProperty(
    propertyName: string,
    value: string,
    itemType?: ItemType,
    itemSlug?: string,
  ): Promise<boolean> {
    const resolvedValue = coalesceStylePropertySaveValue(propertyName, value);

    if (resolvedValue === undefined) {
      return clearStyleProperties([propertyName], itemType, itemSlug);
    }

    if (!isClassEditing.value) {
      const targetNodeId = options.targetNodeId?.value;

      if (targetNodeId == null) {
        return propertySave.saveProperty(
          propertyName,
          resolvedValue,
          itemType,
          itemSlug,
        );
      }

      return propertySave.saveProperty(
        propertyName,
        resolvedValue,
        itemType,
        itemSlug,
        targetNodeId,
      );
    }

    if (activePseudoState.value !== "default") {
      const saved = await classEditor.setClassPseudoRule(
        activePseudoState.value,
        propertyName,
        resolvedValue,
      );
      if (saved) {
        clearCanvasInlineStyleOverrides([propertyName]);
        await clearConflictingInlineStyles([propertyName], itemType, itemSlug);
      }

      return saved;
    }

    return classEditor.setClassRule(propertyName, resolvedValue);
  }

  async function saveStyleProperties(
    updates: Record<string, string | undefined>,
    itemType?: ItemType,
    itemSlug?: string,
  ): Promise<boolean> {
    const resolvedUpdates = Object.fromEntries(
      Object.entries(updates).map(([propertyName, nextValue]) => {
        if (typeof nextValue !== "string") {
          return [propertyName, nextValue];
        }

        return [
          propertyName,
          coalesceStylePropertySaveValue(propertyName, nextValue),
        ];
      }),
    ) as Record<string, string | undefined>;

    if (!isClassEditing.value) {
      const targetNodeId = options.targetNodeId?.value;

      if (targetNodeId == null) {
        return propertySave.saveProperties(
          resolvedUpdates,
          itemType,
          itemSlug,
        );
      }

      return propertySave.saveProperties(
        resolvedUpdates,
        itemType,
        itemSlug,
        targetNodeId,
      );
    }

    const rulesToSet = Object.fromEntries(
      Object.entries(resolvedUpdates).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    const propertiesToRemove: string[] = [];

    for (const [propertyName, nextValue] of Object.entries(resolvedUpdates)) {
      if (typeof nextValue === "string") {
        continue;
      }

      propertiesToRemove.push(propertyName);
    }

    let allSucceeded = true;

    if (Object.keys(rulesToSet).length > 0) {
      const saved =
        activePseudoState.value === "default"
          ? await classEditor.setClassRules(rulesToSet)
          : await classEditor.setClassPseudoRules(
              activePseudoState.value,
              rulesToSet,
            );
      if (!saved) {
        allSucceeded = false;
      }
    }

    if (propertiesToRemove.length > 0) {
      const removed =
        activePseudoState.value === "default"
          ? await classEditor.removeClassRules(propertiesToRemove)
          : await classEditor.removeClassPseudoRules(
              activePseudoState.value,
              propertiesToRemove,
            );
      if (!removed) {
        allSucceeded = false;
      }
    }

    if (allSucceeded && activePseudoState.value !== "default") {
      clearCanvasInlineStyleOverrides(Object.keys(resolvedUpdates));
      await clearConflictingInlineStyles(
        Object.keys(resolvedUpdates),
        itemType,
        itemSlug,
      );
    }

    return allSucceeded;
  }

  function previewStyleProperties(
    updates: Record<string, string | undefined>,
  ): boolean {
    if (!isClassEditing.value) {
      const targetNodeId = options.targetNodeId?.value;

      if (targetNodeId == null) {
        return propertySave.previewStyleProperties(updates);
      }

      return propertySave.previewStyleProperties(updates, targetNodeId);
    }

    if (activePseudoState.value !== "default") {
      const previewed = classEditor.previewClassPseudoRules(
        activePseudoState.value,
        updates,
      );

      if (previewed) {
        clearCanvasInlineStyleOverrides(Object.keys(updates));
      }

      return previewed;
    }

    return classEditor.previewClassRules(updates);
  }

  function captureAuthoredStylePreviewSnapshot(
    propertyNames: readonly string[],
  ): Record<string, InspectorResponsiveStyleMap> {
    return Object.fromEntries(
      propertyNames.map((propertyName) => [
        propertyName,
        { ...getResponsiveStyleMap(propertyName) },
      ]),
    );
  }

  function getCascadePreviewRestoreBreakpoints(
    breakpoint: string,
    snapshot: InspectorResponsiveStyleMap,
  ): string[] {
    const downstreamBreakpointNames = getDownstreamBreakpointNames(
      canonicalBreakpoints.activeBreakpoints.value,
      breakpoint,
    );
    const breakpoints = new Set<string>([
      breakpoint,
      ...downstreamBreakpointNames,
      ...Object.keys(snapshot),
    ]);

    if (
      isUpstreamOfDesktopBase(
        canonicalBreakpoints.activeBreakpoints.value,
        breakpoint,
      )
    ) {
      breakpoints.add(DESKTOP_BASE_BREAKPOINT);
    }

    return Array.from(breakpoints);
  }

  function restoreAuthoredStylePreviewSnapshot(
    propertyNames: readonly string[],
    snapshot: Record<string, InspectorResponsiveStyleMap>,
  ): boolean {
    const breakpoint = propertySave.breakpointName.value;
    const canvasStyles: CanvasStyleUpdate["styles"] = {};

    for (const propertyName of propertyNames) {
      const propertySnapshot = snapshot[propertyName] ?? {};
      const breakpointsToRestore = getCascadePreviewRestoreBreakpoints(
        breakpoint,
        propertySnapshot,
      );

      for (const breakpointName of breakpointsToRestore) {
        canvasStyles[breakpointName] = {
          ...(canvasStyles[breakpointName] ?? {}),
          [propertyName]: propertySnapshot[breakpointName],
        };
      }
    }

    const targetNodeId = options.targetNodeId?.value;

    if (targetNodeId == null) {
      return propertySave.previewResponsiveStyleUpdates(canvasStyles);
    }

    return propertySave.previewResponsiveStyleUpdates(
      canvasStyles,
      targetNodeId,
    );
  }

  async function clearStyleProperties(
    propertyNames: readonly string[],
    itemType?: ItemType,
    itemSlug?: string,
  ): Promise<boolean> {
    const updates = Object.fromEntries(
      propertyNames.map((propertyName) => [propertyName, undefined]),
    );
    const snapshot = captureAuthoredStylePreviewSnapshot(propertyNames);
    const previewed = previewStyleProperties(updates);
    const saved = await saveStyleProperties(updates, itemType, itemSlug);

    if (!saved && previewed) {
      restoreAuthoredStylePreviewSnapshot(propertyNames, snapshot);
    }

    return saved;
  }

  return {
    isClassEditing,
    activeClassName: classEditor.activeClassName,
    activeClass: classEditor.activeClass,
    isLoading,
    error,
    getResponsiveStyleMap,
    getStyleValueState,
    getStyleValue,
    coalesceStylePropertySaveValue,
    saveStyleProperty,
    saveStyleProperties,
    previewStyleProperties,
    captureAuthoredStylePreviewSnapshot,
    restoreAuthoredStylePreviewSnapshot,
    clearStyleProperties,
  };
}
