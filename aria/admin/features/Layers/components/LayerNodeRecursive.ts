/**
 * This component recursively renders a builder node and its children as a tree structure.
 */

import {
  h,
  defineComponent,
  onBeforeUnmount,
  ref,
  watch,
  type PropType,
  type VNode,
} from "vue";
import draggable from "vuedraggable";
import LayerItem from "./LayerItem.vue";
import type { NodeEventHandlers } from "../composables/useLayerNodeActions";
import { createChildrenDragConfig } from "../utils/dragConfig";
import { didDragLeaveElement } from "../utils/dropTargeting";

import type { BuilderNode } from "../../../../lib/types/nodes";
import type {
  CollapseState,
  DropIndicatorClass,
  DropPosition,
  LayerDragEvent,
  LayerListChangeEvent,
  LayerSelectRequest,
} from "../types";

/**
 * Vue Draggable configuration for layer tree drag-and-drop.
 * Enables reordering nodes within the same parent or moving between parents.
 */
const DRAG_CONFIG = createChildrenDragConfig();

const CHILD_LIST_TAIL_ZONE_HEIGHT_PX = 18;
const INITIAL_CHILD_RENDER_BUDGET = 80;
const CHILD_RENDER_BATCH_SIZE = 120;

const requestRenderFrame = (callback: () => void): number => {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }

  return globalThis.setTimeout(callback, 16) as unknown as number;
};

const cancelRenderFrame = (frameId: number): void => {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(frameId);
    return;
  }

  clearTimeout(frameId);
};

/**
 * Recursive tree node component with drag-and-drop support.
 *
 * Renders a single node with LayerItem and recursively renders its children
 * using vuedraggable for reordering. Supports infinite nesting depth.
 *
 * COMPONENT INSTANCES:
 * - Component instances (type === "Component") are rendered as opaque blocks
 * - Their children/slots are NOT expanded in the layer tree
 * - Component editing happens in the Components section
 *
 * @example
 * ```ts
 * h(LayerNodeRecursive, {
 *   node: { id: '1', type: 'Container', children: [...] },
 *   depth: 0,
 *   selectedNodeId: '1',
 *   isExpanded: (id) => expandedIds.includes(id),
 *   hasChildren: (node) => node.children?.length > 0,
 *   onSelect: (node) => handleSelect(node),
 *   onUpdateChildren: (parent, children) => handleUpdate(parent, children)
 * })
 * ```
 */
