/**
 * Dialog + actions to convert a canvas selection into a reusable component.
 */
import { ref, type Ref } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";

export interface ComponentConversionConfirmPayload {
  name: string;
  groupId: string | null;
}

export interface UseComponentConversionOptions {
  /** Function to convert node to component */
  convertNodeToComponent: (
    node: BuilderNode,
    options: { name: string; category?: string },
  ) => Promise<{ success: boolean; slug?: string; error?: string }>;
  /** Resolve the latest node from current stage state */
  resolveNode: (nodeId: string) => BuilderNode | null;
  /** Function to fetch/refresh builder data */
  fetchBuilderData: (options?: {
    force?: boolean;
    silent?: boolean;
  }) => Promise<void>;
  /** Callback when component is successfully created */
  onComponentCreated: () => void;
  /** Function to hide selection box */
  hideSelection: () => void;
  /** Replace the source node with a component instance */
  replaceNodeWithComponentInstance: (
    nodeId: string,
    componentSlug: string,
  ) => Promise<void> | void;
  /** Resolve a persisted component category from a selected group id */
  resolveGroupName?: (groupId: string | null) => string | undefined;
}

export interface UseComponentConversionReturn {
  /** Dialog open state */
  isDialogOpen: Ref<boolean>;
  /** Node id pending conversion */
  pendingNodeId: Ref<string | null>;
  /** Suggested component name */
  suggestedName: Ref<string>;
  /** Open dialog with node and suggested name */
  openDialog: (node: BuilderNode, name: string) => void;
  /** Handle conversion confirmation */
  handleConfirm: (payload: ComponentConversionConfirmPayload) => Promise<void>;
  /** Close dialog and reset state */
  closeDialog: () => void;
}

/**
 * Component conversion dialog and actions.
 *
 * @param options - Conversion options
 * @returns Component conversion utilities
 *
 * @example
 * ```ts
 * const { convertNodeToComponent } = useBlockData();
 * const { fetchBuilderData } = useBuilderData();
 *
 * const conversion = useComponentConversion({
 *   convertNodeToComponent,
 *   fetchBuilderData,
 *   onComponentCreated: () => emit('componentCreated'),
 *   hideSelection: () => canvasOverlays.hideSelection(),
 * });
 *
 * // Open dialog
 * conversion.openDialog(node, 'Header Component');
 *
 * // Handle confirmation
 * await conversion.handleConfirm('My Header');
 * ```
 */
export function useComponentConversion(
  options: UseComponentConversionOptions,
): UseComponentConversionReturn {
  const {
    convertNodeToComponent,
    resolveNode,
    fetchBuilderData,
    onComponentCreated,
    hideSelection,
    replaceNodeWithComponentInstance,
    resolveGroupName,
  } = options;

  /** Dialog open state */
  const isDialogOpen = ref(false);

  /** Node id pending conversion */
  const pendingNodeId = ref<string | null>(null);

  /** Suggested component name */
  const suggestedName = ref("");

  /**
   * Opens conversion dialog with node and suggested name.
   *
   * @param node - Node to convert
   * @param name - Suggested component name
   */
  const openDialog = (node: BuilderNode, name: string): void => {
    pendingNodeId.value = node.id;
    suggestedName.value = name;
    isDialogOpen.value = true;
  };

  /**
   * Handles component conversion after dialog confirmation.
   * Creates component from selected block and refreshes builder data.
   *
   * @param payload - The name and selected group for the new component
   */
  const handleConfirm = async (
    payload: ComponentConversionConfirmPayload,
  ): Promise<void> => {
    if (!pendingNodeId.value) return;

    const pendingNode = resolveNode(pendingNodeId.value);
    if (!pendingNode) {
      closeDialog();
      return;
    }

    const result = await convertNodeToComponent(pendingNode, {
      name: payload.name,
      category: resolveGroupName?.(payload.groupId),
    });

    if (result.success === false) {
      console.error(
        "[useComponentConversion] Create component failed:",
        result.error,
      );
    } else {
      console.log("[useComponentConversion] Component created:", result.slug);
      hideSelection();

      if (result.slug) {
        await replaceNodeWithComponentInstance(pendingNode.id, result.slug);
      }

      // Refresh builder data to show new component in sidebar
      await fetchBuilderData({ force: true });

      // Notify parent that component was created
      onComponentCreated();
    }

    closeDialog();
  };

  /**
   * Closes dialog and resets state.
   */
  const closeDialog = (): void => {
    pendingNodeId.value = null;
    suggestedName.value = "";
    isDialogOpen.value = false;
  };

  return {
    isDialogOpen,
    pendingNodeId,
    suggestedName,
    openDialog,
    handleConfirm,
    closeDialog,
  };
}
