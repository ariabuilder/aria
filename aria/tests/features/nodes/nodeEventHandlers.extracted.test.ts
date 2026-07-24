import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";
import type { BuilderNode, LayoutDSL, PageDSL } from "../../../lib/types/nodes";
import { useEditorNodeRegistry } from "../../../admin/features/Core/composables/useEditorNodeRegistry";
import { useNodeCrudHandlers } from "../../../admin/features/Nodes/events/useNodeCrudHandlers";
import { useNodeComponentHandlers } from "../../../admin/features/Nodes/events/useNodeComponentHandlers";
import { useNodeReorderHandlers } from "../../../admin/features/Nodes/events/useNodeReorderHandlers";
import { useNodeStructureHandlers } from "../../../admin/features/Nodes/events/useNodeStructureHandlers";
import type { HtmlToNodesImportResult } from "../../../lib/blocks/htmlToNodes";

const { actionsMock, toastMock } = vi.hoisted(() => ({
  actionsMock: {
    insertNode: vi.fn(async () => ({ error: null })),
    insertNodes: vi.fn(async () => ({ error: null })),
    deleteNode: vi.fn(async () => ({ error: null })),
    styles: {
      createClass: vi.fn(async () => ({
        data: { success: true },
        error: null,
      })),
    },
    getItem: vi.fn(async () => ({ data: { nodes: [] }, error: null })),
  },
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("astro:actions", () => ({
  actions: actionsMock,
}));

vi.mock("vue-sonner", () => ({
  toast: toastMock,
}));

const createNode = (
  id: string,
  type: string,
  children: BuilderNode[] = [],
): BuilderNode => ({
  id,
  type,
  props: {},
  styles: {},
  children,
});

const findTestNodeById = (
  nodes: BuilderNode[],
  id: string,
): BuilderNode | null => {
  const stack = [...nodes];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (node.id === id) {
      return node;
    }

    if (node.children.length > 0) {
      stack.push(...node.children);
    }
  }

  return null;
};

const createNodeEventExecutorMock = (options?: { runRedo?: boolean }) =>
  vi.fn(
    async (
      _metadata: unknown,
      callbacks: { redo?: () => void | Promise<void> },
    ) => {
      if (options?.runRedo && callbacks.redo) {
        await callbacks.redo();
      }

      return { success: true };
    },
  );

const identityNode = (node: BuilderNode): BuilderNode => node;

const cloneIdentityNode = (
  node: BuilderNode,
  _options?: { regenerateIds?: boolean },
): BuilderNode => node;

function pageBlocksRef(nodes: BuilderNode[]): Ref<BuilderNode[]> {
  return ref(nodes as unknown) as Ref<BuilderNode[]>;
}

function layoutRef(layout: LayoutDSL | null): Ref<LayoutDSL | null> {
  return ref(layout as unknown) as Ref<LayoutDSL | null>;
}

function collectNodeIds(
  nodes: readonly { id: string }[] | undefined,
): string[] {
  return (nodes ?? []).map((node) => node.id);
}

type CrudHandlersOptions = Parameters<typeof useNodeCrudHandlers>[0];

function createCrudHandlersForTest(input: {
  pageBlocks: unknown;
  executeNodeEventOperation: unknown;
  setSelectedBlock: unknown;
  regenerateNodeIds?: (node: BuilderNode) => BuilderNode;
  copyNode?: (node: BuilderNode) => void;
  peekClipboard?: () => BuilderNode | null;
  cloneNode?: (
    node: BuilderNode,
    options?: { regenerateIds?: boolean },
  ) => BuilderNode;
  getDefaultSlotName?: () => string;
  currentLayout?: Ref<LayoutDSL | null>;
  activeSlot?: Ref<{ name: string; scope: "page" | "layout" }>;
  editorNodeRegistry?: ReturnType<typeof useEditorNodeRegistry>;
  resolveMutationPath: () => {
    collection: "pages" | "layouts" | "components";
    id: string;
  } | null;
  readClipboardText?: () => Promise<string>;
  importHtmlToNodes?: (html: string) => Promise<HtmlToNodesImportResult>;
}) {
  const executeNodeEventOperation = input.executeNodeEventOperation as (
    metadata: unknown,
    callbacks: {
      undo?: () => void | Promise<void>;
      redo?: () => void | Promise<void>;
    },
  ) => Promise<{ success: boolean }>;
  const setSelectedBlock = input.setSelectedBlock as (
    id: string | null,
  ) => void;
  const options = {
    pageBlocks: input.pageBlocks as Ref<BuilderNode[]>,
    nodeManipulation: {
      findNodeById: findTestNodeById,
      regenerateNodeIds: input.regenerateNodeIds ?? identityNode,
    },
    executeNodeEventOperation,
    setSelectedBlock,
    copyNode: input.copyNode ?? vi.fn(),
    peekClipboard: input.peekClipboard ?? (() => null),
    cloneNode: input.cloneNode ?? cloneIdentityNode,
    getDefaultSlotName: input.getDefaultSlotName,
    currentLayout: input.currentLayout,
    activeSlot: input.activeSlot,
    editorNodeRegistry: input.editorNodeRegistry,
    resolveMutationPath: input.resolveMutationPath,
    readClipboardText: input.readClipboardText,
    importHtmlToNodes: input.importHtmlToNodes,
  } as CrudHandlersOptions;

  return useNodeCrudHandlers(options);
}

type ComponentHandlersOptions = Parameters<typeof useNodeComponentHandlers>[0];

function createComponentHandlersForTest(input: {
  pageBlocks: unknown;
  currentPage: unknown;
  currentLayout: unknown;
  currentComponent: unknown;
  executeNodeEventOperation: unknown;
  setSelectedBlock: unknown;
  getInsertionParentId?: () => string | null;
  clearInsertionContext?: () => void;
  handleElementAdded?: (node: BuilderNode) => string | null;
  resolveMutationPath: () => {
    collection: "pages" | "layouts" | "components";
    id: string;
  } | null;
  getDefaultSlotName: () => string;
  regenerateNodeIds?: (node: BuilderNode) => BuilderNode;
}) {
  const options = {
    pageBlocks: input.pageBlocks as Ref<BuilderNode[]>,
    currentPage: input.currentPage as Ref<PageDSL | null>,
    currentLayout: input.currentLayout as Ref<null>,
    currentComponent: input.currentComponent as Ref<null>,
    nodeManipulation: {
      findNodeById: findTestNodeById,
      regenerateNodeIds: input.regenerateNodeIds ?? identityNode,
    },
    executeNodeEventOperation:
      input.executeNodeEventOperation as ComponentHandlersOptions["executeNodeEventOperation"],
    setSelectedBlock:
      input.setSelectedBlock as ComponentHandlersOptions["setSelectedBlock"],
    getInsertionParentId: input.getInsertionParentId ?? (() => null),
    clearInsertionContext: input.clearInsertionContext ?? vi.fn(),
    handleElementAdded: input.handleElementAdded ?? (() => null),
    resolveMutationPath: input.resolveMutationPath,
    getDefaultSlotName: input.getDefaultSlotName,
  } as ComponentHandlersOptions;

  return useNodeComponentHandlers(options);
}

type ReorderHandlersOptions = Parameters<typeof useNodeReorderHandlers>[0];

function createReorderHandlersForTest(input: {
  pageBlocks: unknown;
  currentPage: unknown;
  executeNodeEventOperation: unknown;
}) {
  const options = {
    pageBlocks: input.pageBlocks as Ref<BuilderNode[]>,
    currentPage: input.currentPage as Ref<PageDSL | null>,
    executeNodeEventOperation:
      input.executeNodeEventOperation as ReorderHandlersOptions["executeNodeEventOperation"],
  } as ReorderHandlersOptions;

  return useNodeReorderHandlers(options);
}

type StructureHandlersOptions = Parameters<typeof useNodeStructureHandlers>[0];

function createStructureHandlersForTest(input: {
  pageBlocks: unknown;
  executeNodeEventOperation: unknown;
  setSelectedBlock: unknown;
  getSelectedNodeIds?: () => string[];
}) {
  const options = {
    pageBlocks: input.pageBlocks as Ref<BuilderNode[]>,
    nodeManipulation: {
      findNodeById: findTestNodeById,
    },
    executeNodeEventOperation:
      input.executeNodeEventOperation as StructureHandlersOptions["executeNodeEventOperation"],
    setSelectedBlock:
      input.setSelectedBlock as StructureHandlersOptions["setSelectedBlock"],
    getSelectedNodeIds: input.getSelectedNodeIds,
  } as StructureHandlersOptions;

  return useNodeStructureHandlers(options);
}

describe("extracted node event handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("advances structural insertion context only after a successful insert", async () => {
    const pageBlocks = pageBlocksRef([createNode("parent", "Container")]);
    const handleElementAdded = vi.fn(() => "parent");
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });

    const { handleAddElement } = createComponentHandlersForTest({
      pageBlocks,
      currentPage: ref(null),
      currentLayout: ref(null),
      currentComponent: ref(null),
      executeNodeEventOperation,
      setSelectedBlock: vi.fn(),
      getInsertionParentId: () => "parent",
      handleElementAdded,
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
      getDefaultSlotName: () => "main",
    });

    await handleAddElement({
      type: "section",
      data: createNode("new-section", "section"),
    });

    expect(actionsMock.insertNode).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "parent" }),
    );
    expect(handleElementAdded).toHaveBeenCalledWith(
      expect.objectContaining({ id: "new-section" }),
    );
  });

  it("does not advance structural insertion context when insertion fails", async () => {
    const handleElementAdded = vi.fn(() => null);
    const executeNodeEventOperation = vi.fn(async () => ({
      success: false,
      error: "Insert failed",
    }));

    const { handleAddElement } = createComponentHandlersForTest({
      pageBlocks: pageBlocksRef([]),
      currentPage: ref(null),
      currentLayout: ref(null),
      currentComponent: ref(null),
      executeNodeEventOperation,
      setSelectedBlock: vi.fn(),
      getInsertionParentId: () => null,
      handleElementAdded,
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
      getDefaultSlotName: () => "main",
    });

    await handleAddElement({
      type: "section",
      data: createNode("new-section", "section"),
    });

    expect(handleElementAdded).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith("Insert failed");
  });

  it("reports malformed legacy class payloads without poisoning insertion context", async () => {
    const handleElementAdded = vi.fn(() => null);

    const { handleAddElement } = createComponentHandlersForTest({
      pageBlocks: pageBlocksRef([]),
      currentPage: ref(null),
      currentLayout: ref(null),
      currentComponent: ref(null),
      executeNodeEventOperation: createNodeEventExecutorMock({ runRedo: true }),
      setSelectedBlock: vi.fn(),
      getInsertionParentId: () => null,
      handleElementAdded,
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
      getDefaultSlotName: () => "main",
    });

    await handleAddElement({
      type: "section",
      data: {
        ...createNode("legacy-section", "section"),
        props: { className: "" },
      },
    });

    expect(actionsMock.insertNode).not.toHaveBeenCalled();
    expect(handleElementAdded).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith(
      "Element data is invalid and could not be inserted",
    );
  });

  it("honors an explicit canvas-root drop even when contextual nesting is active", async () => {
    const pageBlocks = pageBlocksRef([createNode("parent", "Container")]);

    const { handleAddElement } = createComponentHandlersForTest({
      pageBlocks,
      currentPage: ref(null),
      currentLayout: ref(null),
      currentComponent: ref(null),
      executeNodeEventOperation: createNodeEventExecutorMock({ runRedo: true }),
      setSelectedBlock: vi.fn(),
      getInsertionParentId: () => "parent",
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
      getDefaultSlotName: () => "default",
    });

    await handleAddElement({
      type: "text",
      data: createNode("root-text", "Text"),
      insertionMode: "root",
      position: 0,
    });

    expect(actionsMock.insertNode).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: null, position: 0 }),
    );
    expect(pageBlocks.value[0]?.id).toBe("root-text");
  });

  it("clears a stale implicit parent and falls back to the page root", async () => {
    const clearInsertionContext = vi.fn();

    const { handleAddElement } = createComponentHandlersForTest({
      pageBlocks: pageBlocksRef([]),
      currentPage: ref(null),
      currentLayout: ref(null),
      currentComponent: ref(null),
      executeNodeEventOperation: createNodeEventExecutorMock({ runRedo: true }),
      setSelectedBlock: vi.fn(),
      getInsertionParentId: () => "deleted-container",
      clearInsertionContext,
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
      getDefaultSlotName: () => "default",
    });

    await handleAddElement({
      type: "text",
      data: createNode("fallback-text", "Text"),
    });

    expect(clearInsertionContext).toHaveBeenCalledTimes(1);
    expect(actionsMock.insertNode).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: null }),
    );
  });

  it("falls back to the selected page slot when context belongs to another slot", async () => {
    const mainParent = createNode("main-parent", "Container");
    const pageBlocks = pageBlocksRef([mainParent]);
    const currentLayout = layoutRef({
      id: "layout-1",
      slots: [
        { name: "main", isDefault: true },
        { name: "footer", defaultContent: [createNode("default-footer", "Text")] },
      ],
    } as LayoutDSL);
    const activeSlot = ref({ name: "footer", scope: "page" as const });
    const editorNodeRegistry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout,
      activeSlot,
      currentItemType: ref("page"),
    });
    const clearInsertionContext = vi.fn();

    const handlers = useNodeComponentHandlers({
      pageBlocks,
      currentPage: ref(null),
      currentLayout,
      currentComponent: ref(null),
      nodeManipulation: {
        findNodeById: findTestNodeById,
        regenerateNodeIds: identityNode,
      },
      executeNodeEventOperation: createNodeEventExecutorMock({ runRedo: true }),
      setSelectedBlock: vi.fn(),
      getInsertionParentId: () => "main-parent",
      clearInsertionContext,
      handleElementAdded: vi.fn(() => null),
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
      getDefaultSlotName: () => "footer",
      activeSlot,
      editorNodeRegistry,
    });

    await handlers.handleAddElement({
      type: "text",
      data: createNode("footer-text", "Text"),
    });

    expect(clearInsertionContext).toHaveBeenCalledTimes(1);
    expect(actionsMock.insertNode).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: null,
        node: expect.objectContaining({ slot: "footer" }),
      }),
    );
    expect(currentLayout.value!.slots?.[1]?.defaultContent?.[0]?.id).toBe(
      "default-footer",
    );
  });

  it("deletes a node via CRUD handler", async () => {
    const pageBlocks = pageBlocksRef([
      createNode("a", "Container"),
      createNode("b", "Text"),
    ]);
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();

    const { handleDeleteBlock } = createCrudHandlersForTest({
      pageBlocks,
      executeNodeEventOperation,
      setSelectedBlock,
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
    });

    await handleDeleteBlock("a");

    expect(actionsMock.deleteNode).toHaveBeenCalledTimes(1);
    expect(collectNodeIds(pageBlocks.value)).toEqual(["b"]);
    expect(setSelectedBlock).toHaveBeenCalledWith(null);
    expect(toastMock.success).toHaveBeenCalledWith("Deleted Container block");
  });

  it("deletes layout slot defaultContent while editing a page", async () => {
    const navBlock = createNode("starter-header-navigation", "Navigation");
    const mainBlock = createNode("main-block", "Section");
    const pageBlocks = pageBlocksRef([mainBlock]);
    const currentLayout = layoutRef({
      id: "full-width",
      name: "Full Width",
      slots: [
        { name: "header", defaultContent: [navBlock] },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);
    const activeSlot = ref({ name: "header", scope: "layout" as const });
    const editorNodeRegistry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout,
      activeSlot,
      currentItemType: ref("page"),
    });
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();

    const { handleDeleteBlock } = createCrudHandlersForTest({
      pageBlocks,
      currentLayout,
      activeSlot,
      editorNodeRegistry,
      executeNodeEventOperation,
      setSelectedBlock,
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
    });

    await handleDeleteBlock("starter-header-navigation");

    const headerRoots =
      currentLayout.value!.slots?.find((slot) => slot.name === "header")
        ?.defaultContent ?? [];
    expect(headerRoots).toEqual([]);
    expect(collectNodeIds(pageBlocks.value)).toEqual(["main-block"]);
    expect(setSelectedBlock).toHaveBeenCalledWith(null);
    expect(toastMock.success).toHaveBeenCalledWith("Deleted Navigation block");
  });

  it("duplicates a node via CRUD handler", async () => {
    const pageBlocks = pageBlocksRef([
      createNode("a", "Container"),
      createNode("b", "Text"),
    ]);
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();

    const { handleDuplicateBlock } = createCrudHandlersForTest({
      pageBlocks,
      executeNodeEventOperation,
      setSelectedBlock,
      regenerateNodeIds: (node) => ({ ...node, id: `${node.id}-copy` }),
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
    });

    await handleDuplicateBlock("a");

    expect(actionsMock.insertNode).toHaveBeenCalledTimes(1);
    expect(collectNodeIds(pageBlocks.value)).toEqual(["a", "a-copy", "b"]);
    expect(setSelectedBlock).toHaveBeenCalledWith("a-copy");
    expect(toastMock.success).toHaveBeenCalledWith(
      "Duplicated Container block",
    );
  });

  it("pastes clipboard node after target via CRUD handler", async () => {
    const pageBlocks = pageBlocksRef([
      createNode("a", "Container"),
      createNode("b", "Text"),
    ]);
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();

    const { handlePasteBlock } = createCrudHandlersForTest({
      pageBlocks,
      executeNodeEventOperation,
      setSelectedBlock,
      peekClipboard: () => createNode("clip-1", "Heading"),
      cloneNode: () => createNode("clip-copy", "Heading"),
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
    });

    await handlePasteBlock("a");

    expect(actionsMock.insertNode).toHaveBeenCalledTimes(1);
    expect(actionsMock.insertNodes).not.toHaveBeenCalled();
    expect(collectNodeIds(pageBlocks.value)).toEqual(["a", "clip-copy", "b"]);
    expect(setSelectedBlock).toHaveBeenCalledWith("clip-copy");
    expect(toastMock.success).toHaveBeenCalledWith("Pasted block");
  });

  it("pastes after a block in layout slot defaultContent via the node registry", async () => {
    const headerBlock = createNode("header-block", "Section");
    const mainBlock = createNode("main-block", "Section");
    const pageBlocks = pageBlocksRef([mainBlock]);
    const currentLayout = layoutRef({
      id: "layout-1",
      name: "Two Sidebars",
      slots: [
        { name: "header", defaultContent: [headerBlock] },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);
    const activeSlot = ref({ name: "main", scope: "page" as const });
    const editorNodeRegistry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout,
      activeSlot,
      currentItemType: ref("layout"),
    });
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();

    const { handlePasteBlock } = createCrudHandlersForTest({
      pageBlocks,
      currentLayout,
      activeSlot,
      editorNodeRegistry,
      executeNodeEventOperation,
      setSelectedBlock,
      getDefaultSlotName: () => "main",
      peekClipboard: () => createNode("clip-1", "Heading"),
      cloneNode: () => createNode("clip-copy", "Heading"),
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
    });

    await handlePasteBlock("header-block");

    const headerRoots =
      currentLayout.value!.slots?.find((slot) => slot.name === "header")
        ?.defaultContent ?? [];
    expect(headerRoots.map((node) => node.id)).toEqual([
      "header-block",
      "clip-copy",
    ]);
    expect(collectNodeIds(pageBlocks.value)).toEqual(["main-block"]);
    expect(setSelectedBlock).toHaveBeenCalledWith("clip-copy");
    expect(toastMock.success).toHaveBeenCalledWith("Pasted block");
  });

  it("imports HTML into a layout slot via the node registry", async () => {
    const headerSection = createNode("header-section", "Section");
    const pageBlocks = pageBlocksRef([]);
    const currentLayout = layoutRef({
      id: "layout-1",
      name: "Two Sidebars",
      slots: [
        { name: "header", defaultContent: [headerSection] },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);
    const activeSlot = ref({ name: "header", scope: "layout" as const });
    const editorNodeRegistry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout,
      activeSlot,
      currentItemType: ref("layout"),
    });
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();

    const importedNodes: BuilderNode[] = [createNode("import-hero", "Section")];

    const importHtmlToNodes = vi.fn<
      (html: string) => Promise<HtmlToNodesImportResult>
    >(async () => ({
      nodes: importedNodes,
      report: {
        removedAttributes: [],
        removedElements: [],
        createdCustomClasses: [],
        extractedStyleBlocks: 0,
        rejectedStyleBlocks: 0,
      },
    }));

    const { handlePasteBlock } = createCrudHandlersForTest({
      pageBlocks,
      currentLayout,
      activeSlot,
      editorNodeRegistry,
      executeNodeEventOperation,
      setSelectedBlock,
      getDefaultSlotName: () => "header",
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
      readClipboardText: vi.fn(async () => "<section>Hero</section>"),
      importHtmlToNodes,
    });

    await handlePasteBlock("header-section");

    const headerRoots =
      currentLayout.value!.slots?.find((slot) => slot.name === "header")
        ?.defaultContent ?? [];
    expect(headerRoots).toHaveLength(1);
    expect(headerRoots[0]?.children?.map((node) => node.id)).toEqual([
      "import-hero",
    ]);
    expect(actionsMock.insertNodes).not.toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalledWith("Pasted 1 imported node");
  });

  it("imports raw HTML from the clipboard as sibling nodes after target", async () => {
    const pageBlocks = pageBlocksRef([
      { ...createNode("a", "Container"), slot: "main" },
      { ...createNode("b", "Text"), slot: "footer" },
    ]);
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();

    const importedNodes: BuilderNode[] = [
      {
        ...createNode("import-1", "Section"),
        classNames: { base: ["max-w-340", "mx-auto"] },
        customClasses: ["hero-shell"],
      },
      {
        ...createNode("import-2", "Section"),
        classNames: { base: ["grid", "gap-4"] },
        customClasses: [],
      },
    ];

    const importHtmlToNodes = vi.fn<
      (html: string) => Promise<HtmlToNodesImportResult>
    >(async () => ({
      nodes: importedNodes,
      report: {
        removedAttributes: [{ attribute: "onclick", tagName: "div" }],
        removedElements: [{ tagName: "script" }],
        createdCustomClasses: ["hero-shell"],
        extractedStyleBlocks: 0,
        rejectedStyleBlocks: 0,
      },
    }));

    const { handlePasteBlock } = createCrudHandlersForTest({
      pageBlocks,
      executeNodeEventOperation,
      setSelectedBlock,
      getDefaultSlotName: () => "main",
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
      readClipboardText: vi.fn(
        async () =>
          '<div class="max-w-340 mx-auto hero-shell" onclick="alert(1)"></div><script>alert(1)</script><section class="grid gap-4"></section>',
      ),
      importHtmlToNodes,
    });

    await handlePasteBlock("a");

    expect(importHtmlToNodes).toHaveBeenCalledTimes(1);
    expect(actionsMock.insertNodes).toHaveBeenCalledTimes(1);
    expect(actionsMock.insertNodes).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "a",
        position: 0,
      }),
    );
    expect(actionsMock.insertNode).not.toHaveBeenCalled();
    expect(actionsMock.styles.createClass).toHaveBeenCalledWith({
      name: "hero-shell",
      description: "Imported from pasted HTML",
    });
    expect(collectNodeIds(pageBlocks.value)).toEqual(["a", "b"]);
    expect(collectNodeIds(pageBlocks.value[0]?.children)).toEqual([
      "import-1",
      "import-2",
    ]);
    expect(setSelectedBlock).toHaveBeenCalledWith("import-1");
    expect(toastMock.info).toHaveBeenCalledWith(
      "Pasted HTML with unsupported markup removed",
    );
    expect(toastMock.success).toHaveBeenCalledWith("Pasted 2 imported nodes");
  });

  it("appends raw HTML at zero state to the end of the main content slot", async () => {
    const pageBlocks = pageBlocksRef([
      { ...createNode("header", "Section"), slot: "header" },
      { ...createNode("main-1", "Section"), slot: "main" },
      { ...createNode("footer", "Section"), slot: "footer" },
    ]);
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();

    const importedNodes: BuilderNode[] = [createNode("import-hero", "Section")];

    const importHtmlToNodes = vi.fn<
      (html: string) => Promise<HtmlToNodesImportResult>
    >(async () => ({
      nodes: importedNodes,
      report: {
        removedAttributes: [],
        removedElements: [],
        createdCustomClasses: [],
        extractedStyleBlocks: 0,
        rejectedStyleBlocks: 0,
      },
    }));

    const { handlePasteBlock } = createCrudHandlersForTest({
      pageBlocks,
      executeNodeEventOperation,
      setSelectedBlock,
      getDefaultSlotName: () => "main",
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
      importHtmlToNodes,
    });

    await handlePasteBlock(undefined, {
      clipboardText:
        '<section class="px-4 sm:px-6 lg:px-8"><h1>Bringing Art to everything</h1></section>',
    });

    expect(importHtmlToNodes).toHaveBeenCalledTimes(1);
    expect(actionsMock.insertNodes).toHaveBeenLastCalledWith(
      expect.objectContaining({
        parentId: null,
        position: 2,
      }),
    );
    expect(collectNodeIds(pageBlocks.value)).toEqual([
      "header",
      "main-1",
      "import-hero",
      "footer",
    ]);
    expect(pageBlocks.value[2]?.slot).toBe("main");
    expect(setSelectedBlock).toHaveBeenCalledWith("import-hero");
  });

  it("prefers clipboard payload from the paste event over navigator reads", async () => {
    const pageBlocks = pageBlocksRef([
      createNode("a", "Container"),
      createNode("b", "Text"),
    ]);
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();
    const readClipboardText = vi.fn(async () => "");

    const importHtmlToNodes = vi.fn<
      (html: string) => Promise<HtmlToNodesImportResult>
    >(async () => ({
      nodes: [
        {
          ...createNode("import-hero", "Container"),
          classNames: { base: ["px-4", "sm:px-6", "lg:px-8"] },
        },
      ],
      report: {
        removedAttributes: [],
        removedElements: [],
        createdCustomClasses: [],
        extractedStyleBlocks: 0,
        rejectedStyleBlocks: 0,
      },
    }));

    const { handlePasteBlock } = createCrudHandlersForTest({
      pageBlocks,
      executeNodeEventOperation,
      setSelectedBlock,
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
      readClipboardText,
      importHtmlToNodes,
    });

    await handlePasteBlock("a", {
      clipboardText:
        '<div class="px-4 sm:px-6 lg:px-8"><h1>Bringing Art to everything</h1></div>',
    });

    expect(readClipboardText).not.toHaveBeenCalled();
    expect(importHtmlToNodes).toHaveBeenCalledWith(
      '<div class="px-4 sm:px-6 lg:px-8"><h1>Bringing Art to everything</h1></div>',
    );
    expect(actionsMock.insertNodes).toHaveBeenCalledTimes(1);
    expect(setSelectedBlock).toHaveBeenCalledWith("import-hero");
  });

  it("imports plain html when paste event html is editor-wrapped source", async () => {
    const pageBlocks = pageBlocksRef([createNode("a", "Container")]);
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();
    const heroPlain =
      '<section class="hero"><h1>Ontario Drilling</h1></section>';
    const editorHtml = `<html><body><pre>&lt;section class="hero"&gt;&lt;h1&gt;Ontario Drilling&lt;/h1&gt;&lt;/section&gt;</pre></body></html>`;

    const importHtmlToNodes = vi.fn<
      (html: string) => Promise<HtmlToNodesImportResult>
    >(async () => ({
      nodes: [createNode("import-hero", "Section")],
      report: {
        removedAttributes: [],
        removedElements: [],
        createdCustomClasses: [],
        extractedStyleBlocks: 0,
        rejectedStyleBlocks: 0,
      },
    }));

    const { handlePasteBlock } = createCrudHandlersForTest({
      pageBlocks,
      executeNodeEventOperation,
      setSelectedBlock,
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
      importHtmlToNodes,
    });

    await handlePasteBlock("a", {
      clipboardText: heroPlain,
      clipboardHtml: editorHtml,
    });

    expect(importHtmlToNodes).toHaveBeenCalledWith(
      expect.stringContaining('<section class="hero"'),
    );
    expect(setSelectedBlock).toHaveBeenCalledWith("import-hero");
  });

  it("imports system html when internal aria clipboard is stale", async () => {
    const pageBlocks = pageBlocksRef([createNode("a", "Container")]);
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();
    const cloneNode = vi.fn((node: BuilderNode) => ({
      ...node,
      id: "cloned",
    }));
    const heroPlain =
      '<section class="hero"><h1>Ontario Drilling</h1></section>';

    const importHtmlToNodes = vi.fn<
      (html: string) => Promise<HtmlToNodesImportResult>
    >(async () => ({
      nodes: [createNode("import-hero", "Section")],
      report: {
        removedAttributes: [],
        removedElements: [],
        createdCustomClasses: [],
        extractedStyleBlocks: 0,
        rejectedStyleBlocks: 0,
      },
    }));

    const { handlePasteBlock } = createCrudHandlersForTest({
      pageBlocks,
      executeNodeEventOperation,
      setSelectedBlock,
      peekClipboard: () => createNode("stale-block", "Text"),
      cloneNode,
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
      importHtmlToNodes,
    });

    await handlePasteBlock("a", {
      clipboardText: heroPlain,
    });

    expect(cloneNode).not.toHaveBeenCalled();
    expect(importHtmlToNodes).toHaveBeenCalled();
    expect(setSelectedBlock).toHaveBeenCalledWith("import-hero");
  });

  it("drops a component node at expected slot position", () => {
    const page = {
      id: "page-1",
      title: "Test",
      slug: "test",
      status: "draft",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      nodes: [
        { ...createNode("a", "Section"), slot: "main" },
        { ...createNode("b", "Section"), slot: "main" },
      ],
      frontmatter: {},
      regions: {},
      settings: { breakpoints: [] },
      layout: "default",
      version: "1",
    } as unknown as PageDSL;

    const pageBlocks = pageBlocksRef(page.nodes);
    const currentPage = ref<PageDSL | null>(page);
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();

    const { handleDropComponent } = createComponentHandlersForTest({
      pageBlocks,
      currentPage,
      currentLayout: ref(null),
      currentComponent: ref(null),
      executeNodeEventOperation,
      setSelectedBlock,
      handleElementAdded: () => null,
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
      getDefaultSlotName: () => "main",
    });

    handleDropComponent({
      source: "sidebar",
      componentType: "Section",
      componentData: createNode("new-node", "Section"),
      slot: "main",
      position: 1,
    });

    expect(collectNodeIds(currentPage.value?.nodes)).toEqual([
      "a",
      "new-node",
      "b",
    ]);
    expect(setSelectedBlock).toHaveBeenCalledWith("new-node");
    expect(executeNodeEventOperation).toHaveBeenCalledTimes(1);
  });

  it("replaces a block with a component instance", async () => {
    const pageBlocks = pageBlocksRef([
      createNode("heading-1", "Heading"),
      createNode("text-1", "Text"),
    ]);
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();

    const { handleReplaceBlockWithComponent } = createComponentHandlersForTest({
      pageBlocks,
      currentPage: ref(null),
      currentLayout: ref(null),
      currentComponent: ref(null),
      executeNodeEventOperation,
      setSelectedBlock,
      handleElementAdded: () => null,
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
      getDefaultSlotName: () => "main",
    });

    await handleReplaceBlockWithComponent("heading-1", "hero-banner");

    expect(actionsMock.deleteNode).toHaveBeenCalledTimes(1);
    expect(actionsMock.insertNode).toHaveBeenCalledTimes(1);
    expect(pageBlocks.value[0]).toMatchObject({
      id: "heading-1",
      type: "Component",
      componentRef: "hero-banner",
      reference: {
        type: "instance",
        masterId: "hero-banner",
      },
    });
    expect(setSelectedBlock).toHaveBeenCalledWith("heading-1");
    expect(toastMock.success).toHaveBeenCalledWith(
      "Converted Heading to component",
    );
  });

  it("reorders nodes from layers handler", () => {
    const page = {
      id: "page-1",
      title: "Test",
      slug: "test",
      status: "draft",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      nodes: [
        createNode("a", "Section"),
        createNode("b", "Section"),
        createNode("c", "Section"),
      ],
      frontmatter: {},
      regions: {},
      settings: { breakpoints: [] },
      layout: "default",
      version: "1",
    } as unknown as PageDSL;

    const pageBlocks = pageBlocksRef([...page.nodes]);
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });

    const { handleLayersReorderNode } = createReorderHandlersForTest({
      pageBlocks,
      currentPage: ref(page),
      executeNodeEventOperation,
    });

    handleLayersReorderNode({
      nodeId: "c",
      targetNodeId: "a",
      position: "after",
    });

    expect(collectNodeIds(page.nodes)).toEqual(["a", "c", "b"]);
    expect(collectNodeIds(pageBlocks.value)).toEqual(["a", "c", "b"]);
    expect(executeNodeEventOperation).toHaveBeenCalledTimes(1);
  });

  it("wraps a node through the structure handler", async () => {
    const pageBlocks = pageBlocksRef([createNode("a", "Text")]);
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();

    const { handleWrapInContainer } = createStructureHandlersForTest({
      pageBlocks,
      executeNodeEventOperation,
      setSelectedBlock,
    });

    handleWrapInContainer("a");

    expect(pageBlocks.value).toHaveLength(1);
    expect(pageBlocks.value[0]?.type).toBe("Container");
    expect(pageBlocks.value[0]?.children?.[0]?.id).toBe("a");
    expect(setSelectedBlock).toHaveBeenCalledWith(pageBlocks.value[0]?.id);
    expect(executeNodeEventOperation).toHaveBeenCalledTimes(1);
  });

  it("wraps a nested node inside a container", async () => {
    const pageBlocks = pageBlocksRef([
      createNode("container", "Container", [
        {
          ...createNode("svg", "svg"),
          props: {
            content: '<circle cx="12" cy="12" r="9"></circle>',
          },
        },
      ]),
    ]);
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();

    const { handleWrapInContainer } = createStructureHandlersForTest({
      pageBlocks,
      executeNodeEventOperation,
      setSelectedBlock,
    });

    handleWrapInContainer("svg");

    const container = pageBlocks.value[0];
    expect(container?.type).toBe("Container");
    expect(container?.children).toHaveLength(1);
    expect(container?.children?.[0]?.type).toBe("Container");
    expect(container?.children?.[0]?.children?.[0]?.id).toBe("svg");
    expect(setSelectedBlock).toHaveBeenCalledWith(container?.children?.[0]?.id);
    expect(executeNodeEventOperation).toHaveBeenCalledTimes(1);
  });

  it("wraps multi-selected sibling nodes through the structure handler", async () => {
    const pageBlocks = pageBlocksRef([
      createNode("a", "Text"),
      createNode("b", "Heading"),
      createNode("c", "Text"),
    ]);
    const executeNodeEventOperation = createNodeEventExecutorMock({
      runRedo: true,
    });
    const setSelectedBlock = vi.fn();

    const { handleWrapInContainer } = createStructureHandlersForTest({
      pageBlocks,
      executeNodeEventOperation,
      setSelectedBlock,
      getSelectedNodeIds: () => ["a", "b"],
    });

    handleWrapInContainer("a");

    expect(pageBlocks.value).toHaveLength(2);
    expect(pageBlocks.value[0]?.type).toBe("Container");
    expect(collectNodeIds(pageBlocks.value[0]?.children)).toEqual(["a", "b"]);
    expect(pageBlocks.value[1]?.id).toBe("c");
    expect(setSelectedBlock).toHaveBeenCalledWith(pageBlocks.value[0]?.id);
    expect(executeNodeEventOperation).toHaveBeenCalledTimes(1);
  });
});