export const LayerNodeRecursive = defineComponent({
  name: "LayerNodeRecursive",

  props: {
    node: {
      type: Object as PropType<BuilderNode>,
      required: true,
    },

    /** Nesting depth for indentation calculation (0 = root level) */
    depth: {
      type: Number,
      default: 0,
    },

    selectedNodeId: {
      type: String,
      default: undefined,
    },

    selectedNodeIds: {
      type: Array as PropType<string[] | undefined>,
      default: undefined,
    },

    selectedNodePath: {
      type: Array as PropType<readonly string[] | undefined>,
      default: undefined,
    },

    hoveredNodeId: {
      type: String,
      default: undefined,
    },

    editingNodeId: {
      type: String as PropType<string | null>,
      default: null,
    },

    /** Predicate function to check if a node is expanded */
    isExpanded: {
      type: Function as PropType<(nodeId: string) => boolean>,
      required: true,
    },

    /** Predicate function to check if a node has children */
    hasChildren: {
      type: Function as PropType<(node: BuilderNode) => boolean>,
      required: true,
    },

    /** Predicate for container types that accept nested drops when empty */
    canAcceptChildren: {
      type: Function as PropType<(node: BuilderNode) => boolean>,
      required: true,
    },

    getCollapseState: {
      type: Function as PropType<(nodeId: string) => CollapseState>,
      required: true,
    },

    /** Explicit node action handlers for context menu operations */
    nodeActions: {
      type: Object as PropType<NodeEventHandlers>,
      required: true,
    },

    getDropIndicatorClass: {
      type: Function as PropType<(nodeId: string) => DropIndicatorClass>,
      required: true,
    },

    activeDragListId: {
      type: String as PropType<string | null>,
      default: null,
    },

    isDragging: {
      type: Boolean,
      default: false,
    },

    renderCacheKey: {
      type: [String, Number] as PropType<string | number>,
      default: 0,
    },

    visibleNodeIds: {
      type: Object as PropType<ReadonlySet<string> | null>,
      default: null,
    },
  },

  emits: {
    select: (_request: LayerSelectRequest): boolean => true,
    hover: (_node: BuilderNode): boolean => true,
    leave: (): boolean => true,
    "drag-start": (_event: LayerDragEvent): boolean => true,
    "drag-end": (): boolean => true,
    "toggle-expand": (_nodeId: string, _event: Event): boolean => true,
    "update-children": (
      _parentNode: BuilderNode,
      _changeEvent: LayerListChangeEvent,
    ): boolean => true,
    rename: (_node: BuilderNode, _newLabel: string): boolean => true,
    "edit-start": (_nodeId: string): boolean => true,
    "edit-cancel": (): boolean => true,
    "children-drop-target-change": (_payload: {
      parentNodeId: string;
      position: DropPosition;
    }): boolean => true,
    "children-drop-target-leave": (): boolean => true,
    "drop-target-change": (_payload: {
      targetNode: BuilderNode;
      position: DropPosition;
    }): boolean => true,
    "drop-target-leave": (): boolean => true,
    "drop-node": (_payload: {
      targetNode: BuilderNode;
      position: DropPosition;
    }): boolean => true,
    "edit-component": (_masterId: string): boolean => true,
  },

  setup(props, { emit }) {
    const mountedChildBranchIds = new Set<string>();
    const renderedChildLimit = ref(INITIAL_CHILD_RENDER_BUDGET);
    let renderBudgetFrameId: number | null = null;

    const cancelRenderBudgetFrame = (): void => {
      if (renderBudgetFrameId !== null) {
        cancelRenderFrame(renderBudgetFrameId);
        renderBudgetFrameId = null;
      }
    };

    const scheduleRenderBudget = (childCount: number): void => {
      cancelRenderBudgetFrame();

      if (!props.isExpanded(props.node.id) || childCount === 0) {
        return;
      }

      if (renderedChildLimit.value >= childCount) {
        return;
      }

      if (childCount <= INITIAL_CHILD_RENDER_BUDGET || props.isDragging) {
        renderedChildLimit.value = childCount;
        return;
      }

      renderedChildLimit.value = Math.max(
        renderedChildLimit.value,
        INITIAL_CHILD_RENDER_BUDGET,
      );

      const applyNextBatch = (): void => {
        renderBudgetFrameId = null;

        if (!props.isExpanded(props.node.id)) {
          return;
        }

        renderedChildLimit.value = Math.min(
          renderedChildLimit.value + CHILD_RENDER_BATCH_SIZE,
          childCount,
        );

        if (renderedChildLimit.value < childCount) {
          renderBudgetFrameId = requestRenderFrame(applyNextBatch);
        }
      };

      renderBudgetFrameId = requestRenderFrame(applyNextBatch);
    };

    const getChildSignature = (): string =>
      (props.node.children ?? []).map((child) => child.id).join("|");

    const resetRenderBudget = (): void => {
      cancelRenderBudgetFrame();
      const childCount = props.node.children?.length ?? 0;
      renderedChildLimit.value =
        childCount <= INITIAL_CHILD_RENDER_BUDGET || props.isDragging
          ? childCount
          : INITIAL_CHILD_RENDER_BUDGET;

      if (props.isExpanded(props.node.id)) {
        scheduleRenderBudget(childCount);
      }
    };

    watch(
      () => [props.renderCacheKey, getChildSignature()],
      (_next, previous) => {
        if (!previous) {
          return;
        }

        resetRenderBudget();
      },
    );

    watch(
      () => [
        props.isExpanded(props.node.id),
        props.node.children?.length ?? 0,
        props.isDragging,
      ],
      ([expanded, childCount]) => {
        if (!expanded) {
          cancelRenderBudgetFrame();
          return;
        }

        if (props.isDragging) {
          renderedChildLimit.value = Number(childCount);
          return;
        }

        scheduleRenderBudget(Number(childCount));
      },
      { immediate: true },
    );

    onBeforeUnmount(cancelRenderBudgetFrame);

    /**
     * Renders a single node and its children recursively.
     *
     * @param node - The builder node to render
     * @param depth - Current nesting depth
     * @returns VNode tree for the node and its descendants
     */
    const renderNode = (node: BuilderNode, depth: number): VNode => {
      const collapseState = props.getCollapseState(node.id);
      const isSoftCollapsed = collapseState === "soft-collapsed";
      const isFullyCollapsed = collapseState === "full-collapsed";

      // For soft/full collapsed nodes, don't show children
      // Also, if it's a component instance, NEVER show children in the layer tree
      // unless we are explicitly editing it (which is handled by a different view/mode usually)
      // The requirement is: "it should only detach when invoked"
      const isComponentInstance =
        node.type === "Component" || !!node.componentRef;
      const canHostChildren =
        !isComponentInstance && (node.children?.length ?? 0) > 0;

      const children: BuilderNode[] = canHostChildren
        ? node.children || []
        : [];
      const renderedChildren =
        props.isDragging
          ? children
          : children.length > renderedChildLimit.value
          ? children.slice(0, renderedChildLimit.value)
          : children;

      const isNodeExpanded =
        !isSoftCollapsed && !isFullyCollapsed && props.isExpanded(node.id);
      if (isNodeExpanded) {
        mountedChildBranchIds.add(node.id);
      }

      const shouldRenderChildren =
        !isFullyCollapsed &&
        canHostChildren &&
        (isNodeExpanded || mountedChildBranchIds.has(node.id));
      const isSelected =
        props.selectedNodeIds?.includes(node.id) ??
        props.selectedNodeId === node.id;
      const isSelectedBranch =
        props.selectedNodePath?.includes(node.id) ?? false;
      const highlightSelectedBranch =
        isSelectedBranch &&
        isNodeExpanded &&
        !isComponentInstance &&
        children.length > 0;
      const childListDropTargetId = `children:${node.id}`;
      const childListDropIndicatorClass = props.getDropIndicatorClass(
        childListDropTargetId,
      );
      const showEmptyChildListInsideIndicator =
        children.length === 0 &&
        childListDropIndicatorClass === "drop-inside" &&
        !isSoftCollapsed;
      const isDraggingAnyLayer = props.isDragging;
      const isVisible =
        props.visibleNodeIds === null || props.visibleNodeIds.has(node.id);

      // When fully collapsed, render node as hidden but still in DOM for toggle
      return h(
        "div",
        {
          key: node.id,
          style:
            isFullyCollapsed || !isVisible ? { display: "none" } : undefined,
        },
        [
          // Node item (label, icon, expand toggle)
          h(LayerItem, {
            node,
            depth,
            selected: isSelected,
            hovered: props.hoveredNodeId === node.id,
            expanded: isNodeExpanded,
            hasChildren: props.hasChildren(node),
            canAcceptChildren: props.canAcceptChildren(node),
            editingNodeId: props.editingNodeId,
            nodeActions: props.nodeActions,
            dropIndicatorClass: props.getDropIndicatorClass(node.id),
            onSelect: (event: MouseEvent) =>
              emit("select", {
                node,
                triggerGesture: {
                  metaKey: event.metaKey,
                  ctrlKey: event.ctrlKey,
                  shiftKey: event.shiftKey,
                },
              }),
            onHover: () => emit("hover", node),
            onLeave: () => emit("leave"),
            onToggleExpand: (event: Event) =>
              emit("toggle-expand", node.id, event),
            onRename: (newLabel: string) => emit("rename", node, newLabel),
            onEditStart: (nodeId: string) => emit("edit-start", nodeId),
            onEditCancel: () => emit("edit-cancel"),
            onDropTargetChange: (payload: {
              targetNode: BuilderNode;
              position: DropPosition;
            }) => emit("drop-target-change", payload),
            onDropTargetLeave: () => emit("drop-target-leave"),
            onDropNode: (payload: {
              targetNode: BuilderNode;
              position: DropPosition;
            }) => emit("drop-node", payload),
            onEditComponent: (masterId: string) =>
              emit("edit-component", masterId),
          }),

          // Draggable children container (only if expanded and has children, and not collapsed)
          shouldRenderChildren
            ? h(
                "div",
                {
                  class: "relative",
                  style: isNodeExpanded ? undefined : { display: "none" },
                },
                [
                  h(
                    draggable,
                    {
                      ...DRAG_CONFIG,
                      modelValue: renderedChildren,
                      class: [
                        children.length === 0
                          ? isDraggingAnyLayer
                            ? "layer-children ml-3 min-h-7 border-l border-border/70 pb-3 pl-2"
                            : "layer-children ml-3 min-h-7 border-l border-border/70 pl-2"
                          : isDraggingAnyLayer
                            ? "layer-children ml-3 border-l border-border/70 pb-3 pl-2"
                            : "layer-children ml-3 border-l border-border/70 pl-2",
                        highlightSelectedBranch
                          ? "border-primary/35 bg-card/30"
                          : "",
                      ],
                      "data-layer-children-list": node.id,
                      onStart: (event: LayerDragEvent) => {
                        emit("drag-start", event);
                      },
                      onEnd: () => {
                        emit("drag-end");
                      },
                      onDragover: (event: DragEvent) => {
                        event.stopPropagation();
                        if (children.length === 0) {
                          event.preventDefault();
                          if (event.dataTransfer) {
                            event.dataTransfer.dropEffect = "move";
                          }

                          emit("children-drop-target-change", {
                            parentNodeId: node.id,
                            position: "inside",
                          });
                          return;
                        }

                        const target = event.target as HTMLElement | null;
                        if (target?.closest("[data-layer-item]")) {
                          return;
                        }

                        const currentTarget = event.currentTarget;
                        if (!(currentTarget instanceof HTMLElement)) {
                          return;
                        }

                        const rect = currentTarget.getBoundingClientRect();
                        if (
                          event.clientY <
                          rect.bottom - CHILD_LIST_TAIL_ZONE_HEIGHT_PX
                        ) {
                          return;
                        }

                        event.preventDefault();
                        if (event.dataTransfer) {
                          event.dataTransfer.dropEffect = "move";
                        }

                        emit("children-drop-target-change", {
                          parentNodeId: node.id,
                          position: "after",
                        });
                      },
                      onDragleave: (event: DragEvent) => {
                        event.stopPropagation();
                        const list = event.currentTarget;
                        if (
                          list instanceof HTMLElement &&
                          !didDragLeaveElement(event, list)
                        ) {
                          return;
                        }
                        emit("children-drop-target-leave");
                      },
                      onDrop: (event: DragEvent) => {
                        event.stopPropagation();
                        emit("children-drop-target-leave");
                      },
                      onChange: (event: LayerListChangeEvent) => {
                        emit("update-children", node, event);
                      },
                    },
                    {
                      item: ({
                        element: childNode,
                      }: {
                        element: BuilderNode;
                      }) =>
                        h(LayerNodeRecursive, {
                          node: childNode,
                          depth: depth + 1,
                          renderCacheKey: props.renderCacheKey,
                          selectedNodeId: props.selectedNodeId,
                          selectedNodeIds: props.selectedNodeIds,
                          selectedNodePath: props.selectedNodePath,
                          hoveredNodeId: props.hoveredNodeId,
                          editingNodeId: props.editingNodeId,
                          activeDragListId: props.activeDragListId,
                          isDragging: props.isDragging,
                          isExpanded: props.isExpanded,
                          hasChildren: props.hasChildren,
                          canAcceptChildren: props.canAcceptChildren,
                          getCollapseState: props.getCollapseState,
                          nodeActions: props.nodeActions,
                          getDropIndicatorClass: props.getDropIndicatorClass,
                          visibleNodeIds: props.visibleNodeIds,
                          // Bubble events up to parent
                          onSelect: (request: LayerSelectRequest) =>
                            emit("select", request),
                          onHover: (n: BuilderNode) => emit("hover", n),
                          onLeave: () => emit("leave"),
                          onDragStart: (event: LayerDragEvent) =>
                            emit("drag-start", event),
                          onDragEnd: () => emit("drag-end"),
                          onToggleExpand: (id: string, e: Event) =>
                            emit("toggle-expand", id, e),
                          onUpdateChildren: (
                            parentNode: BuilderNode,
                            changeEvent: LayerListChangeEvent,
                          ) => emit("update-children", parentNode, changeEvent),
                          onRename: (n: BuilderNode, newLabel: string) =>
                            emit("rename", n, newLabel),
                          onEditStart: (nodeId: string) =>
                            emit("edit-start", nodeId),
                          onEditCancel: () => emit("edit-cancel"),
                          onChildrenDropTargetChange: (payload: {
                            parentNodeId: string;
                            position: DropPosition;
                          }) => emit("children-drop-target-change", payload),
                          onChildrenDropTargetLeave: () =>
                            emit("children-drop-target-leave"),
                          onDropTargetChange: (payload: {
                            targetNode: BuilderNode;
                            position: DropPosition;
                          }) => emit("drop-target-change", payload),
                          onDropTargetLeave: () => emit("drop-target-leave"),
                          onDropNode: (payload: {
                            targetNode: BuilderNode;
                            position: DropPosition;
                          }) => emit("drop-node", payload),
                          onEditComponent: (masterId: string) =>
                            emit("edit-component", masterId),
                        }),
                    },
                  ),
                  showEmptyChildListInsideIndicator
                    ? h("div", {
                        "data-layer-children-inside-indicator": node.id,
                        class: "pointer-events-none absolute inset-0",
                        style: {
                          background:
                            "color-mix(in srgb, var(--primary) 10%, transparent)",
                          boxShadow:
                            "inset 0 0 0 1px color-mix(in srgb, var(--primary) 70%, transparent)",
                        },
                      })
                    : null,
                  childListDropIndicatorClass === "drop-after"
                    ? h("div", {
                        "data-layer-children-indicator": node.id,
                        class:
                          "pointer-events-none absolute inset-x-0 bottom-0 h-0.5",
                        style: {
                          background: "var(--primary)",
                          boxShadow:
                            "0 0 0 1px color-mix(in srgb, var(--primary) 30%, transparent)",
                        },
                      })
                    : null,
                ],
              )
            : null,
        ],
      );
    };

    // Render function returns VNode tree for this node and descendants
    return () => renderNode(props.node, props.depth);
  },
});

export default LayerNodeRecursive;
