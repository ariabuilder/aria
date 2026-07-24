/**
 * Bidirectional class editing system for Aria. Handles
 * both utility classes (UnoCSS/Tailwind) and custom classes.
 */

import {
  ref,
  computed,
  watch,
  readonly,
  type Ref,
  type ComputedRef,
} from "vue";
import { actions } from "astro:actions";
import { useCanonicalBreakpoints } from "../../../composables/useCanonicalBreakpoints";
import { useResponsiveTarget } from "../../../composables/useResponsiveTarget";
import {
  cloneDeep,
  useCanvasSignalBridge,
  useSelectedNodeState,
} from "../../Core";
import { recordStateSnapshotAdvanced } from "../../History";
import type {
  AuthoringMode,
  CustomClass,
  CustomClassesMap,
  CSSRuleValue,
  Breakpoint,
  BreakpointVariant,
  PseudoVariant,
  PseudoState,
  PseudoSelector,
} from "../../../../lib/schemas/classEditor";
import {
  AuthoringModeSchema,
  BREAKPOINT_WIDTHS,
  buildClassNameKey,
  createEmptyClassNames,
  CustomClassSchema,
  CustomClassesMapSchema,
  NodeClassNamesSchema,
  UpdateClassRuleInputSchema,
  RemoveClassRuleInputSchema,
  UpdateClassPseudoRuleInputSchema,
  RemoveClassPseudoRuleInputSchema,
} from "../../../../lib/schemas/classEditor";
import { generateCustomClasses } from "../../../../lib/styles/generateCustomCSS";
import type { InspectorPseudoState } from "../../../../lib/styles/pseudoSelectors";
import { buildDesktopFirstCascadeClearValues } from "../../../../lib/styles/responsiveCascade";
import { buildDesktopFirstCascadeStyleValues } from "../../../../lib/styles/responsiveBreakpoints";
import {
  cssPropertiesEquivalent,
  normalizeStoredCssProperty,
} from "../../../../lib/types/classes";
import { z } from "zod";
import { log } from "@/lib/utils/logger";
import { useClassEditorHistory } from "./useClassEditorHistory";
import { useClassEditorSignals } from "./useClassEditorSignals";

const NonEmptyStringSchema = z.string().trim().min(1);

const ClassEditorActionErrorSchema = z
  .looseObject({
    message: NonEmptyStringSchema.optional(),
  });

const ClassEditorActionFailureSchema = z
  .looseObject({
    success: z.literal(false),
    error: ClassEditorActionErrorSchema.optional(),
  });

const ClassEditorGetClassesActionSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    data: z
      .looseObject({
        classes: CustomClassesMapSchema,
        authoringMode: AuthoringModeSchema,
        css: z.string(),
      }),
  });

const ClassEditorClassActionSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    data: z
      .looseObject({
        class: CustomClassSchema,
        css: z.string().optional(),
      }),
  });

const ClassEditorGeneratedCssActionSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    data: z
      .looseObject({
        css: z.string(),
      }),
  });

const NodeUtilityClassActionSuccessSchema = z
  .looseObject({
    version: NonEmptyStringSchema,
  });

const ClassEditorSnapshotSchema = z
  .object({
    customClasses: CustomClassesMapSchema,
    generatedCSS: z.string(),
    activeClassName: z.string().min(1).nullable(),
  })
  .strict();

interface ActionTransportErrorLike {
  message?: string;
}

interface ActionTransportResult {
  data?: unknown;
  error?: ActionTransportErrorLike | null;
}

function getActionErrorMessage(
  error: z.infer<typeof ClassEditorActionErrorSchema> | undefined,
  fallback: string,
): string {
  return error?.message ?? fallback;
}

function unwrapClassEditorActionResult<TSuccess extends { success: true }>(
  result: ActionTransportResult,
  successSchema: z.ZodType<TSuccess>,
  fallback: string,
  context: Record<string, unknown>,
): { success: true; data: TSuccess } | { success: false; error: string } {
  if (result.error) {
    return {
      success: false,
      error: result.error.message ?? fallback,
    };
  }

  const parsedFailure = ClassEditorActionFailureSchema.safeParse(result.data);
  if (parsedFailure.success) {
    return {
      success: false,
      error: getActionErrorMessage(parsedFailure.data.error, fallback),
    };
  }

  const parsedSuccess = successSchema.safeParse(result.data);
  if (!parsedSuccess.success) {
    log("warn", "[useClassEditor] Invalid style action response", {
      issues: parsedSuccess.error.issues,
      ...context,
    });
    return {
      success: false,
      error: fallback,
    };
  }

  return {
    success: true,
    data: parsedSuccess.data,
  };
}

function normalizeNodeClassNames(value: unknown) {
  const parsedClassNames = NodeClassNamesSchema.safeParse(value);
  if (!parsedClassNames.success) {
    return null;
  }

  return {
    ...createEmptyClassNames(),
    ...cloneDeep(parsedClassNames.data),
  };
}

function unwrapNodeUtilityClassActionResult(
  result: ActionTransportResult,
  fallback: string,
  context: Record<string, unknown>,
): { success: true; version: string } | { success: false; error: string } {
  if (result.error) {
    return {
      success: false,
      error: result.error.message ?? fallback,
    };
  }

  const parsedResult = NodeUtilityClassActionSuccessSchema.safeParse(
    result.data,
  );
  if (!parsedResult.success) {
    log("warn", "[useClassEditor] Invalid node class action response", {
      issues: parsedResult.error.issues,
      ...context,
    });
    return {
      success: false,
      error: fallback,
    };
  }

  return {
    success: true,
    version: parsedResult.data.version,
  };
}

/** Editing mode: element classes or class definition */
export type EditingMode = "element" | "class";

export interface UseClassEditorReturn {
  // Loading & Error State
  isLoading: Readonly<Ref<boolean>>;
  error: Readonly<Ref<string | null>>;

  authoringMode: Readonly<Ref<AuthoringMode>>;

  editingMode: ComputedRef<EditingMode>;

  // All custom classes (keyed by name)
  customClasses: Ref<CustomClassesMap>;

  // Active class editing (when editingMode === "class")
  activeClassName: Readonly<Ref<string | null>>;
  activeClass: ComputedRef<CustomClass | null>;
  activeRules: ComputedRef<CSSRuleValue[]>;

  // Current breakpoint (from viewport)
  currentBreakpoint: ComputedRef<Breakpoint>;

  // Generated CSS (for iframe injection)
  generatedCSS: Readonly<Ref<string>>;

  loadClasses: (force?: boolean) => Promise<void>;
  createClass: (name: string, description?: string) => Promise<boolean>;
  deleteClass: (name: string) => Promise<boolean>;
  deleteClasses: (names: string[]) => Promise<boolean>;
  renameClass: (oldName: string, newName: string) => Promise<boolean>;
  duplicateClass: (sourceName: string, newName: string) => Promise<boolean>;
  copyClassStyles: (sourceName: string, targetName: string) => Promise<boolean>;
  replaceClassStyles: (
    targetName: string,
    variants: BreakpointVariant[],
    pseudoVariants: PseudoVariant[],
  ) => Promise<boolean>;
  replaceClassVariantRules: (
    className: string,
    breakpoint: Breakpoint,
    pseudoState: InspectorPseudoState,
    rules: CSSRuleValue[],
    options?: { preserveActiveClass?: boolean },
  ) => Promise<boolean>;

  setActiveClass: (name: string | null) => void;
  clearActiveClass: () => void;

  // Custom class rule editing (when editingMode === "class")
  getClassRule: (
    property: string,
    breakpoint?: Breakpoint,
  ) => string | undefined;
  setClassRule: (
    property: string,
    value: string,
    important?: boolean,
  ) => Promise<boolean>;
  setClassRules: (
    rules: Record<string, string>,
    important?: boolean,
  ) => Promise<boolean>;
  previewClassRules: (updates: Record<string, string | undefined>) => boolean;
  previewClassPseudoRules: (
    state: PseudoState,
    updates: Record<string, string | undefined>,
  ) => boolean;
  removeClassRule: (property: string) => Promise<boolean>;
  removeClassRules: (properties: readonly string[]) => Promise<boolean>;

  getClassPseudoRule: (
    state: PseudoState,
    property: string,
    breakpoint?: Breakpoint,
  ) => string | undefined;
  setClassPseudoRule: (
    state: PseudoState,
    property: string,
    value: string,
    important?: boolean,
  ) => Promise<boolean>;
  setClassPseudoRules: (
    state: PseudoState,
    rules: Record<string, string>,
    important?: boolean,
  ) => Promise<boolean>;
  removeClassPseudoRule: (
    state: PseudoState,
    property: string,
  ) => Promise<boolean>;
  removeClassPseudoRules: (
    state: PseudoState,
    properties: readonly string[],
  ) => Promise<boolean>;

  // Node class management (utility classes on elements)
  addUtilityClass: (
    collection: "pages" | "layouts" | "components",
    id: string,
    nodeId: string,
    className: string,
    breakpoint?: Breakpoint,
    pseudo?: PseudoSelector,
  ) => Promise<boolean>;
  removeUtilityClass: (
    collection: "pages" | "layouts" | "components",
    id: string,
    nodeId: string,
    className: string,
    breakpoint?: Breakpoint,
    pseudo?: PseudoSelector,
  ) => Promise<boolean>;

