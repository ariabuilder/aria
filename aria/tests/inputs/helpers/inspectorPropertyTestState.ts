import { computed, defineComponent, h, ref, type Ref } from "vue";
import { vi } from "vitest";
import type { BuilderNode } from "../../../lib/types/nodes";

export function createColorFieldTestStub(options?: {
  pickerTestId?: string;
  commitValue?: string;
}) {
  const pickerTestId = options?.pickerTestId ?? "color-picker";
  const commitValue = options?.commitValue ?? "#00FF00";

  return defineComponent({
    name: "ColorField",
    props: {
      modelValue: { type: String, default: "" },
    },
    emits: ["update:modelValue", "update:model-value", "preview", "commit"],
    setup(props, { attrs, emit }) {
      return () =>
        h("div", [
          h("input", {
            ...attrs,
            value: props.modelValue,
            onInput: (event: Event) =>
              emit(
                "update:modelValue",
                (event.target as HTMLInputElement).value,
              ),
          }),
          h(
            "button",
            {
              type: "button",
              "data-testid": pickerTestId,
              onClick: () => {
                emit("preview", commitValue);
                emit("update:modelValue", commitValue);
                emit("commit", commitValue);
              },
            },
            "pick",
          ),
        ]);
    },
  });
}

export function mockColorPickerModule(
  stub = createColorFieldTestStub(),
): Record<string, unknown> {
  return {
    ColorPicker: stub,
    ColorField: stub,
  };
}

export const inspectorPropertyState = {
  selectedNodeRef: ref(null) as Ref<BuilderNode | null>,
  selectedNodeIdRef: ref(null) as Ref<string | null>,
  breakpointNameRef: ref("base"),
  isLoadingRef: ref(false),
  errorRef: ref<string | null>(null),
};

export function getInspectorComputedStyleValue(
  propertyName: string,
  fallback?: string,
  breakpoint: string = inspectorPropertyState.breakpointNameRef.value,
  targetNodeId?: string,
): string | undefined {
  const selectedNode = inspectorPropertyState.selectedNodeRef.value;
  const node =
    targetNodeId && selectedNode?.id !== targetNodeId ? null : selectedNode;
  const value = node?.styles?.[propertyName];

  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const responsiveValue = value as Record<string, string | undefined>;
  return responsiveValue[breakpoint] ?? responsiveValue.base ?? fallback;
}

export function createInspectorPropertySaveMock(options?: {
  saveProperties?: (...args: never[]) => unknown;
  previewStyleProperties?: (...args: never[]) => unknown;
  saveProperty?: (...args: never[]) => unknown;
}) {
  return () => ({
    selectedNode: inspectorPropertyState.selectedNodeRef,
    selectedNodeId: inspectorPropertyState.selectedNodeIdRef,
    selectedNodes: computed(() =>
      inspectorPropertyState.selectedNodeRef.value
        ? [inspectorPropertyState.selectedNodeRef.value]
        : [],
    ),
    breakpointName: inspectorPropertyState.breakpointNameRef,
    isLoading: inspectorPropertyState.isLoadingRef,
    error: inspectorPropertyState.errorRef,
    saveProperties: options?.saveProperties ?? (() => undefined),
    previewStyleProperties: options?.previewStyleProperties,
    saveProperty: options?.saveProperty,
    getComputedStyleValue: getInspectorComputedStyleValue,
  });
}

/**
 * Mock for `useSelectedNodeState` — the core composable
 * that `useInspector`, `usePropsEditor`, `useNodeMutations`, and `useClassEditor` all.
 */
