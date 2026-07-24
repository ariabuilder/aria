import { computed, onMounted, type ComputedRef } from "vue";

import { useDesignSystem } from "@/features/Design/composables/useDesignSystem";
import { useGlobalStyles } from "@/features/Design/composables/useGlobalStyles";
import { useTypography } from "@/features/Design/composables/useTypography";
import { buildVariableManagerTokenOptions } from "@/features/Design/lib/variableManagerTokens";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { usePropertySave } from "../../Core";
import {
  compareInspectorGlobalDefaultsAcrossNodes,
  resolveInspectorGlobalStyleDefaults,
  type InspectorStyleDefaults,
  type ResolveInspectorGlobalStyleDefaultsInput,
} from "../lib/resolveInspectorGlobalStyleDefaults";
import { useClassEditor } from "./useClassEditor";
import { useInspectorState } from "./useInspectorState";

interface UseInspectorGlobalStyleDefaultsOptions {
  targetNode?: ComputedRef<BuilderNode | null>;
  targetNodeId?: ComputedRef<string | null>;
}

interface UseInspectorGlobalStyleDefaultsReturn {
  readonly globalStyleDefaults: ComputedRef<InspectorStyleDefaults>;
  readonly isGlobalDefaultsActive: ComputedRef<boolean>;
  readonly buildResolverInput: (node: BuilderNode) => ResolveInspectorGlobalStyleDefaultsInput;
  readonly compareGlobalDefaultAcrossSelection: (
    propertyName: string,
  ) => { value: string | undefined; isMixed: boolean };
  readonly coalesceSaveStyleValue: (
    propertyName: string,
    value: string,
  ) => string | undefined;
}

export function useInspectorGlobalStyleDefaults(
  options: UseInspectorGlobalStyleDefaultsOptions = {},
): UseInspectorGlobalStyleDefaultsReturn {
  const propertySave = usePropertySave();
  const classEditor = useClassEditor();
  const inspectorState = useInspectorState();
  const { globalStyles, loadGlobalStyles } = useGlobalStyles();
  const { typography, loadTypography } = useTypography();
  const { palettes, semanticColors, load: loadDesignSystem } = useDesignSystem();

  const isClassEditing = computed(
    () =>
      (!options.targetNodeId?.value ||
        options.targetNodeId.value === propertySave.selectedNodeId.value) &&
      classEditor.editingMode.value === "class" &&
      classEditor.activeClassName.value !== null,
  );

  const isGlobalDefaultsActive = computed(() => !isClassEditing.value);

  const tokenPreviewOptions = computed(() =>
    buildVariableManagerTokenOptions(
      palettes.value,
      semanticColors.value,
    ).map((entry) => ({
      value: entry.value,
      preview: entry.preview,
    })),
  );

  const selectionNodes = computed((): readonly BuilderNode[] => {
    if (options.targetNode?.value) {
      return [options.targetNode.value];
    }

    if (propertySave.selectedNodes.value.length > 0) {
      return propertySave.selectedNodes.value;
    }

    return propertySave.selectedNode.value
      ? [propertySave.selectedNode.value]
      : [];
  });

  const primaryNode = computed(() => selectionNodes.value[0] ?? null);

  function buildResolverInput(
    node: BuilderNode,
  ): ResolveInspectorGlobalStyleDefaultsInput {
    return {
      node,
      globalStyles: globalStyles.value,
      typography: typography.value,
      pseudo: inspectorState.selectedPseudo.value,
      tokenPreviewOptions: tokenPreviewOptions.value,
    };
  }

  const globalStyleDefaults = computed((): InspectorStyleDefaults => {
    if (!isGlobalDefaultsActive.value) {
      return {};
    }

    const node = primaryNode.value;
    if (!node) {
      return {};
    }

    // Track nested prop/pseudo changes for live default refresh.
    const _propsSnapshot = node.props;
    const _pseudo = inspectorState.selectedPseudo.value;
    void _propsSnapshot;
    void _pseudo;

    return resolveInspectorGlobalStyleDefaults(buildResolverInput(node));
  });

  function compareGlobalDefaultAcrossSelection(propertyName: string): {
    value: string | undefined;
    isMixed: boolean;
  } {
    if (!isGlobalDefaultsActive.value) {
      return { value: undefined, isMixed: false };
    }

    return compareInspectorGlobalDefaultsAcrossNodes(
      selectionNodes.value,
      buildResolverInput,
      propertyName,
    );
  }

  function coalesceSaveStyleValue(
    propertyName: string,
    value: string,
  ): string | undefined {
    const trimmed = value.trim();
    const comparison = compareGlobalDefaultAcrossSelection(propertyName);

    if (comparison.isMixed) {
      return value;
    }

    if (
      comparison.value !== undefined &&
      trimmed === comparison.value.trim()
    ) {
      return undefined;
    }

    return value;
  }

  onMounted(() => {
    void Promise.all([
      loadGlobalStyles(),
      loadTypography(),
      loadDesignSystem(),
    ]);
  });

  return {
    globalStyleDefaults,
    isGlobalDefaultsActive,
    buildResolverInput,
    compareGlobalDefaultAcrossSelection,
    coalesceSaveStyleValue,
  };
}