  addCustomClassToNode: (
    collection: "pages" | "layouts" | "components",
    id: string,
    nodeId: string,
    className: string,
  ) => Promise<boolean>;
  removeCustomClassFromNode: (
    collection: "pages" | "layouts" | "components",
    id: string,
    nodeId: string,
    className: string,
  ) => Promise<boolean>;

  setAuthoringMode: (mode: AuthoringMode) => Promise<boolean>;

  isCustomClass: (name: string) => boolean;
  refreshCSS: () => Promise<void>;
}

// MUTABLE TYPES (for internal state)

const isLoading = ref(false);
const error = ref<string | null>(null);
const authoringMode = ref<AuthoringMode>("utility");
const customClasses = ref<CustomClassesMap>({});
const activeClassName = ref<string | null>(null);
const generatedCSS = ref("");
let initialized = false;

export function useClassEditor(): UseClassEditorReturn {
  const { targetBreakpoint } = useResponsiveTarget();
  const { activeBreakpoints } = useCanonicalBreakpoints({ autoLoad: true });
  const { broadcastClassUpdate } = useCanvasSignalBridge();
  const {
    selectedNode,
    selectedNodeId,
    updateSelectedNodeClassNames,
    updateSelectedNodeCustomClasses,
  } = useSelectedNodeState();
  const {
    broadcastCssUpdated,
    broadcastActiveChanged,
    broadcastClassRenamed,
    broadcastModeChanged,
    broadcastAuthoringModeChanged,
    broadcastNodeClassAdded,
    broadcastNodeClassRemoved,
    broadcastNodeCustomClassAdded,
    broadcastNodeCustomClassRemoved,
  } = useClassEditorSignals();
  const {
    recordCreateClass,
    recordDeleteClass,
    recordDeleteClasses,
    recordRenameClass,
    recordDuplicateClass,
    recordReplaceClassStyles,
    recordReplaceClassVariantRules,
    recordAuthoringModeChange,
    recordNodeCustomClassChange,
  } = useClassEditorHistory();

  const UtilityClassInputSchema = z.object({
    collection: z.enum(["pages", "layouts", "components"]),
    id: z.string().min(1),
    nodeId: z.string().min(1),
    className: z.string().min(1),
    key: z.string().min(1),
  });

  function applyClassEditorSnapshot(snapshot: unknown): void {
    const parsedSnapshot = ClassEditorSnapshotSchema.safeParse(snapshot);
    if (!parsedSnapshot.success) {
      error.value =
        parsedSnapshot.error.issues[0]?.message ??
        "Failed to restore class editor state";
      return;
    }

    customClasses.value = cloneDeep(parsedSnapshot.data.customClasses);
    generatedCSS.value = parsedSnapshot.data.generatedCSS;
    activeClassName.value = parsedSnapshot.data.activeClassName;
    emitCSSUpdate();
    emitActiveChanged();
  }

  function restoreCustomClasses(value: unknown): void {
    const parsedClasses = CustomClassesMapSchema.safeParse(value);
    if (!parsedClasses.success) {
      error.value =
        parsedClasses.error.issues[0]?.message ??
        "Failed to restore class definitions";
      return;
    }

    customClasses.value = cloneDeep(parsedClasses.data);
  }

  function setNodeCustomClassState(
    nodeId: string,
    className: string,
    add: boolean,
  ): void {
    if (selectedNode.value && selectedNode.value.id === nodeId) {
      const currentCustomClasses = new Set(
        selectedNode.value.customClasses ?? [],
      );
      if (add) {
        currentCustomClasses.add(className);
      } else {
        currentCustomClasses.delete(className);
      }

      const updatedNode = updateSelectedNodeCustomClasses(
        nodeId,
        Array.from(currentCustomClasses),
      );

      if (updatedNode) {
        broadcastClassUpdate({
          nodeId,
          classNames: updatedNode.classNames ?? createEmptyClassNames(),
          customClasses: updatedNode.customClasses ?? [],
        });
      }
    }

    if (customClasses.value[className]) {
      customClasses.value[className].usageCount = add
        ? customClasses.value[className].usageCount + 1
        : Math.max(0, customClasses.value[className].usageCount - 1);
    }
  }

  function replaceSelectedNodeCustomClassReference(
    oldName: string,
    newName: string,
  ): void {
    if (!selectedNode.value) return;

    const currentCustomClasses = selectedNode.value.customClasses ?? [];
    if (!currentCustomClasses.includes(oldName)) return;

    const nextCustomClasses: string[] = [];
    for (const className of currentCustomClasses) {
      const nextClassName = className === oldName ? newName : className;
      if (!nextCustomClasses.includes(nextClassName)) {
        nextCustomClasses.push(nextClassName);
      }
    }

    const updatedNode = updateSelectedNodeCustomClasses(
      selectedNode.value.id,
      nextCustomClasses,
    );

    if (updatedNode) {
      broadcastClassUpdate({
        nodeId: updatedNode.id,
        classNames: updatedNode.classNames ?? createEmptyClassNames(),
        customClasses: updatedNode.customClasses ?? [],
      });
    }
  }

  function applyUpdatedClass(
    className: string,
    updatedClass: CustomClass,
    css?: string,
  ): void {
    customClasses.value[className] = updatedClass;
    if (typeof css === "string") {
      generatedCSS.value = css;
    }
    emitCSSUpdate();
    emitActiveChanged();
  }

  // COMPUTED: Current breakpoint from viewport

  const currentBreakpoint = computed<Breakpoint>(() => {
    const matchingBreakpoint = activeBreakpoints.value.find(
      (breakpoint) => breakpoint.name === targetBreakpoint.value,
    );

    return (matchingBreakpoint?.name ?? "base") as Breakpoint;
  });

  const availableBreakpointNames = computed(() => {
    return [
      "base",
      ...activeBreakpoints.value
        .map((breakpoint) => breakpoint.name)
        .filter((name) => name && name !== "base"),
    ];
  });

  function extractBreakpointFromClassName(className: string): {
    breakpoint?: Breakpoint;
    className: string;
  } {
    const separatorIndex = className.indexOf(":");
    if (separatorIndex <= 0) {
      return { className };
    }

    const prefix = className.slice(0, separatorIndex);
    if (!availableBreakpointNames.value.includes(prefix)) {
      return { className };
    }

    return {
      breakpoint: prefix as Breakpoint,
      className: className.slice(separatorIndex + 1),
    };
  }

  // COMPUTED: Editing mode

  const editingMode = computed<EditingMode>(() => {
    return activeClassName.value ? "class" : "element";
  });

  // COMPUTED: Active class

  const activeClass = computed<CustomClass | null>(() => {
    if (!activeClassName.value) return null;
    return customClasses.value[activeClassName.value] ?? null;
  });

  // COMPUTED: Active rules (for current breakpoint)

  const activeRules = computed<CSSRuleValue[]>(() => {
    if (!activeClass.value) return [];
    const variant = activeClass.value.variants.find(
      (v) => v.breakpoint === currentBreakpoint.value,
    );
    return variant?.rules ?? [];
  });

  function emitCSSUpdate(): void {
    broadcastCssUpdated({
      css: generatedCSS.value,
      authoringMode: authoringMode.value,
    });
  }

  function emitActiveChanged(): void {
    broadcastActiveChanged({
      className: activeClassName.value,
      rules: activeRules.value,
      breakpoint: currentBreakpoint.value,
    });
  }

  function getClassPropertyAuthoredBreakpoints(
    classValue: CustomClass,
    property: string,
  ): string[] {
    return classValue.variants
      .filter((variant) =>
        variant.rules.some((rule) =>
          cssPropertiesEquivalent(rule.property, property),
        ),
      )
      .map((variant) => variant.breakpoint);
  }

  function buildClassPropertyCascadeValues(
    classValue: CustomClass,
    property: string,
    breakpoint: Breakpoint,
    value: string | undefined,
  ): Record<string, string | undefined> | null {
    const authoredBreakpointNames = getClassPropertyAuthoredBreakpoints(
      classValue,
      property,
    );

    if (value === undefined) {
      return buildDesktopFirstCascadeClearValues(
        activeBreakpoints.value,
        breakpoint,
        authoredBreakpointNames,
      );
    }

    return buildDesktopFirstCascadeStyleValues(
      activeBreakpoints.value,
      breakpoint,
      value,
      authoredBreakpointNames,
    );
  }

  function applyClassRuleAtBreakpoint(
    classValue: CustomClass,
    breakpoint: Breakpoint,
    property: string,
    value: string | undefined,
  ): void {
    const variantIndex = classValue.variants.findIndex(
      (variant) => variant.breakpoint === breakpoint,
    );
    const targetVariant =
      variantIndex >= 0
        ? classValue.variants[variantIndex]
        : {
            breakpoint,
            rules: [],
          };
    const normalizedProperty = normalizeStoredCssProperty(property);
    const ruleIndex = targetVariant.rules.findIndex((rule) =>
      cssPropertiesEquivalent(rule.property, normalizedProperty),
    );

    if (typeof value === "string") {
      const important =
        ruleIndex >= 0
          ? (targetVariant.rules[ruleIndex]?.important ?? false)
          : false;
      const nextRule = {
        property: normalizedProperty,
        value,
        important,
      };

      if (ruleIndex >= 0) {
        targetVariant.rules[ruleIndex] = nextRule;
      } else {
        targetVariant.rules.push(nextRule);
      }
    } else if (ruleIndex >= 0) {
      targetVariant.rules.splice(ruleIndex, 1);
    }

    if (targetVariant.rules.length > 0) {
      if (variantIndex >= 0) {
        classValue.variants[variantIndex] = targetVariant;
      } else {
        classValue.variants.push(targetVariant);
      }
      return;
    }

    if (variantIndex >= 0) {
      classValue.variants.splice(variantIndex, 1);
    }
  }

  function previewClassRules(
    updates: Record<string, string | undefined>,
  ): boolean {
    if (!activeClassName.value || !activeClass.value) {
      return false;
    }

    const className = activeClassName.value;
    const nextClass = cloneDeep(activeClass.value);
    const breakpoint = currentBreakpoint.value;

    for (const [property, value] of Object.entries(updates)) {
      const cascadeValues = buildClassPropertyCascadeValues(
        nextClass,
        property,
        breakpoint,
        value,
      );

      if (!cascadeValues) {
        applyClassRuleAtBreakpoint(nextClass, breakpoint, property, value);
        continue;
      }

      for (const [cascadeBreakpoint, cascadeValue] of Object.entries(
        cascadeValues,
      )) {
        applyClassRuleAtBreakpoint(
          nextClass,
          cascadeBreakpoint as Breakpoint,
          property,
          cascadeValue,
        );
      }
    }

    const nextClasses = {
      ...customClasses.value,
      [className]: nextClass,
    };

    customClasses.value = nextClasses;
    generatedCSS.value = generateCustomClasses(nextClasses, BREAKPOINT_WIDTHS);
    emitCSSUpdate();
    emitActiveChanged();

    return true;
  }

  function getClassPseudoPropertyAuthoredBreakpoints(
    classValue: CustomClass,
    state: PseudoState,
    property: string,
  ): string[] {
    return classValue.pseudoVariants
      .filter(
        (variant) =>
          variant.state === state &&
          variant.rules.some((rule) =>
            cssPropertiesEquivalent(rule.property, property),
          ),
      )
      .map((variant) => variant.breakpoint);
  }

  function buildClassPseudoPropertyCascadeValues(
    classValue: CustomClass,
    state: PseudoState,
    property: string,
    breakpoint: Breakpoint,
    value: string | undefined,
  ): Record<string, string | undefined> | null {
    const authoredBreakpointNames = getClassPseudoPropertyAuthoredBreakpoints(
      classValue,
      state,
      property,
    );

    if (value === undefined) {
      return buildDesktopFirstCascadeClearValues(
        activeBreakpoints.value,
        breakpoint,
        authoredBreakpointNames,
      );
    }

    return buildDesktopFirstCascadeStyleValues(
      activeBreakpoints.value,
      breakpoint,
      value,
      authoredBreakpointNames,
    );
  }

  function applyClassPseudoRuleAtBreakpoint(
    classValue: CustomClass,
    state: PseudoState,
    breakpoint: Breakpoint,
    property: string,
    value: string | undefined,
  ): void {
    const pseudoIndex = classValue.pseudoVariants.findIndex(
      (variant) => variant.state === state && variant.breakpoint === breakpoint,
    );
    const targetVariant =
      pseudoIndex >= 0
        ? classValue.pseudoVariants[pseudoIndex]
        : {
            state,
            breakpoint,
            rules: [],
          };
    const normalizedProperty = normalizeStoredCssProperty(property);
    const ruleIndex = targetVariant.rules.findIndex((rule) =>
      cssPropertiesEquivalent(rule.property, normalizedProperty),
    );

    if (typeof value === "string") {
      const important =
        ruleIndex >= 0
          ? (targetVariant.rules[ruleIndex]?.important ?? false)
          : false;
      const nextRule = {
        property: normalizedProperty,
        value,
        important,
      };

      if (ruleIndex >= 0) {
        targetVariant.rules[ruleIndex] = nextRule;
      } else {
        targetVariant.rules.push(nextRule);
      }
    } else if (ruleIndex >= 0) {
      targetVariant.rules.splice(ruleIndex, 1);
    }

    if (targetVariant.rules.length > 0) {
      if (pseudoIndex >= 0) {
        classValue.pseudoVariants[pseudoIndex] = targetVariant;
      } else {
        classValue.pseudoVariants.push(targetVariant);
      }
      return;
    }

    if (pseudoIndex >= 0) {
      classValue.pseudoVariants.splice(pseudoIndex, 1);
    }
  }

  function previewClassPseudoRules(
    state: PseudoState,
    updates: Record<string, string | undefined>,
  ): boolean {
    if (!activeClassName.value || !activeClass.value) {
      return false;
    }

    const className = activeClassName.value;
    const nextClass = cloneDeep(activeClass.value);
    const breakpoint = currentBreakpoint.value;

    for (const [property, value] of Object.entries(updates)) {
      const cascadeValues = buildClassPseudoPropertyCascadeValues(
        nextClass,
        state,
        property,
        breakpoint,
        value,
      );

      if (!cascadeValues) {
        applyClassPseudoRuleAtBreakpoint(
          nextClass,
          state,
          breakpoint,
          property,
          value,
        );
        continue;
      }

      for (const [cascadeBreakpoint, cascadeValue] of Object.entries(
        cascadeValues,
      )) {
        applyClassPseudoRuleAtBreakpoint(
          nextClass,
          state,
          cascadeBreakpoint as Breakpoint,
          property,
          cascadeValue,
        );
      }
    }

    const nextClasses = {
      ...customClasses.value,
      [className]: nextClass,
    };

    customClasses.value = nextClasses;
    generatedCSS.value = generateCustomClasses(nextClasses, BREAKPOINT_WIDTHS);
    emitCSSUpdate();
    emitActiveChanged();

    return true;
  }

  async function loadClasses(force = false): Promise<void> {
    if (!force && initialized && Object.keys(customClasses.value).length > 0) {
      return; // Already loaded
    }

    isLoading.value = true;
    error.value = null;

    try {
      const result = unwrapClassEditorActionResult(
        await actions.styles.getClasses({}),
        ClassEditorGetClassesActionSuccessSchema,
        "Failed to load classes",
        {
          source: "useClassEditor.loadClasses",
        },
      );

      if (!result.success) {
        error.value = result.error;
        return;
      }

      customClasses.value = cloneDeep(result.data.data.classes);
      authoringMode.value = result.data.data.authoringMode;
      generatedCSS.value = result.data.data.css;
      initialized = true;

      emitCSSUpdate();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load classes";
    } finally {
      isLoading.value = false;
    }
  }

  async function createClass(
    name: string,
    description?: string,
  ): Promise<boolean> {
    isLoading.value = true;
    error.value = null;

    try {
      const result = await recordCreateClass(
        {
          name,
          description,
        },
        {
          snapshotSchema: ClassEditorSnapshotSchema,
          captureSnapshot: () => ({
            customClasses: customClasses.value,
            generatedCSS: generatedCSS.value,
            activeClassName: activeClassName.value,
          }),
          applySnapshot: applyClassEditorSnapshot,
          onSnapshotError: (message) => {
            error.value = message;
          },
          onApplied: ({ className, createdClass, css }) => {
            customClasses.value[className] = createdClass;
            generatedCSS.value = css || generatedCSS.value;
            emitCSSUpdate();
          },
        },
      );

      if (!result.success) {
        error.value = result.error ?? "Failed to create class";
        return false;
      }

      return true;
    } catch (e) {
      if (!error.value) {
        error.value = e instanceof Error ? e.message : "Failed to create class";
      }
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function deleteClass(name: string): Promise<boolean> {
    isLoading.value = true;
    error.value = null;

    try {
      const wasActive = activeClassName.value === name;

      const result = await recordDeleteClass(
        { name },
        {
          snapshotSchema: ClassEditorSnapshotSchema,
          captureSnapshot: () => ({
            customClasses: customClasses.value,
            generatedCSS: generatedCSS.value,
            activeClassName: activeClassName.value,
          }),
          applySnapshot: applyClassEditorSnapshot,
          onSnapshotError: (message) => {
            error.value = message;
          },
          onApplied: ({ className, css }) => {
            delete customClasses.value[className];
            generatedCSS.value = css || generatedCSS.value;

            if (wasActive) {
              activeClassName.value = null;
              emitActiveChanged();
            }

            emitCSSUpdate();
          },
        },
      );

      if (!result.success) {
        error.value = result.error ?? "Failed to delete class";
        return false;
      }

      return true;
    } catch (e) {
      if (!error.value) {
        error.value = e instanceof Error ? e.message : "Failed to delete class";
      }
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function deleteClasses(names: string[]): Promise<boolean> {
    isLoading.value = true;
    error.value = null;

    try {
      const wasActive =
        activeClassName.value !== null && names.includes(activeClassName.value);

      const result = await recordDeleteClasses(
        { names },
        {
          snapshotSchema: ClassEditorSnapshotSchema,
          captureSnapshot: () => ({
            customClasses: customClasses.value,
            generatedCSS: generatedCSS.value,
            activeClassName: activeClassName.value,
          }),
          applySnapshot: applyClassEditorSnapshot,
          onSnapshotError: (message) => {
            error.value = message;
          },
          onApplied: ({ names: deletedNames, css }) => {
            for (const name of deletedNames) {
              delete customClasses.value[name];
            }

            generatedCSS.value = css || generatedCSS.value;

            if (wasActive) {
              activeClassName.value = null;
              emitActiveChanged();
            }

            emitCSSUpdate();
          },
        },
      );

      if (!result.success) {
        error.value = result.error ?? "Failed to delete classes";
        return false;
      }

      return true;
    } catch (e) {
      if (!error.value) {
        error.value =
          e instanceof Error ? e.message : "Failed to delete classes";
      }
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function renameClass(
    oldName: string,
    newName: string,
  ): Promise<boolean> {
    isLoading.value = true;
    error.value = null;

    try {
      const result = await recordRenameClass(
        { oldName, newName },
        {
          onRedo: ({ previousName, nextName, updatedClass, css }) => {
            delete customClasses.value[previousName];
            customClasses.value[nextName] = updatedClass;
            generatedCSS.value = css || generatedCSS.value;

            if (activeClassName.value === previousName) {
              activeClassName.value = nextName;
            }

            replaceSelectedNodeCustomClassReference(previousName, nextName);
            emitCSSUpdate();
            emitActiveChanged();
            broadcastClassRenamed({
              oldName: previousName,
              newName: nextName,
            });
          },
          onUndo: ({ previousName, nextName, updatedClass, css }) => {
            delete customClasses.value[previousName];
            customClasses.value[nextName] = updatedClass;
            generatedCSS.value = css || generatedCSS.value;

            if (activeClassName.value === previousName) {
              activeClassName.value = nextName;
            }

            replaceSelectedNodeCustomClassReference(previousName, nextName);
            emitCSSUpdate();
            emitActiveChanged();
            broadcastClassRenamed({
              oldName: previousName,
              newName: nextName,
            });
          },
        },
      );

      if (!result.success) {
        error.value = result.error ?? "Failed to rename class";
        return false;
      }

      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to rename class";
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function duplicateClass(
    sourceName: string,
    newName: string,
  ): Promise<boolean> {
    isLoading.value = true;
    error.value = null;

    try {
      const result = await recordDuplicateClass(
        { sourceName, newName },
        {
          onRedo: ({ className, duplicatedClass, css }) => {
            customClasses.value[className] = duplicatedClass;
            generatedCSS.value = css || generatedCSS.value;
            emitCSSUpdate();
          },
          onUndo: ({ className, css }) => {
            delete customClasses.value[className];
            generatedCSS.value = css || generatedCSS.value;
            emitCSSUpdate();
          },
        },
      );

      if (!result.success) {
        error.value = result.error ?? "Failed to duplicate class";
        return false;
      }

      return true;
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Failed to duplicate class";
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function copyClassStyles(
    sourceName: string,
    targetName: string,
  ): Promise<boolean> {
    isLoading.value = true;
    error.value = null;

    try {
      const previousTargetClass = customClasses.value[targetName];
      if (!previousTargetClass) {
        error.value = `Class "${targetName}" not found`;
        return false;
      }

      const result = await recordReplaceClassStyles(
        { sourceName, targetName },
        cloneDeep(previousTargetClass),
        {
          onRedo: ({ targetName: updatedName, updatedClass, css }) => {
            customClasses.value[updatedName] = updatedClass;
            generatedCSS.value = css || generatedCSS.value;
            emitCSSUpdate();
            if (activeClassName.value === updatedName) {
              emitActiveChanged();
            }
          },
          onUndo: ({ targetName: updatedName, updatedClass, css }) => {
            customClasses.value[updatedName] = updatedClass;
            generatedCSS.value = css || generatedCSS.value;
            emitCSSUpdate();
            if (activeClassName.value === updatedName) {
              emitActiveChanged();
            }
          },
        },
      );

      if (!result.success) {
        error.value = result.error ?? "Failed to copy class styles";
        return false;
      }

      return true;
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Failed to copy class styles";
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function replaceClassStyles(
    targetName: string,
    variants: BreakpointVariant[],
    pseudoVariants: PseudoVariant[],
  ): Promise<boolean> {
    isLoading.value = true;
    error.value = null;

    try {
      const previousTargetClass = customClasses.value[targetName];
      if (!previousTargetClass) {
        error.value = `Class "${targetName}" not found`;
        return false;
      }

      const result = await recordReplaceClassStyles(
        {
          targetName,
          variants: cloneDeep(variants),
          pseudoVariants: cloneDeep(pseudoVariants),
        },
        cloneDeep(previousTargetClass),
        {
          onRedo: ({ targetName: updatedName, updatedClass, css }) => {
            customClasses.value[updatedName] = updatedClass;
            generatedCSS.value = css || generatedCSS.value;
            emitCSSUpdate();
            if (activeClassName.value === updatedName) {
              emitActiveChanged();
            }
          },
          onUndo: ({ targetName: updatedName, updatedClass, css }) => {
            customClasses.value[updatedName] = updatedClass;
            generatedCSS.value = css || generatedCSS.value;
            emitCSSUpdate();
            if (activeClassName.value === updatedName) {
              emitActiveChanged();
            }
          },
        },
      );

      if (!result.success) {
        error.value = result.error ?? "Failed to replace class styles";
        return false;
      }

      return true;
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Failed to replace class styles";
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function replaceClassVariantRules(
    className: string,
    breakpoint: Breakpoint,
    pseudoState: InspectorPseudoState,
    rules: CSSRuleValue[],
    options?: { preserveActiveClass?: boolean },
  ): Promise<boolean> {
    isLoading.value = true;
    error.value = null;

    const preserveActiveClass = options?.preserveActiveClass ?? false;
    const previousClass = customClasses.value[className];

    if (!previousClass) {
      error.value = `Class "${className}" not found`;
      isLoading.value = false;
      return false;
    }

    try {
      const hadActiveClass = activeClassName.value === className;
      if (!hadActiveClass) {
        setActiveClass(className);
      }

      const result = await recordReplaceClassVariantRules(
        {
          className,
          breakpoint,
          pseudoState,
          rules: cloneDeep(rules),
        },
        cloneDeep(previousClass),
        {
          onRedo: ({ targetName, updatedClass, css }) => {
            customClasses.value[targetName] = updatedClass;
            generatedCSS.value = css || generatedCSS.value;
            emitCSSUpdate();
            if (activeClassName.value === targetName) {
              emitActiveChanged();
            }
          },
          onUndo: ({ targetName, updatedClass, css }) => {
            customClasses.value[targetName] = updatedClass;
            generatedCSS.value = css || generatedCSS.value;
            emitCSSUpdate();
            if (activeClassName.value === targetName) {
              emitActiveChanged();
            }
          },
        },
      );

      if (!result.success) {
        error.value = result.error ?? "Failed to replace class variant rules";
        return false;
      }

      if (!preserveActiveClass && !hadActiveClass) {
        clearActiveClass();
      } else if (preserveActiveClass || hadActiveClass) {
        setActiveClass(className);
      }

      return true;
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Failed to replace class variant rules";
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  function setActiveClass(name: string | null): void {
    activeClassName.value = name;
    emitActiveChanged();

    broadcastModeChanged({
      mode: editingMode.value,
      className: name,
    });
  }

  function clearActiveClass(): void {
    setActiveClass(null);
  }

  function getClassRule(
    property: string,
    breakpoint?: Breakpoint,
  ): string | undefined {
    if (!activeClass.value) return undefined;

    const bp = breakpoint ?? currentBreakpoint.value;
    const variant = activeClass.value.variants.find((v) => v.breakpoint === bp);
    const rule = variant?.rules.find((r) =>
      cssPropertiesEquivalent(r.property, property),
    );

    return rule?.value;
  }

  async function setClassRule(
    property: string,
    value: string,
    important?: boolean,
  ): Promise<boolean> {
    if (!activeClassName.value || !activeClass.value) return false;

    const className = activeClassName.value;
    const cascadeValues = buildClassPropertyCascadeValues(
      activeClass.value,
      property,
      currentBreakpoint.value,
      value,
    );
    const breakpointUpdates =
      cascadeValues ??
      ({
        [currentBreakpoint.value]: value,
      } as Record<string, string | undefined>);

    isLoading.value = true;
    error.value = null;

    try {
      await recordStateSnapshotAdvanced({
        type: "update-class-rule",
        description: `Update ${className}: ${property}`,
        group: {
          key: `class-rule:${className}:${currentBreakpoint.value}:${property}`,
          windowMs: 900,
        },
        captureState: () => ({
          customClasses: { ...customClasses.value },
          generatedCSS: generatedCSS.value,
        }),
        action: async () => {
          for (const [breakpoint, breakpointValue] of Object.entries(
            breakpointUpdates,
          )) {
            if (breakpointValue === undefined) {
              const validatedRemove = RemoveClassRuleInputSchema.safeParse({
                className,
                breakpoint,
                property,
              });

              if (!validatedRemove.success) {
                error.value =
                  validatedRemove.error.issues[0]?.message ?? "Invalid input";
                throw new Error(error.value);
              }

              const removeResult = unwrapClassEditorActionResult(
                await actions.styles.removeClassRule(validatedRemove.data),
                ClassEditorClassActionSuccessSchema,
                "Failed to remove rule",
                {
                  source: "useClassEditor.setClassRule",
                  className,
                  breakpoint,
                  property,
                },
              );

              if (!removeResult.success) {
                error.value = removeResult.error;
                throw new Error(error.value);
              }

              applyUpdatedClass(
                className,
                removeResult.data.data.class,
                removeResult.data.data.css,
              );
              continue;
            }

            const validatedInput = UpdateClassRuleInputSchema.safeParse({
              className,
              breakpoint,
              property,
              value: breakpointValue,
              important: important ?? false,
            });

            if (!validatedInput.success) {
              error.value =
                validatedInput.error.issues[0]?.message ?? "Invalid input";
              throw new Error(error.value);
            }

            const result = unwrapClassEditorActionResult(
              await actions.styles.updateClassRule(validatedInput.data),
              ClassEditorClassActionSuccessSchema,
              "Failed to update rule",
              {
                source: "useClassEditor.setClassRule",
                className,
                breakpoint,
                property,
              },
            );

            if (!result.success) {
              error.value = result.error;
              throw new Error(error.value);
            }

            applyUpdatedClass(
              className,
              result.data.data.class,
              result.data.data.css,
            );
          }

          return true;
        },
        restoreProperty: async (_state, prop, val) => {
          if (prop === "customClasses") {
            restoreCustomClasses(val);
          } else if (prop === "generatedCSS") {
            generatedCSS.value =
              typeof val === "string" ? val : generatedCSS.value;
          }
          emitCSSUpdate();
          emitActiveChanged();
        },
      });

      return true;
    } catch (e) {
      if (!error.value) {
        error.value = e instanceof Error ? e.message : "Failed to update rule";
      }
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  function buildClassRulesGroupKey(
    prefix: string,
    className: string,
    properties: readonly string[],
  ): string {
    const sortedProperties = [...properties].sort().join(",");
    return `${prefix}:${className}:${currentBreakpoint.value}:${sortedProperties}`;
  }

  async function setClassRules(
    rules: Record<string, string>,
    important?: boolean,
  ): Promise<boolean> {
    const entries = Object.entries(rules).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );

    if (!activeClassName.value) {
      return false;
    }

    if (entries.length === 0) {
      return true;
    }

    if (entries.length === 1) {
      const [property, value] = entries[0];
      return setClassRule(property, value, important);
    }

    const className = activeClassName.value;
    isLoading.value = true;
    error.value = null;

    try {
      const inputs: Array<z.infer<typeof UpdateClassRuleInputSchema>> = [];

      for (const [property, value] of entries) {
        const parsed = UpdateClassRuleInputSchema.safeParse({
          className,
          breakpoint: currentBreakpoint.value,
          property,
          value,
          important: important ?? false,
        });

        if (!parsed.success) {
          error.value = parsed.error.issues[0]?.message ?? "Invalid input";
          return false;
        }

        inputs.push(parsed.data);
      }

      const propertyNames = inputs.map((input) => input.property);

      await recordStateSnapshotAdvanced({
        type: "update-class-rule",
        description: `Update ${className}: ${propertyNames.join(", ")}`,
        group: {
          key: buildClassRulesGroupKey("class-rules", className, propertyNames),
          windowMs: 900,
        },
        captureState: () => ({
          customClasses: { ...customClasses.value },
          generatedCSS: generatedCSS.value,
        }),
        action: async () => {
          let latestClass: CustomClass | null = null;
          let latestCss: string | undefined;

          for (const input of inputs) {
            const result = unwrapClassEditorActionResult(
              await actions.styles.updateClassRule(input),
              ClassEditorClassActionSuccessSchema,
              "Failed to update rule",
              {
                source: "useClassEditor.setClassRules",
                className,
                breakpoint: currentBreakpoint.value,
                property: input.property,
              },
            );

            if (!result.success) {
              error.value = result.error;
              throw new Error(error.value);
            }

            latestClass = result.data.data.class;
            latestCss = result.data.data.css;
          }

          if (latestClass) {
            applyUpdatedClass(className, latestClass, latestCss);
          }

          return true;
        },
        restoreProperty: async (_state, prop, val) => {
          if (prop === "customClasses") {
            restoreCustomClasses(val);
          } else if (prop === "generatedCSS") {
            generatedCSS.value =
              typeof val === "string" ? val : generatedCSS.value;
          }
          emitCSSUpdate();
          emitActiveChanged();
        },
      });

      return true;
    } catch (e) {
      if (!error.value) {
        error.value = e instanceof Error ? e.message : "Failed to update rules";
      }
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function removeClassRule(property: string): Promise<boolean> {
    if (!activeClassName.value || !activeClass.value) return false;

    const className = activeClassName.value;
    const cascadeValues = buildClassPropertyCascadeValues(
      activeClass.value,
      property,
      currentBreakpoint.value,
      undefined,
    );
    const breakpointUpdates =
      cascadeValues ??
      ({
        [currentBreakpoint.value]: undefined,
      } as Record<string, string | undefined>);

    isLoading.value = true;
    error.value = null;

    try {
      await recordStateSnapshotAdvanced({
        type: "remove-class-rule",
        description: `Remove rule from ${className}: ${property}`,
        group: {
          key: `class-rule:${className}:${currentBreakpoint.value}:${property}`,
          windowMs: 900,
        },
        captureState: () => ({
          customClasses: { ...customClasses.value },
          generatedCSS: generatedCSS.value,
        }),
        action: async () => {
          for (const [breakpoint] of Object.entries(breakpointUpdates)) {
            const validatedInput = RemoveClassRuleInputSchema.safeParse({
              className,
              breakpoint,
              property,
            });

            if (!validatedInput.success) {
              error.value =
                validatedInput.error.issues[0]?.message ?? "Invalid input";
              throw new Error(error.value);
            }

            const result = unwrapClassEditorActionResult(
              await actions.styles.removeClassRule(validatedInput.data),
              ClassEditorClassActionSuccessSchema,
              "Failed to remove rule",
              {
                source: "useClassEditor.removeClassRule",
                className,
                breakpoint,
                property,
              },
            );

            if (!result.success) {
              error.value = result.error;
              throw new Error(error.value);
            }

            applyUpdatedClass(
              className,
              result.data.data.class,
              result.data.data.css,
            );
          }

          return true;
        },
        restoreProperty: async (_state, prop, val) => {
          if (prop === "customClasses") {
            restoreCustomClasses(val);
          } else if (prop === "generatedCSS") {
            generatedCSS.value =
              typeof val === "string" ? val : generatedCSS.value;
          }
          emitCSSUpdate();
          emitActiveChanged();
        },
      });

      return true;
    } catch (e) {
      if (!error.value) {
        error.value = e instanceof Error ? e.message : "Failed to remove rule";
      }
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function removeClassRules(
    properties: readonly string[],
  ): Promise<boolean> {
    const uniqueProperties = [...new Set(properties)].filter(
      (property) => property.trim().length > 0,
    );

    if (!activeClassName.value) {
      return false;
    }

    if (uniqueProperties.length === 0) {
      return true;
    }

    if (uniqueProperties.length === 1) {
      return removeClassRule(uniqueProperties[0]);
    }

    const className = activeClassName.value;
    isLoading.value = true;
    error.value = null;

    try {
      const inputs: Array<z.infer<typeof RemoveClassRuleInputSchema>> = [];

      for (const property of uniqueProperties) {
        const parsed = RemoveClassRuleInputSchema.safeParse({
          className,
          breakpoint: currentBreakpoint.value,
          property,
        });

        if (!parsed.success) {
          error.value = parsed.error.issues[0]?.message ?? "Invalid input";
          return false;
        }

        inputs.push(parsed.data);
      }

      await recordStateSnapshotAdvanced({
        type: "remove-class-rule",
        description: `Remove rules from ${className}: ${uniqueProperties.join(", ")}`,
        group: {
          key: buildClassRulesGroupKey(
            "class-rules-remove",
            className,
            uniqueProperties,
          ),
          windowMs: 900,
        },
        captureState: () => ({
          customClasses: { ...customClasses.value },
          generatedCSS: generatedCSS.value,
        }),
        action: async () => {
          let latestClass: CustomClass | null = null;
          let latestCss: string | undefined;

          for (const input of inputs) {
            const result = unwrapClassEditorActionResult(
              await actions.styles.removeClassRule(input),
              ClassEditorClassActionSuccessSchema,
              "Failed to remove rule",
              {
                source: "useClassEditor.removeClassRules",
                className,
                breakpoint: currentBreakpoint.value,
                property: input.property,
              },
            );

            if (!result.success) {
              error.value = result.error;
              throw new Error(error.value);
            }

            latestClass = result.data.data.class;
            latestCss = result.data.data.css;
          }

          if (latestClass) {
            applyUpdatedClass(className, latestClass, latestCss);
          }

          return true;
        },
        restoreProperty: async (_state, prop, val) => {
          if (prop === "customClasses") {
            restoreCustomClasses(val);
          } else if (prop === "generatedCSS") {
            generatedCSS.value =
              typeof val === "string" ? val : generatedCSS.value;
          }
          emitCSSUpdate();
          emitActiveChanged();
        },
      });

      return true;
    } catch (e) {
      if (!error.value) {
        error.value = e instanceof Error ? e.message : "Failed to remove rules";
      }
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  function getClassPseudoRule(
    state: PseudoState,
    property: string,
    breakpoint?: Breakpoint,
  ): string | undefined {
    if (!activeClass.value) return undefined;

    const bp = breakpoint ?? currentBreakpoint.value;
    const pseudo = activeClass.value.pseudoVariants.find(
      (p) => p.state === state && p.breakpoint === bp,
    );
    const rule = pseudo?.rules.find((r) =>
      cssPropertiesEquivalent(r.property, property),
    );

    return rule?.value;
  }

  async function setClassPseudoRule(
    pseudoState: PseudoState,
    property: string,
    value: string,
    important?: boolean,
  ): Promise<boolean> {
    if (!activeClassName.value || !activeClass.value) return false;

    const className = activeClassName.value;
    const cascadeValues = buildClassPseudoPropertyCascadeValues(
      activeClass.value,
      pseudoState,
      property,
      currentBreakpoint.value,
      value,
    );
    const breakpointUpdates =
      cascadeValues ??
      ({
        [currentBreakpoint.value]: value,
      } as Record<string, string | undefined>);

    isLoading.value = true;
    error.value = null;

    try {
      await recordStateSnapshotAdvanced({
        type: "update-class-pseudo-rule",
        description: `Update ${className}:${pseudoState}: ${property}`,
        group: {
          key: `class-pseudo-rule:${className}:${pseudoState}:${currentBreakpoint.value}:${property}`,
          windowMs: 900,
        },
        captureState: () => ({
          customClasses: { ...customClasses.value },
          generatedCSS: generatedCSS.value,
        }),
        action: async () => {
          for (const [breakpoint, breakpointValue] of Object.entries(
            breakpointUpdates,
          )) {
            if (breakpointValue === undefined) {
              const validatedRemove =
                RemoveClassPseudoRuleInputSchema.safeParse({
                  className,
                  state: pseudoState,
                  breakpoint,
                  property,
                });

              if (!validatedRemove.success) {
                error.value =
                  validatedRemove.error.issues[0]?.message ?? "Invalid input";
                throw new Error(error.value);
              }

              const removeResult = unwrapClassEditorActionResult(
                await actions.styles.removeClassPseudoRule(
                  validatedRemove.data,
                ),
                ClassEditorClassActionSuccessSchema,
                "Failed to remove pseudo rule",
                {
                  source: "useClassEditor.setClassPseudoRule",
                  className,
                  breakpoint,
                  property,
                  pseudoState,
                },
              );

              if (!removeResult.success) {
                error.value = removeResult.error;
                throw new Error(error.value);
              }

              applyUpdatedClass(
                className,
                removeResult.data.data.class,
                removeResult.data.data.css,
              );
              continue;
            }

            const validatedInput = UpdateClassPseudoRuleInputSchema.safeParse({
              className,
              state: pseudoState,
              breakpoint,
              property,
              value: breakpointValue,
              important: important ?? false,
            });

            if (!validatedInput.success) {
              error.value =
                validatedInput.error.issues[0]?.message ?? "Invalid input";
              throw new Error(error.value);
            }

            const result = unwrapClassEditorActionResult(
              await actions.styles.updateClassPseudoRule(validatedInput.data),
              ClassEditorClassActionSuccessSchema,
              "Failed to update pseudo rule",
              {
                source: "useClassEditor.setClassPseudoRule",
                className,
                breakpoint,
                property,
                pseudoState,
              },
            );

            if (!result.success) {
              error.value = result.error;
              throw new Error(error.value);
            }

            applyUpdatedClass(
              className,
              result.data.data.class,
              result.data.data.css,
            );
          }

          return true;
        },
        restoreProperty: async (_state, prop, val) => {
          if (prop === "customClasses") {
            restoreCustomClasses(val);
          } else if (prop === "generatedCSS") {
            generatedCSS.value =
              typeof val === "string" ? val : generatedCSS.value;
          }
          emitCSSUpdate();
          emitActiveChanged();
        },
      });

      return true;
    } catch (e) {
      if (!error.value) {
        error.value =
          e instanceof Error ? e.message : "Failed to update pseudo rule";
      }
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function setClassPseudoRules(
    pseudoState: PseudoState,
    rules: Record<string, string>,
    important?: boolean,
  ): Promise<boolean> {
    const entries = Object.entries(rules).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );

    if (!activeClassName.value) {
      return false;
    }

    if (entries.length === 0) {
      return true;
    }

    if (entries.length === 1) {
      const [property, value] = entries[0];
      return setClassPseudoRule(pseudoState, property, value, important);
    }

    const className = activeClassName.value;
    isLoading.value = true;
    error.value = null;

    try {
      const inputs: Array<z.infer<typeof UpdateClassPseudoRuleInputSchema>> =
        [];

      for (const [property, value] of entries) {
        const parsed = UpdateClassPseudoRuleInputSchema.safeParse({
          className,
          state: pseudoState,
          breakpoint: currentBreakpoint.value,
          property,
          value,
          important: important ?? false,
        });

        if (!parsed.success) {
          error.value = parsed.error.issues[0]?.message ?? "Invalid input";
          return false;
        }

        inputs.push(parsed.data);
      }

      const propertyNames = inputs.map((input) => input.property);

      await recordStateSnapshotAdvanced({
        type: "update-class-pseudo-rule",
        description: `Update ${className}:${pseudoState}: ${propertyNames.join(", ")}`,
        group: {
          key: buildClassRulesGroupKey(
            `class-pseudo-rules:${pseudoState}`,
            className,
            propertyNames,
          ),
          windowMs: 900,
        },
        captureState: () => ({
          customClasses: { ...customClasses.value },
          generatedCSS: generatedCSS.value,
        }),
        action: async () => {
          let latestClass: CustomClass | null = null;
          let latestCss: string | undefined;

          for (const input of inputs) {
            const result = unwrapClassEditorActionResult(
              await actions.styles.updateClassPseudoRule(input),
              ClassEditorClassActionSuccessSchema,
              "Failed to update pseudo rule",
              {
                source: "useClassEditor.setClassPseudoRules",
                className,
                breakpoint: currentBreakpoint.value,
                property: input.property,
                pseudoState,
              },
            );

            if (!result.success) {
              error.value = result.error;
              throw new Error(error.value);
            }

            latestClass = result.data.data.class;
            latestCss = result.data.data.css;
          }

          if (latestClass) {
            applyUpdatedClass(className, latestClass, latestCss);
          }

          return true;
        },
        restoreProperty: async (_state, prop, val) => {
          if (prop === "customClasses") {
            restoreCustomClasses(val);
          } else if (prop === "generatedCSS") {
            generatedCSS.value =
              typeof val === "string" ? val : generatedCSS.value;
          }
          emitCSSUpdate();
          emitActiveChanged();
        },
      });

      return true;
    } catch (e) {
      if (!error.value) {
        error.value =
          e instanceof Error ? e.message : "Failed to update pseudo rules";
      }
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function removeClassPseudoRule(
    pseudoState: PseudoState,
    property: string,
  ): Promise<boolean> {
    if (!activeClassName.value) return false;

    const className = activeClassName.value;
    isLoading.value = true;
    error.value = null;

    try {
      const validatedInput = RemoveClassPseudoRuleInputSchema.safeParse({
        className,
        state: pseudoState,
        breakpoint: currentBreakpoint.value,
        property,
      });

      if (!validatedInput.success) {
        error.value =
          validatedInput.error.issues[0]?.message ?? "Invalid input";
        return false;
      }

      await recordStateSnapshotAdvanced({
        type: "remove-class-pseudo-rule",
        description: `Remove rule from ${className}:${pseudoState}: ${property}`,
        group: {
          key: `class-pseudo-rule:${className}:${pseudoState}:${currentBreakpoint.value}:${property}`,
          windowMs: 900,
        },
        captureState: () => ({
          customClasses: { ...customClasses.value },
          generatedCSS: generatedCSS.value,
        }),
        action: async () => {
          const result = unwrapClassEditorActionResult(
            await actions.styles.removeClassPseudoRule(validatedInput.data),
            ClassEditorClassActionSuccessSchema,
            "Failed to remove pseudo rule",
            {
              source: "useClassEditor.removeClassPseudoRule",
              className,
              breakpoint: currentBreakpoint.value,
              property,
              pseudoState,
            },
          );

          if (!result.success) {
            error.value = result.error;
            throw new Error(error.value);
          }

          applyUpdatedClass(
            className,
            result.data.data.class,
            result.data.data.css,
          );

          return true;
        },
        restoreProperty: async (_state, prop, val) => {
          if (prop === "customClasses") {
            restoreCustomClasses(val);
          } else if (prop === "generatedCSS") {
            generatedCSS.value =
              typeof val === "string" ? val : generatedCSS.value;
          }
          emitCSSUpdate();
          emitActiveChanged();
        },
      });

      return true;
    } catch (e) {
      if (!error.value) {
        error.value =
          e instanceof Error ? e.message : "Failed to remove pseudo rule";
      }
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function removeClassPseudoRules(
    pseudoState: PseudoState,
    properties: readonly string[],
  ): Promise<boolean> {
    const uniqueProperties = [...new Set(properties)].filter(
      (property) => property.trim().length > 0,
    );

    if (!activeClassName.value) {
      return false;
    }

    if (uniqueProperties.length === 0) {
      return true;
    }

    if (uniqueProperties.length === 1) {
      return removeClassPseudoRule(pseudoState, uniqueProperties[0]);
    }

    const className = activeClassName.value;
    isLoading.value = true;
    error.value = null;

    try {
      const inputs: Array<z.infer<typeof RemoveClassPseudoRuleInputSchema>> =
        [];

      for (const property of uniqueProperties) {
        const parsed = RemoveClassPseudoRuleInputSchema.safeParse({
          className,
          state: pseudoState,
          breakpoint: currentBreakpoint.value,
          property,
        });

        if (!parsed.success) {
          error.value = parsed.error.issues[0]?.message ?? "Invalid input";
          return false;
        }

        inputs.push(parsed.data);
      }

      await recordStateSnapshotAdvanced({
        type: "remove-class-pseudo-rule",
        description: `Remove rules from ${className}:${pseudoState}: ${uniqueProperties.join(", ")}`,
        group: {
          key: buildClassRulesGroupKey(
            `class-pseudo-rules-remove:${pseudoState}`,
            className,
            uniqueProperties,
          ),
          windowMs: 900,
        },
        captureState: () => ({
          customClasses: { ...customClasses.value },
          generatedCSS: generatedCSS.value,
        }),
        action: async () => {
          let latestClass: CustomClass | null = null;
          let latestCss: string | undefined;

          for (const input of inputs) {
            const result = unwrapClassEditorActionResult(
              await actions.styles.removeClassPseudoRule(input),
              ClassEditorClassActionSuccessSchema,
              "Failed to remove pseudo rule",
              {
                source: "useClassEditor.removeClassPseudoRules",
                className,
                breakpoint: currentBreakpoint.value,
                property: input.property,
                pseudoState,
              },
            );

            if (!result.success) {
              error.value = result.error;
              throw new Error(error.value);
            }

            latestClass = result.data.data.class;
            latestCss = result.data.data.css;
          }

          if (latestClass) {
            applyUpdatedClass(className, latestClass, latestCss);
          }

          return true;
        },
        restoreProperty: async (_state, prop, val) => {
          if (prop === "customClasses") {
            restoreCustomClasses(val);
          } else if (prop === "generatedCSS") {
            generatedCSS.value =
              typeof val === "string" ? val : generatedCSS.value;
          }
          emitCSSUpdate();
          emitActiveChanged();
        },
      });

      return true;
    } catch (e) {
      if (!error.value) {
        error.value =
          e instanceof Error ? e.message : "Failed to remove pseudo rules";
      }
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function setAuthoringMode(mode: AuthoringMode): Promise<boolean> {
    isLoading.value = true;
    error.value = null;

    try {
      const previousMode = authoringMode.value;
      const parsedNextMode = AuthoringModeSchema.safeParse(mode);
      if (!parsedNextMode.success) {
        error.value =
          parsedNextMode.error.issues[0]?.message ?? "Invalid input";
        return false;
      }

      const result = await recordAuthoringModeChange(
        {
          previousMode,
          nextMode: parsedNextMode.data,
        },
        {
          onRedo: (nextMode) => {
            authoringMode.value = nextMode;
            broadcastAuthoringModeChanged({
              mode: nextMode,
            });
            emitCSSUpdate();
          },
          onUndo: (restoredMode) => {
            authoringMode.value = restoredMode;
            broadcastAuthoringModeChanged({
              mode: restoredMode,
            });
            emitCSSUpdate();
          },
        },
      );

      if (!result.success) {
        error.value = result.error ?? "Failed to set authoring mode";
        return false;
      }

      return true;
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Failed to set authoring mode";
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  // NODE CLASS MANAGEMENT (utility classes on elements)

  /**
   * /** Add a utility class to a node at a specific breakpoint
   * and/or pseudo-selector. SMART DEFAULTS: - Classes go to `base` by default (works.
   */
  async function addUtilityClass(
    collection: "pages" | "layouts" | "components",
    id: string,
    nodeId: string,
    className: string,
    breakpoint?: Breakpoint,
    pseudo?: PseudoSelector,
  ): Promise<boolean> {
    let bp: Breakpoint = breakpoint ?? "base";
    let actualClassName = className;

    const extracted = extractBreakpointFromClassName(className);
    if (extracted.breakpoint) {
      bp = extracted.breakpoint;
      actualClassName = extracted.className;
    }

    const key = buildClassNameKey(pseudo, bp);

    try {
      const validatedInput = UtilityClassInputSchema.safeParse({
        collection,
        id,
        nodeId,
        className: actualClassName,
        key,
      });

      if (!validatedInput.success) {
        error.value =
          validatedInput.error.issues[0]?.message ?? "Invalid input";
        return false;
      }

      await recordStateSnapshotAdvanced({
        type: "add-utility-class",
        description: `Add class: ${actualClassName}`,
        affectedNodeIds: [nodeId],
        captureState: () => ({
          focusedNodeClasses: selectedNode.value?.classNames
            ? JSON.parse(JSON.stringify(selectedNode.value.classNames))
            : { base: [] },
        }),
        action: async () => {
          const result = unwrapNodeUtilityClassActionResult(
            await actions.nodes.addUtilityClass(validatedInput.data),
            "Failed to add utility class",
            {
              source: "useClassEditor.addUtilityClass",
              collection,
              id,
              nodeId,
              className: actualClassName,
              key,
            },
          );

          if (!result.success) {
            error.value = result.error;
            throw new Error(error.value);
          }

          // Update the selected node locally to trigger reactivity
          if (selectedNode.value && selectedNode.value.id === nodeId) {
            const currentClassNames =
              selectedNode.value.classNames ?? createEmptyClassNames();
            const keyClasses = new Set(currentClassNames[key] ?? []);
            keyClasses.add(actualClassName);

            const updatedNode = updateSelectedNodeClassNames(nodeId, {
              ...currentClassNames,
              [key]: Array.from(keyClasses),
            });

            if (updatedNode) {
              broadcastClassUpdate({
                nodeId,
                classNames: updatedNode.classNames ?? createEmptyClassNames(),
              });
            }
          }

          broadcastNodeClassAdded({
            collection,
            id,
            nodeId,
            className: actualClassName,
            key,
          });

          return result.version;
        },
        restoreProperty: async (_state, property, value) => {
          if (
            property === "focusedNodeClasses" &&
            selectedNode.value &&
            selectedNode.value.id === nodeId
          ) {
            // Determine if we're adding or removing the class based on the state
            const currentClasses = selectedNode.value.classNames?.[key] ?? [];
            const targetClassMap =
              normalizeNodeClassNames(value) ?? createEmptyClassNames();
            const targetClasses = targetClassMap[key] ?? [];

            const wasAdded = targetClasses.includes(actualClassName);
            const isCurrentlyAdded = currentClasses.includes(actualClassName);

            if (wasAdded && !isCurrentlyAdded) {
              // Need to add it back (redo)
              const restoreResult = unwrapNodeUtilityClassActionResult(
                await actions.nodes.addUtilityClass({
                  collection,
                  id,
                  nodeId,
                  className: actualClassName,
                  key,
                }),
                "Failed to add utility class",
                {
                  source: "useClassEditor.addUtilityClass.restoreProperty",
                  collection,
                  id,
                  nodeId,
                  className: actualClassName,
                  key,
                },
              );

              if (!restoreResult.success) {
                throw new Error(restoreResult.error);
              }
            } else if (!wasAdded && isCurrentlyAdded) {
              // Need to remove it (undo)
              const restoreResult = unwrapNodeUtilityClassActionResult(
                await actions.nodes.removeUtilityClass({
                  collection,
                  id,
                  nodeId,
                  className: actualClassName,
                  key,
                }),
                "Failed to remove utility class",
                {
                  source: "useClassEditor.addUtilityClass.restoreProperty",
                  collection,
                  id,
                  nodeId,
                  className: actualClassName,
                  key,
                },
              );

              if (!restoreResult.success) {
                throw new Error(restoreResult.error);
              }
            }

            const updatedNode = updateSelectedNodeClassNames(
              nodeId,
              cloneDeep(targetClassMap),
            );
            broadcastClassUpdate({
              nodeId,
              classNames: updatedNode?.classNames ?? { base: [] },
            });
          }
        },
      });

      return true;
    } catch (e) {
      if (!error.value) {
        error.value =
          e instanceof Error ? e.message : "Failed to add utility class";
      }
      return false;
    }
  }

  /**
   * Remove a utility class from a node at a specific breakpoint and/or pseudo-selector.
   * Uses current breakpoint if not specified.
   */
  async function removeUtilityClass(
    collection: "pages" | "layouts" | "components",
    id: string,
    nodeId: string,
    className: string,
    breakpoint?: Breakpoint,
    pseudo?: PseudoSelector,
  ): Promise<boolean> {
    const bp = breakpoint ?? currentBreakpoint.value;
    let key = buildClassNameKey(pseudo, bp);

    // Smart key resolution: find where the class actually exists
    if (selectedNode.value && selectedNode.value.id === nodeId) {
      const classNames = selectedNode.value.classNames ?? {};

      if (!classNames[key]?.includes(className)) {
        if (classNames.base?.includes(className)) {
          key = "base";
        } else {
          for (const [searchKey, classes] of Object.entries(classNames)) {
            if (Array.isArray(classes) && classes.includes(className)) {
              key = searchKey;
              break;
            }
          }
        }
      }
    }

    try {
      const validatedInput = UtilityClassInputSchema.safeParse({
        collection,
        id,
        nodeId,
        className,
        key,
      });

      if (!validatedInput.success) {
        error.value =
          validatedInput.error.issues[0]?.message ?? "Invalid input";
        return false;
      }

      await recordStateSnapshotAdvanced({
        type: "remove-utility-class",
        description: `Remove class: ${className}`,
        affectedNodeIds: [nodeId],
        captureState: () => ({
          focusedNodeClasses: selectedNode.value?.classNames
            ? JSON.parse(JSON.stringify(selectedNode.value.classNames))
            : { base: [] },
        }),
        action: async () => {
          const result = unwrapNodeUtilityClassActionResult(
            await actions.nodes.removeUtilityClass(validatedInput.data),
            "Failed to remove utility class",
            {
              source: "useClassEditor.removeUtilityClass",
              collection,
              id,
              nodeId,
              className,
              key,
            },
          );

          if (!result.success) {
            error.value = result.error;
            throw new Error(error.value);
          }

          // Update the selected node locally to trigger reactivity
          if (selectedNode.value && selectedNode.value.id === nodeId) {
            const currentClassNames =
              selectedNode.value.classNames ?? createEmptyClassNames();
            const keyClasses = currentClassNames[key] ?? [];
            const filteredClasses = keyClasses.filter((c) => c !== className);

            const updatedNode = updateSelectedNodeClassNames(nodeId, {
              ...currentClassNames,
              [key]: filteredClasses,
            });

            if (updatedNode) {
              broadcastClassUpdate({
                nodeId,
                classNames: updatedNode.classNames ?? createEmptyClassNames(),
              });
            }
          }

          broadcastNodeClassRemoved({
            collection,
            id,
            nodeId,
            className,
            breakpoint: bp,
          });

          return result.version;
        },
        restoreProperty: async (_state, property, value) => {
          if (
            property === "focusedNodeClasses" &&
            selectedNode.value &&
            selectedNode.value.id === nodeId
          ) {
            // Determine if we're adding or removing the class based on the state
            const currentClasses = selectedNode.value.classNames?.[key] ?? [];
            const targetClassMap =
              normalizeNodeClassNames(value) ?? createEmptyClassNames();
            const targetClasses = targetClassMap[key] ?? [];

            // Find what classes should be present
            const shouldHaveClass = targetClasses.includes(className);
            const currentlyHasClass = currentClasses.includes(className);

            if (shouldHaveClass && !currentlyHasClass) {
              // Need to add it back (undo)
              const restoreResult = unwrapNodeUtilityClassActionResult(
                await actions.nodes.addUtilityClass({
                  collection,
                  id,
                  nodeId,
                  className,
                  key,
                }),
                "Failed to add utility class",
                {
                  source: "useClassEditor.removeUtilityClass.restoreProperty",
                  collection,
                  id,
                  nodeId,
                  className,
                  key,
                },
              );

              if (!restoreResult.success) {
                throw new Error(restoreResult.error);
              }
            } else if (!shouldHaveClass && currentlyHasClass) {
              // Need to remove it (redo)
              const restoreResult = unwrapNodeUtilityClassActionResult(
                await actions.nodes.removeUtilityClass({
                  collection,
                  id,
                  nodeId,
                  className,
                  key,
                }),
                "Failed to remove utility class",
                {
                  source: "useClassEditor.removeUtilityClass.restoreProperty",
                  collection,
                  id,
                  nodeId,
                  className,
                  key,
                },
              );

              if (!restoreResult.success) {
                throw new Error(restoreResult.error);
              }
            }

            const updatedNode = updateSelectedNodeClassNames(
              nodeId,
              cloneDeep(targetClassMap),
            );
            broadcastClassUpdate({
              nodeId,
              classNames: updatedNode?.classNames ?? { base: [] },
            });
          }
        },
      });

      return true;
    } catch (e) {
      if (!error.value) {
        error.value =
          e instanceof Error ? e.message : "Failed to remove utility class";
      }
      return false;
    }
  }

  /**
   * Add a custom class reference to a node.
   */
  async function addCustomClassToNode(
    collection: "pages" | "layouts" | "components",
    id: string,
    nodeId: string,
    className: string,
  ): Promise<boolean> {
    try {
      const result = await recordNodeCustomClassChange(
        "add-custom-class",
        {
          collection,
          id,
          nodeId,
          className,
        },
        {
          onRedo: (payload) => {
            setNodeCustomClassState(payload.nodeId, payload.className, true);
            broadcastNodeCustomClassAdded(payload);
          },
          onUndo: (payload) => {
            setNodeCustomClassState(payload.nodeId, payload.className, false);
            broadcastNodeCustomClassRemoved(payload);
          },
        },
      );

      if (!result.success) {
        error.value = result.error ?? "Failed to add custom class";
        return false;
      }

      return true;
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Failed to add custom class";
      return false;
    }
  }

  /**
   * Remove a custom class reference from a node.
   */
  async function removeCustomClassFromNode(
    collection: "pages" | "layouts" | "components",
    id: string,
    nodeId: string,
    className: string,
  ): Promise<boolean> {
    try {
      const result = await recordNodeCustomClassChange(
        "remove-custom-class",
        {
          collection,
          id,
          nodeId,
          className,
        },
        {
          onRedo: (payload) => {
            setNodeCustomClassState(payload.nodeId, payload.className, false);
            broadcastNodeCustomClassRemoved(payload);
          },
          onUndo: (payload) => {
            setNodeCustomClassState(payload.nodeId, payload.className, true);
            broadcastNodeCustomClassAdded(payload);
          },
        },
      );

      if (!result.success) {
        error.value = result.error ?? "Failed to remove custom class";
        return false;
      }

      return true;
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Failed to remove custom class";
      return false;
    }
  }

  function isCustomClass(name: string): boolean {
    return name in customClasses.value;
  }

  async function refreshCSS(): Promise<void> {
    try {
      const result = unwrapClassEditorActionResult(
        await actions.styles.getGeneratedCSS({}),
        ClassEditorGeneratedCssActionSuccessSchema,
        "Failed to refresh CSS",
        {
          source: "useClassEditor.refreshCSS",
        },
      );

      if (!result.success) {
        return;
      }

      generatedCSS.value = result.data.data.css;
      emitCSSUpdate();
    } catch (e) {
      log("error", "[useClassEditor] Failed to refresh CSS", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // WATCH: Emit on breakpoint change

  watch(currentBreakpoint, () => {
    if (activeClassName.value) {
      emitActiveChanged();
    }
  });

  watch(selectedNodeId, (nodeId, previousNodeId) => {
    if (previousNodeId && nodeId !== previousNodeId && activeClassName.value) {
      clearActiveClass();
    }
  });

  return {
    isLoading: readonly(isLoading),
    error: readonly(error),
    authoringMode: readonly(authoringMode),
    editingMode,
    customClasses,
    activeClassName: readonly(activeClassName),
    activeClass,
    activeRules,
    currentBreakpoint,
    generatedCSS: readonly(generatedCSS),

    loadClasses,
    createClass,
    deleteClass,
    deleteClasses,
    renameClass,
    duplicateClass,
    copyClassStyles,
    replaceClassStyles,
    replaceClassVariantRules,

    setActiveClass,
    clearActiveClass,

    getClassRule,
    setClassRule,
    setClassRules,
    previewClassRules,
    previewClassPseudoRules,
    removeClassRule,
    removeClassRules,

    getClassPseudoRule,
    setClassPseudoRule,
    setClassPseudoRules,
    removeClassPseudoRule,
    removeClassPseudoRules,

    addUtilityClass,
    removeUtilityClass,
    addCustomClassToNode,
    removeCustomClassFromNode,

    setAuthoringMode,

    isCustomClass,
    refreshCSS,
  };
}
