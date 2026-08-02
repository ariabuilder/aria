import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuilderNode } from "../../lib/types/nodes";

const mockState = vi.hoisted(() => ({
  selectedNode: { value: null as unknown as BuilderNode },
  selectedNodeId: { value: null as string | null },
  selectedNodeIds: { value: ["node-1"] as string[] },
  selectionTreeRootNodes: { value: [] as BuilderNode[] },
  targetBreakpoint: { value: "base" as string | null },
  activeBreakpoints: {
    value: [{ name: "base", label: "Base", minWidth: 0 }],
  },
  updateSelectedNodePropsMock: vi.fn(),
  updateSelectedNodeStylesMock: vi.fn(),
  signalStyleUpdateMock: vi.fn(),
  signalPropsUpdateMock: vi.fn(),
  signalA11yUpdateMock: vi.fn(),
  signalSpacingPreviewStartMock: vi.fn(),
  signalSpacingPreviewEndMock: vi.fn(),
  executePropertySaveMutationMock: vi.fn(),
  executePropertySaveBatchMutationMock: vi.fn(),
}));

vi.mock("../../admin/features/Core/composables/useCanvasSignalBridge", () => ({
  useCanvasSignalBridge: () => ({
    signalA11yUpdate: mockState.signalA11yUpdateMock,
    signalPropsUpdate: mockState.signalPropsUpdateMock,
    signalStyleUpdate: mockState.signalStyleUpdateMock,
    signalSpacingPreviewStart: mockState.signalSpacingPreviewStartMock,
    signalSpacingPreviewEnd: mockState.signalSpacingPreviewEndMock,
  }),
}));

vi.mock("../../admin/composables/useResponsiveTarget", () => ({
  useResponsiveTarget: () => ({
    targetBreakpoint: mockState.targetBreakpoint,
  }),
}));

vi.mock("../../admin/composables/useCanonicalBreakpoints", () => ({
  useCanonicalBreakpoints: () => ({
    activeBreakpoints: mockState.activeBreakpoints,
  }),
}));

vi.mock("../../admin/features/Core/composables/useSelectedNodeState", () => ({
  useSelectedNodeState: () => ({
    selectedNode: mockState.selectedNode,
    selectedNodeId: mockState.selectedNodeId,
    selectedNodeIds: mockState.selectedNodeIds,
    updateSelectedNodeClassNames: vi.fn(),
    updateSelectedNodeCustomClasses: vi.fn(),
    updateSelectedNodeProps: mockState.updateSelectedNodePropsMock,
    updateSelectedNodeStyles: mockState.updateSelectedNodeStylesMock,
    updateSelectedNodeA11y: vi.fn(),
  }),
}));

vi.mock("../../admin/features/Core/composables/useSelectionTreeState", () => ({
  useSelectionTreeState: () => ({
    selectionTreeRootNodes: mockState.selectionTreeRootNodes,
  }),
}));

vi.mock(
  "../../admin/features/Core/composables/usePropertySaveHistory",
  async () => {
    const { z } = await import("zod");

    return {
      PropertySaveMutationUpdatesSchema: z
        .object({
          props: z.record(z.string(), z.unknown()).optional(),
          styles: z
            .record(z.string(), z.record(z.string(), z.unknown()))
            .optional(),
          a11y: z.record(z.string(), z.unknown()).optional(),
        })
        .strict(),
      usePropertySaveHistory: () => ({
        executePropertySaveMutation: mockState.executePropertySaveMutationMock,
        executePropertySaveBatchMutation:
          mockState.executePropertySaveBatchMutationMock,
      }),
    };
  },
);

