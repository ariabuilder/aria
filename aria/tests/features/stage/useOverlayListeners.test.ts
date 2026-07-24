/**
 * useOverlayListeners tests
 *
 * @vitest-environment jsdom
 */

import { mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BuilderNode } from "../../../lib/types/nodes";
import type {
  ComponentConversionConfirmPayload,
  UseComponentConversionReturn,
} from "../../../admin/features/Stage/composables/useComponentConversion";

const bridgeMocks = vi.hoisted(() => ({
  broadcastHoverNode: vi.fn(),
  broadcastSelectNode: vi.fn(),
  signalClearInsertionContext: vi.fn(),
}));

vi.mock("../../../admin/features/Core", () => ({
  useCanvasInteractionBridge: () => bridgeMocks,
}));

import { useOverlayListeners } from "../../../admin/features/Stage/composables/useOverlayListeners";

function createLinkedNode(id = "linked-node"): BuilderNode {
  return {
    id,
    type: "Text",
    props: {
      href: "/target-page",
    },
    styles: {},
    children: [],
  };
}

function createStageDocument(nodeId = "linked-node"): Document {
  const doc = document.implementation.createHTMLDocument("stage");
  doc.body.innerHTML = `
    <div data-aria-id="${nodeId}" data-aria-type="Text">
      <a href="/target-page" data-testid="stage-link">Linked item</a>
    </div>
  `;
  return doc;
}

function createConversionStub(): UseComponentConversionReturn {
  return {
    isDialogOpen: ref(false),
    pendingNodeId: ref(null),
    suggestedName: ref(""),
    openDialog: vi.fn(),
    handleConfirm: vi.fn(
      async (_payload: ComponentConversionConfirmPayload) => undefined,
    ),
    closeDialog: vi.fn(),
  };
}

function mountOverlayListeners() {
  const stageDocument = createStageDocument();
  const iframeRef = ref({
    contentDocument: stageDocument,
    addEventListener: vi.fn(),
  } as unknown as HTMLIFrameElement);
  const canvasOverlays = {
    showHover: vi.fn(),
    hideHover: vi.fn(),
    showSelection: vi.fn(),
    schedulePositionUpdate: vi.fn(),
    hideSelection: vi.fn(),
  };
  const syncSelectionToolbar = vi.fn();
  const emit = vi.fn();
  const blocks = [createLinkedNode()];

  const TestComponent = defineComponent({
    setup() {
      const { setupOverlayListeners } = useOverlayListeners({
        iframeRef,
        getDoc: () => stageDocument,
        isDragging: ref(false),
        canvasOverlays,
        syncSelectionToolbar,
        emit,
        findNodeLocation: (_allBlocks, id) => ({
          nodeId: id,
          parentId: null,
          index: 0,
        }),
        findNode: (allBlocks, id) =>
          allBlocks.find((node) => node.id === id) ?? null,
        getBlocks: () => blocks,
        conversion: createConversionStub(),
        isTextContent: () => false,
        semanticPriority: {},
      });

      setupOverlayListeners();

      return () => h("div");
    },
  });

  return {
    wrapper: mount(TestComponent),
    stageDocument,
    canvasOverlays,
    syncSelectionToolbar,
    emit,
  };
}