export function createInspectorSelectedNodeStateMock(overrides?: {
  selectedNode?: Ref<BuilderNode | null>;
  selectedNodeId?: Ref<string | null>;
}) {
  const selectedNode: Ref<BuilderNode | null> =
    overrides?.selectedNode ?? inspectorPropertyState.selectedNodeRef;
  const selectedNodeId: Ref<string | null> =
    overrides?.selectedNodeId ?? inspectorPropertyState.selectedNodeIdRef;
  const selectedNodes = computed(() =>
    selectedNode.value ? [selectedNode.value] : [],
  );
  const selectedNodeIds = computed(() =>
    selectedNodeId.value ? [selectedNodeId.value] : [],
  );
  const noopReturn = vi.fn(() => null);

  return () => ({
    selectedNode,
    selectedNodeId,
    primarySelectedNode: selectedNode,
    primarySelectedNodeId: selectedNodeId,
    selectedNodes,
    selectedNodeIds,
    selectionAnchorNodeId: ref<string | null>(null),
    selectionCount: computed(() => selectedNodes.value.length),
    isMultiSelect: computed(() => selectedNodes.value.length > 1),
    updateSelectedNodeClassNames: noopReturn,
    updateSelectedNodeCustomClasses: noopReturn,
    updateSelectedNodeProps: noopReturn,
    updateSelectedNodeStyles: noopReturn,
    updateSelectedNodeA11y: noopReturn,
    updateSelectedNodeMotion: noopReturn,
    updateSelectedNodeDataSource: noopReturn,
  });
}

/**
 * Noop `useCanvasSignalBridge` implementation for tests that mount components pulling
 * in `useClassEditor` (which imports the real bridge from.
 */
export function createInspectorCanvasSignalBridgeMock() {
  return () => ({
    signalA11yUpdate: vi.fn(),
    signalMotionUpdate: vi.fn(),
    signalPropsUpdate: vi.fn(),
    broadcastPropsUpdate: vi.fn(),
    signalStyleUpdate: vi.fn(),
    broadcastClassUpdate: vi.fn(),
    signalSpacingPreviewStart: vi.fn(),
    signalSpacingPreviewEnd: vi.fn(),
    broadcastComponentWrapperResponse: vi.fn(),
    onPropsUpdate: vi.fn(() => () => undefined),
    onA11yUpdate: vi.fn(() => () => undefined),
    onMotionUpdate: vi.fn(() => () => undefined),
    onStyleUpdate: vi.fn(() => () => undefined),
    onClassUpdate: vi.fn(() => () => undefined),
    onSpacingPreviewStart: vi.fn(() => () => undefined),
    onSpacingPreviewEnd: vi.fn(() => () => undefined),
    onComponentWrapperResponse: vi.fn(() => () => undefined),
  });
}

/**
 * `useSelectionTreeState` mock backed by a caller-supplied ref (or a fresh empty
 * array when omitted). Also exposes the setter that `usePropsEditor` destructures.
 */
export function createInspectorSelectionTreeStateMock(
  selectionTreeRootNodes?: Ref<BuilderNode[]>,
) {
  const nodes = selectionTreeRootNodes ?? (ref([]) as Ref<BuilderNode[]>);
  return () => ({
    selectionTreeRootNodes: nodes,
    setSelectionTreeRootNodes: (next: BuilderNode[]) => {
      nodes.value = next;
    },
  });
}

export function createInspectorGlobalStyleDefaultsMock() {
  return () => ({
    globalStyleDefaults: ref({}),
    isGlobalDefaultsActive: computed(() => false),
    buildResolverInput: () => undefined,
    compareGlobalDefaultAcrossSelection: () => ({
      value: undefined,
      isMixed: false,
    }),
    coalesceSaveStyleValue: (_propertyName: string, value: string) => value,
  });
}

export const designComposableMocks = {
  useGlobalStyles: () => ({
    globalStyles: ref({
      variables: { custom: {}, aliases: {} },
    }),
    isLoading: ref(false),
    loadGlobalStyles: async () => undefined,
  }),
  useTypography: () => ({
    typography: ref({}),
    isLoading: ref(false),
    loadTypography: async () => undefined,
  }),
  useDesignSystem: () => ({
    palettes: ref([]),
    semanticColors: ref({}),
    isLoading: ref(false),
    load: async () => undefined,
  }),
};