describe("usePropertySave preview helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.selectedNodeId.value = "node-1";
    mockState.selectedNodeIds.value = ["node-1"];
    mockState.targetBreakpoint.value = "base";
    mockState.selectedNode.value = {
      id: "node-1",
      type: "list",
      props: {
        ordered: false,
      },
      styles: {
        fontSize: { base: "16px" },
      },
      children: [],
    };
    mockState.selectionTreeRootNodes.value = [mockState.selectedNode.value];
  });

  it("keeps live canvas preview without mutating selected-node styles", async () => {
    const { usePropertySave } =
      await import("../../admin/features/Core/composables/usePropertySave");

    const propertySave = usePropertySave();
    const result = propertySave.previewStyleProperties({
      fontSize: "20px",
    });

    expect(result).toBe(true);
    expect(mockState.signalStyleUpdateMock).toHaveBeenCalledWith({
      nodeId: "node-1",
      styles: {
        base: {
          fontSize: "20px",
        },
      },
    });
    expect(mockState.updateSelectedNodeStylesMock).not.toHaveBeenCalled();
    expect(mockState.selectedNode.value.styles.fontSize?.base).toBe("16px");
  });

  it("keeps live prop preview without mutating selected-node props", async () => {
    const { usePropertySave } =
      await import("../../admin/features/Core/composables/usePropertySave");

    const propertySave = usePropertySave();
    const result = propertySave.previewProps({ ordered: true });

    expect(result).toBe(true);
    expect(mockState.signalPropsUpdateMock).toHaveBeenCalledWith({
      nodeId: "node-1",
      props: {
        ordered: true,
      },
    });
    expect(mockState.updateSelectedNodePropsMock).not.toHaveBeenCalled();
    expect(mockState.selectedNode.value.props.ordered).toBe(false);
  });

  it("treats visibility as a supported style property", async () => {
    const { usePropertySave } =
      await import("../../admin/features/Core/composables/usePropertySave");

    const propertySave = usePropertySave();

    expect(propertySave.isStyleProperty("visibility")).toBe(true);
    expect(propertySave.isStyleProperty("listStyleType")).toBe(true);
    expect(propertySave.isStyleProperty("listStylePosition")).toBe(true);
  });

  it("fans style previews out across selected nodes when multi-select is active", async () => {
    const { usePropertySave } =
      await import("../../admin/features/Core/composables/usePropertySave");

    mockState.selectedNodeIds.value = ["node-1", "node-2"];
    mockState.selectionTreeRootNodes.value = [
      mockState.selectedNode.value,
      {
        id: "node-2",
        type: "text",
        props: {},
        styles: {
          fontSize: { base: "14px" },
        },
        children: [],
      },
    ];

    const propertySave = usePropertySave();
    const result = propertySave.previewStyleProperties({ fontSize: "20px" });

    expect(result).toBe(true);
    expect(mockState.signalStyleUpdateMock).toHaveBeenNthCalledWith(1, {
      nodeId: "node-1",
      styles: {
        base: {
          fontSize: "20px",
        },
      },
    });
    expect(mockState.signalStyleUpdateMock).toHaveBeenNthCalledWith(2, {
      nodeId: "node-2",
      styles: {
        base: {
          fontSize: "20px",
        },
      },
    });
  });

  it("uses batch history execution when saving a property across multiple selected nodes", async () => {
    const { usePropertySave } =
      await import("../../admin/features/Core/composables/usePropertySave");

    mockState.executePropertySaveMutationMock.mockResolvedValue({
      success: true,
    });
    mockState.executePropertySaveBatchMutationMock.mockResolvedValue({
      success: true,
    });
    mockState.selectedNodeIds.value = ["node-1", "node-2"];
    mockState.selectionTreeRootNodes.value = [
      mockState.selectedNode.value,
      {
        id: "node-2",
        type: "text",
        props: {},
        styles: {
          fontSize: { base: "14px" },
        },
        children: [],
      },
    ];

    const propertySave = usePropertySave();
    const result = await propertySave.saveProperty(
      "fontSize",
      "20px",
      "page",
      "home",
    );

    expect(result).toBe(true);
    expect(mockState.executePropertySaveMutationMock).not.toHaveBeenCalled();
    expect(mockState.executePropertySaveBatchMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          type: "batch-nodes",
          affectedNodeIds: ["node-1", "node-2"],
        }),
        targets: [
          expect.objectContaining({
            target: expect.objectContaining({ nodeId: "node-1" }),
          }),
          expect.objectContaining({
            target: expect.objectContaining({ nodeId: "node-2" }),
          }),
        ],
      }),
    );
  });

  it("records one batch history entry with both transform properties for undo", async () => {
    const { usePropertySave } =
      await import("../../admin/features/Core/composables/usePropertySave");

    mockState.selectedNode.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        transform: {
          base: "translate(0px, 0px) rotate(0deg) scale(1, 1) skew(0deg, 0deg)",
        },
        transformOrigin: { base: "center center" },
      },
      children: [],
    };

    mockState.executePropertySaveMutationMock.mockResolvedValue({
      success: true,
    });

    const propertySave = usePropertySave();
    const result = await propertySave.saveProperties(
      {
        transform:
          "translate(12px, 18px) rotate(45deg) scale(1.1, 1.2) skew(2deg, 4deg)",
        transformOrigin: "left top",
      },
      "page",
      "home",
    );

    expect(result).toBe(true);
    expect(mockState.executePropertySaveMutationMock).toHaveBeenCalledTimes(1);
    expect(mockState.executePropertySaveMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({
          styles: {
            transform: {
              base: "translate(12px, 18px) rotate(45deg) scale(1.1, 1.2) skew(2deg, 4deg)",
            },
            transformOrigin: { base: "left top" },
          },
        }),
        restoreUpdates: expect.objectContaining({
          styles: {
            transform: {
              base: "translate(0px, 0px) rotate(0deg) scale(1, 1) skew(0deg, 0deg)",
            },
            transformOrigin: { base: "center center" },
          },
        }),
      }),
    );

    const mutationCall =
      mockState.executePropertySaveMutationMock.mock.calls[0]?.[0];
    await mutationCall?.onUndo?.();

    expect(mockState.updateSelectedNodeStylesMock).toHaveBeenCalledWith(
      "node-1",
      {
        transform: {
          base: "translate(0px, 0px) rotate(0deg) scale(1, 1) skew(0deg, 0deg)",
        },
        transformOrigin: { base: "center center" },
      },
    );
  });

  it("clears downstream overrides when previewing a desktop style save", async () => {
    const { usePropertySave } =
      await import("../../admin/features/Core/composables/usePropertySave");

    mockState.activeBreakpoints.value = [
      { name: "base", label: "Desktop", minWidth: 1280 },
      { name: "tablet", label: "Tablet", minWidth: 768 },
      { name: "mobile", label: "Mobile", minWidth: 0 },
    ];
    mockState.selectedNode.value = {
      id: "node-1",
      type: "list",
      props: {},
      styles: {
        listStyleType: { base: "disc", tablet: "disc" },
      },
      children: [],
    };
    mockState.selectionTreeRootNodes.value = [mockState.selectedNode.value];

    const propertySave = usePropertySave();
    const result = propertySave.previewStyleProperties({
      listStyleType: "none",
    });

    expect(result).toBe(true);
    expect(mockState.signalStyleUpdateMock).toHaveBeenCalledWith({
      nodeId: "node-1",
      styles: {
        base: { listStyleType: "none" },
        tablet: { listStyleType: undefined },
      },
    });
  });

  it("strips undefined prop values before notifying the canvas", async () => {
    mockState.executePropertySaveMutationMock.mockImplementation(
      async (input: { onRedo?: () => Promise<void> }) => {
        await input.onRedo?.();
        return { success: true };
      },
    );

    const { usePropertySave } =
      await import("../../admin/features/Core/composables/usePropertySave");

    const propertySave = usePropertySave();
    const result = await propertySave.saveNodeUpdates(
      {
        props: {
          label: "Buy now",
          variant: "muted",
          text: undefined,
          icon: undefined,
          href: undefined,
        },
      },
      "page",
      "home",
    );

    expect(result).toBe(true);
    expect(mockState.signalPropsUpdateMock).toHaveBeenCalledWith({
      nodeId: "node-1",
      props: {
        label: "Buy now",
        variant: "muted",
      },
    });
  });
});