describe("useOverlayListeners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("prevents anchor navigation while keeping linked canvas nodes selectable", () => {
    const { wrapper, stageDocument, canvasOverlays, syncSelectionToolbar } =
      mountOverlayListeners();

    const link = stageDocument.querySelector(
      '[data-testid="stage-link"]',
    ) as HTMLAnchorElement | null;

    expect(link).not.toBeNull();

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    const dispatchResult = link?.dispatchEvent(clickEvent);

    expect(dispatchResult).toBe(false);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(canvasOverlays.showSelection).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      "linked-node",
      "Text",
    );
    expect(syncSelectionToolbar).toHaveBeenCalledWith("linked-node");

    wrapper.unmount();
  });

  it("keeps blocking navigation when a repeat click lands on linked text content", () => {
    const { wrapper, stageDocument, canvasOverlays, syncSelectionToolbar } =
      mountOverlayListeners();

    const link = stageDocument.querySelector(
      '[data-testid="stage-link"]',
    ) as HTMLAnchorElement | null;
    const textNode = link?.firstChild;

    expect(link).not.toBeNull();
    expect(textNode?.nodeType).toBe(Node.TEXT_NODE);

    const firstClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    const secondClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });

    const firstDispatchResult = link?.dispatchEvent(firstClick);
    const secondDispatchResult = textNode?.dispatchEvent(secondClick);

    expect(firstDispatchResult).toBe(false);
    expect(secondDispatchResult).toBe(false);
    expect(firstClick.defaultPrevented).toBe(true);
    expect(secondClick.defaultPrevented).toBe(true);
    expect(canvasOverlays.showSelection).toHaveBeenNthCalledWith(
      1,
      expect.any(HTMLDivElement),
      "linked-node",
      "Text",
    );
    expect(canvasOverlays.showSelection).toHaveBeenNthCalledWith(
      2,
      expect.any(HTMLDivElement),
      "linked-node",
      "Text",
    );
    expect(syncSelectionToolbar).toHaveBeenNthCalledWith(1, "linked-node");
    expect(syncSelectionToolbar).toHaveBeenNthCalledWith(2, "linked-node");

    wrapper.unmount();
  });

  it("emits structured selection payloads with click gesture metadata", () => {
    const { wrapper, stageDocument, canvasOverlays, emit } =
      mountOverlayListeners();

    const link = stageDocument.querySelector(
      '[data-testid="stage-link"]',
    ) as HTMLAnchorElement | null;

    link?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        metaKey: true,
      }),
    );

    expect(canvasOverlays.showSelection).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      "linked-node",
      "Text",
    );
    expect(emit).toHaveBeenCalledWith("selectBlock", {
      nodeId: "linked-node",
      triggerGesture: {
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
      },
    });

    wrapper.unmount();
  });

  it("uses point hit testing so inner nodes can be selected when the click target is an outer container", () => {
    const { wrapper, stageDocument, canvasOverlays, emit } =
      mountOverlayListeners();

    stageDocument.body.innerHTML = `
      <section data-aria-id="container-node" data-aria-type="Container">
        <h2 data-aria-id="heading-node" data-aria-type="Heading">Heading</h2>
      </section>
    `;

    const container = stageDocument.querySelector(
      '[data-aria-id="container-node"]',
    ) as HTMLElement | null;
    const heading = stageDocument.querySelector(
      '[data-aria-id="heading-node"]',
    ) as HTMLElement | null;

    expect(container).not.toBeNull();
    expect(heading).not.toBeNull();

    Object.defineProperty(stageDocument, "elementFromPoint", {
      value: vi.fn(() => container),
      configurable: true,
    });
    Object.defineProperty(stageDocument, "elementsFromPoint", {
      value: vi.fn(() => [heading, container, stageDocument.body]),
      configurable: true,
    });

    container?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: 24,
        clientY: 40,
      }),
    );

    expect(canvasOverlays.showSelection).toHaveBeenCalledWith(
      heading,
      "heading-node",
      "Heading",
    );
    expect(emit).toHaveBeenCalledWith("selectBlock", {
      nodeId: "heading-node",
      triggerGesture: {
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
      },
    });

    wrapper.unmount();
  });

  it("selects the canvas node when the browser click target is a text node", () => {
    const { wrapper, stageDocument, canvasOverlays, emit } =
      mountOverlayListeners();

    stageDocument.body.innerHTML = `
      <p data-aria-id="paragraph-node" data-aria-type="Paragraph">Editable paragraph</p>
    `;

    const paragraph = stageDocument.querySelector(
      '[data-aria-id="paragraph-node"]',
    ) as HTMLElement | null;
    const textNode = paragraph?.firstChild;

    expect(paragraph).not.toBeNull();
    expect(textNode?.nodeType).toBe(Node.TEXT_NODE);

    textNode?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: 24,
        clientY: 40,
      }),
    );

    expect(canvasOverlays.showSelection).toHaveBeenCalledWith(
      paragraph,
      "paragraph-node",
      "Paragraph",
    );
    expect(emit).toHaveBeenCalledWith("selectBlock", {
      nodeId: "paragraph-node",
      triggerGesture: {
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
      },
    });

    wrapper.unmount();
  });

  it("dispatches a paste request with clipboard data for the selected node", () => {
    const { wrapper, stageDocument } = mountOverlayListeners();

    const root = stageDocument.querySelector(
      '[data-aria-id="linked-node"]',
    ) as HTMLDivElement | null;
    expect(root).not.toBeNull();

    const pasteListener = vi.fn();
    window.addEventListener("component:paste", pasteListener);

    root?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );

    const pasteEvent = new Event("paste", {
      bubbles: true,
      cancelable: true,
    }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        getData: vi.fn((type: string) => {
          if (type === "text/plain") {
            return '<div class="hero-shell"></div>';
          }

          if (type === "text/html") {
            return '<div class="hero-shell"><h1>Hero</h1></div>';
          }

          return "";
        }),
      },
    });

    stageDocument.dispatchEvent(pasteEvent);

    expect(pasteListener).toHaveBeenCalledTimes(1);
    const [event] = pasteListener.mock.calls[0] as [
      CustomEvent<{
        nodeId: string;
        clipboardText?: string;
        clipboardHtml?: string;
      }>,
    ];
    expect(event.detail.nodeId).toBe("linked-node");
    expect(event.detail.clipboardText).toBe('<div class="hero-shell"></div>');
    expect(event.detail.clipboardHtml).toBe(
      '<div class="hero-shell"><h1>Hero</h1></div>',
    );
    expect(pasteEvent.defaultPrevented).toBe(true);

    window.removeEventListener("component:paste", pasteListener);
    wrapper.unmount();
  });
});
