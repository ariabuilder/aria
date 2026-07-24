import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import type { BuilderNode } from "../../../lib/types/nodes";

const signalBridgeMock = vi.hoisted(() => ({
  broadcastPropsUpdate: vi.fn(),
}));

vi.mock("../../../admin/features/Core", () => ({
  useCanvasSignalBridge: () => signalBridgeMock,
}));

import { useStageInlineEditing } from "../../../admin/features/Stage/composables/useStageInlineEditing";

function mockRect(top: number, height: number, left = 0, width = 400): DOMRect {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useStageInlineEditing", () => {
  it("enters inline edit on the editable node under the pointer, not the outer event target", () => {
    const stageDocument = document.implementation.createHTMLDocument("stage");
    stageDocument.body.innerHTML = `
      <section data-aria-id="container-node" data-aria-type="Container">
        <p data-aria-id="paragraph-node" data-aria-type="Paragraph">Editable paragraph</p>
      </section>
    `;

    const container = stageDocument.querySelector(
      '[data-aria-id="container-node"]',
    ) as HTMLElement;
    const paragraph = stageDocument.querySelector(
      '[data-aria-id="paragraph-node"]',
    ) as HTMLElement;

    container.getBoundingClientRect = () => mockRect(0, 300, 0, 800);
    paragraph.getBoundingClientRect = () => mockRect(40, 24, 20, 240);

    Object.defineProperty(stageDocument, "elementFromPoint", {
      value: vi.fn(() => container),
      configurable: true,
    });
    Object.defineProperty(stageDocument, "elementsFromPoint", {
      value: vi.fn(() => [paragraph, container, stageDocument.body]),
      configurable: true,
    });

    const blocks: BuilderNode[] = [
      {
        id: "container-node",
        type: "Container",
        props: {},
        styles: {},
        children: [
          {
            id: "paragraph-node",
            type: "Paragraph",
            props: { text: "Editable paragraph" },
            styles: {},
            children: [],
          },
        ],
      },
    ];

    const TestComponent = defineComponent({
      setup() {
        const { setupInlineTextEditing } = useStageInlineEditing({
          getDoc: () => stageDocument,
          getBlocks: () => blocks,
          findNode: (nodes, id) => {
            const visit = (entries: BuilderNode[]): BuilderNode | null => {
              for (const node of entries) {
                if (node.id === id) return node;
                const child = visit(node.children ?? []);
                if (child) return child;
              }
              return null;
            };
            return visit(nodes);
          },
          getCurrentItemType: () => "page",
          getCurrentItemSlug: () => "home",
          safeParse: () => ({ success: true }),
          saveProperties: vi.fn(async () => true),
        });

        setupInlineTextEditing();
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    container.dispatchEvent(
      new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        clientX: 32,
        clientY: 48,
      }),
    );

    expect(paragraph.getAttribute("contenteditable")).toBe("true");
    expect(paragraph.getAttribute("data-aria-inline-node-id")).toBe(
      "paragraph-node",
    );

    wrapper.unmount();
  });
});
