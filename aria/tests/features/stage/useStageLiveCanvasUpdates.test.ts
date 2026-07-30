/**
 * useStageLiveCanvasUpdates tests
 *
 * @vitest-environment jsdom
 */

import { mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  BreakpointDefinition,
  BuilderNode,
  JsonObject,
} from "../../../lib/types/nodes";

const bridgeCallbacks = vi.hoisted(() => ({
  propsUpdate: null as
    | ((payload: {
        nodeId: string;
        props: Record<string, unknown>;
        source?: "inspector-live" | "stage-inline-live";
      }) => void)
    | null,
  styleUpdate: null as
    | ((payload: {
        nodeId: string;
        styles: Record<string, Record<string, string | undefined>>;
      }) => void)
    | null,
  motionUpdate: null as
    | ((payload: {
        nodeId: string;
        motion: {
          enabled: boolean;
          preset?: string;
          effects: string[];
          trigger: string;
          speed?: string;
          easing?: string;
          distance?: string;
        };
      }) => void)
    | null,
  spacingPreviewStart: null as ((payload: { nodeId: string }) => void) | null,
  spacingPreviewEnd: null as (() => void) | null,
}));

vi.mock("../../../admin/features/Stage/utils/canvasIconHydration", () => ({
  hydrateIconHost: vi.fn(
    ({ host, iconValue }: { host: HTMLElement; iconValue: unknown }) => {
      host.setAttribute("data-live-icon", "1");
      host.textContent = typeof iconValue === "string" ? iconValue : "icon";
      return Promise.resolve();
    },
  ),
}));

vi.mock("../../../admin/features/Core", () => ({
  useCanvasSignalBridge: () => ({
    onA11yUpdate: vi.fn(() => vi.fn()),
    onClassUpdate: vi.fn(() => vi.fn()),
    onMotionUpdate: vi.fn((callback) => {
      bridgeCallbacks.motionUpdate = callback;
      return vi.fn();
    }),
    onPropsUpdate: vi.fn((callback) => {
      bridgeCallbacks.propsUpdate = callback;
      return vi.fn();
    }),
    onStyleUpdate: vi.fn((callback) => {
      bridgeCallbacks.styleUpdate = callback;
      return vi.fn();
    }),
    onSpacingPreviewStart: vi.fn((callback) => {
      bridgeCallbacks.spacingPreviewStart = callback;
      return vi.fn();
    }),
    onSpacingPreviewEnd: vi.fn((callback) => {
      bridgeCallbacks.spacingPreviewEnd = callback;
      return vi.fn();
    }),
  }),
  useCanvasInteractionBridge: () => ({
    onSelectNode: vi.fn(() => vi.fn()),
  }),
}));

import { useStageLiveCanvasUpdates } from "../../../admin/features/Stage/composables/useStageLiveCanvasUpdates";
import { CANVAS_DISABLED_ATTRIBUTE } from "../../../admin/features/Stage/utils/canvasRenderAttributes";
import { hydrateIconHost } from "../../../admin/features/Stage/utils/canvasIconHydration";

function createImageNode(id = "image-1"): BuilderNode {
  return {
    id,
    type: "image",
    props: {},
    styles: {},
    children: [],
  };
}

function createButtonNode(
  id = "button-1",
  props: JsonObject = {},
): BuilderNode {
  return {
    id,
    type: "Button",
    props,
    styles: {},
    children: [],
  };
}

function createListNode(
  id = "list-1",
  props: JsonObject = {},
): BuilderNode {
  return {
    id,
    type: "list",
    props,
    styles: {},
    children: [],
  };
}

function createTextNode(
  id = "text-1",
  props: JsonObject = {},
  type = "Text",
): BuilderNode {
  return {
    id,
    type,
    props,
    styles: {},
    children: [],
  };
}

function createStageDocument(nodeId = "image-1"): Document {
  const doc = document.implementation.createHTMLDocument("stage");
  doc.body.innerHTML = `
    <div data-aria-id="${nodeId}" data-aria-type="image">
      <img src="/demo.png" alt="Demo image" />
    </div>
  `;
  return doc;
}

function createButtonStageDocument(nodeId = "button-1"): Document {
  const doc = document.implementation.createHTMLDocument("stage");
  doc.body.innerHTML = `
    <button data-aria-id="${nodeId}" data-aria-type="Button" data-drop-zone="true" data-zone-id="${nodeId}" data-button-variant="primary">
      Buy now
    </button>
  `;
  return doc;
}

function createListStageDocument(nodeId = "list-1", tag = "ul"): Document {
  const doc = document.implementation.createHTMLDocument("stage");
  doc.body.innerHTML = `
    <${tag} data-aria-id="${nodeId}" data-aria-type="list">
      <li>First item</li>
    </${tag}>
  `;
  return doc;
}

function createTextStageDocument(
  nodeId = "text-1",
  tag = "p",
  type = "Text",
  content = "Hello world",
): Document {
  const doc = document.implementation.createHTMLDocument("stage");
  doc.body.innerHTML = `
    <${tag} data-aria-id="${nodeId}" data-aria-type="${type}">${content}</${tag}>
  `;
  return doc;
}

function createIconNode(
  id = "icon-1",
  styles: BuilderNode["styles"] = {},
): BuilderNode {
  return {
    id,
    type: "icon",
    props: {
      icon: "i-lucide:star",
    },
    styles,
    children: [],
  };
}

function createIconStageDocument(nodeId = "icon-1"): Document {
  const doc = document.implementation.createHTMLDocument("stage");
  doc.body.innerHTML = `
    <div data-aria-id="${nodeId}" data-aria-type="icon">
      <span data-aria-icon-host="1"></span>
    </div>
  `;
  return doc;
}

function mountLiveUpdates(options: {
  iframeRef: { value: HTMLIFrameElement | null };
  blocks?: BuilderNode[];
  renderedBlocks?: BuilderNode[];
  breakpoints?: BreakpointDefinition[];
  collectResponsiveStyleCSS?: ReturnType<typeof vi.fn>;
  canvasOverlays?: {
    hideSelection?: ReturnType<typeof vi.fn>;
    showSelectionGhost?: ReturnType<typeof vi.fn>;
    hideSelectionGhost?: ReturnType<typeof vi.fn>;
    schedulePositionUpdate?: ReturnType<typeof vi.fn>;
    selection?: {
      visible: boolean;
      nodeId: string | null;
    };
  };
}) {
  const blocks = options.blocks ?? [createImageNode()];
  const collectResponsiveStyleCSS =
    options.collectResponsiveStyleCSS ?? vi.fn(() => ".responsive{}");
  const canvasOverlays = {
    hideSelection: options.canvasOverlays?.hideSelection ?? vi.fn(),
    showSelectionGhost: options.canvasOverlays?.showSelectionGhost ?? vi.fn(),
    hideSelectionGhost: options.canvasOverlays?.hideSelectionGhost ?? vi.fn(),
    schedulePositionUpdate:
      options.canvasOverlays?.schedulePositionUpdate ?? vi.fn(),
    selection: options.canvasOverlays?.selection ?? {
      visible: true,
      nodeId: "image-1",
    },
  };

  const TestComponent = defineComponent({
    setup() {
      useStageLiveCanvasUpdates({
        iframeRef: ref(options.iframeRef.value),
        getBlocks: () => blocks,
        getRenderedBlocks: () => options.renderedBlocks ?? blocks,
        findNode: (allBlocks, id) =>
          allBlocks.find((node) => node.id === id) ?? null,
        getNodeClassName: () => "",
        getStageBreakpoints: () =>
          options.breakpoints ?? [
            { name: "base", minWidth: "0px", label: "Base" },
          ],
        toCssPropertyName: (property) =>
          property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`),
        collectResponsiveStyleCSS: collectResponsiveStyleCSS as any,
        canvasOverlays: canvasOverlays as any,
        defaultHeadingLevel: 2,
      });

      return () => h("div");
    },
  });

  return {
    wrapper: mount(TestComponent),
    collectResponsiveStyleCSS,
    canvasOverlays,
  };
}

describe("useStageLiveCanvasUpdates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeCallbacks.propsUpdate = null;
    bridgeCallbacks.styleUpdate = null;
    bridgeCallbacks.motionUpdate = null;
    bridgeCallbacks.spacingPreviewStart = null;
    bridgeCallbacks.spacingPreviewEnd = null;
  });

  it("routes base style previews through live responsive CSS instead of inline styles", () => {
    const stageDocument = createStageDocument();
    const iframeRef = {
      value: { contentDocument: stageDocument } as HTMLIFrameElement,
    };

    const { wrapper, collectResponsiveStyleCSS, canvasOverlays } =
      mountLiveUpdates({
        iframeRef,
      });

    bridgeCallbacks.styleUpdate?.({
      nodeId: "image-1",
      styles: {
        base: {
          marginTop: "24px",
          width: "320px",
        },
      },
    });

    const element = stageDocument.querySelector(
      '[data-aria-id="image-1"]',
    ) as HTMLElement | null;
    const image = element?.querySelector("img") as HTMLImageElement | null;

    expect(element?.style.marginTop).toBe("");
    expect(element?.style.width).toBe("");
    expect(image?.style.width).toBe("");
    expect(collectResponsiveStyleCSS).toHaveBeenCalledWith(
      [createImageNode()],
      expect.any(Map),
    );
    expect(canvasOverlays.schedulePositionUpdate).toHaveBeenCalledWith(
      "translate",
    );
    expect(
      stageDocument.head.querySelector("style[data-aria-node-styles]")
        ?.textContent,
    ).toBe(".responsive{}");
    expect(
      stageDocument.head.querySelector("style[data-aria-live-node-styles]")
        ?.textContent,
    ).toBe("");

    wrapper.unmount();
  });

  it("routes base background color previews through live CSS for breakpoint cascade", () => {
    const stageDocument = createStageDocument();
    const iframeRef = {
      value: { contentDocument: stageDocument } as HTMLIFrameElement,
    };

    const { wrapper, collectResponsiveStyleCSS } = mountLiveUpdates({
      iframeRef,
    });

    bridgeCallbacks.styleUpdate?.({
      nodeId: "image-1",
      styles: {
        base: {
          backgroundColor: "#ffffff",
        },
      },
    });

    const element = stageDocument.querySelector(
      '[data-aria-id="image-1"]',
    ) as HTMLElement | null;

    expect(element?.style.backgroundColor).toBe("");
    expect(collectResponsiveStyleCSS).toHaveBeenCalledWith(
      [createImageNode()],
      expect.any(Map),
    );

    wrapper.unmount();
  });

  it("keeps expanded component styles when live CSS is synchronized", () => {
    const stageDocument = createStageDocument("component-1__section-root");
    const iframeRef = {
      value: { contentDocument: stageDocument } as HTMLIFrameElement,
    };
    const componentInstance = {
      id: "component-1",
      type: "Component",
      props: {},
      styles: {},
      children: [],
      componentRef: "numbers",
      reference: { type: "instance" as const, masterId: "numbers" },
    } satisfies BuilderNode;
    const expandedSection = {
      id: "component-1__section-root",
      type: "Section",
      props: {},
      styles: { display: { base: "grid" } },
      children: [],
    } satisfies BuilderNode;
    const collectResponsiveStyleCSS = vi.fn(() => ".component-grid{}");

    const { wrapper } = mountLiveUpdates({
      iframeRef,
      blocks: [componentInstance],
      renderedBlocks: [expandedSection],
      collectResponsiveStyleCSS,
      canvasOverlays: {
        selection: {
          visible: true,
          nodeId: "component-1__section-root",
        },
      },
    });

    bridgeCallbacks.styleUpdate?.({
      nodeId: "component-1__section-root",
      styles: { base: { gap: "2rem" } },
    });

    expect(collectResponsiveStyleCSS).toHaveBeenCalledWith(
      [expandedSection],
      expect.any(Map),
    );
    expect(
      stageDocument.head.querySelector("style[data-aria-node-styles]")
        ?.textContent,
    ).toBe(".component-grid{}");

    wrapper.unmount();
  });

  it("shows and hides the selection ghost during spacing preview", () => {
    const stageDocument = createStageDocument();
    const iframeRef = {
      value: { contentDocument: stageDocument } as HTMLIFrameElement,
    };

    const { wrapper, canvasOverlays } = mountLiveUpdates({ iframeRef });
    const element = stageDocument.querySelector(
      '[data-aria-id="image-1"]',
    ) as HTMLElement;

    bridgeCallbacks.spacingPreviewStart?.({ nodeId: "image-1" });
    bridgeCallbacks.spacingPreviewEnd?.();

    expect(canvasOverlays.showSelectionGhost).toHaveBeenCalledWith(
      element,
      "image",
    );
    expect(canvasOverlays.hideSelectionGhost).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("applies motion classes once and schedules the runtime reveal", async () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const stageDocument = iframe.contentDocument!;
    const stageWindow = stageDocument.defaultView!;
    stageWindow.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(stageWindow.performance.now());
      return 1;
    }) as typeof stageWindow.requestAnimationFrame;
    stageDocument.body.innerHTML = `
      <div data-aria-id="image-1" data-aria-type="image" class="aria-motion aria-motion-fade aria-motion-in">
        <img src="/demo.png" alt="Demo image" />
      </div>
    `;
    const initMotion = vi.fn((container?: Document | Element) => {
      (container ?? stageDocument)
        .querySelectorAll(".aria-motion")
        .forEach((element) => element.classList.add("aria-motion-in"));
    });
    stageWindow.AriaMotion = { init: initMotion };

    const { wrapper } = mountLiveUpdates({
      iframeRef: { value: iframe },
      blocks: [createImageNode()],
    });

    bridgeCallbacks.motionUpdate?.({
      nodeId: "image-1",
      motion: {
        enabled: true,
        preset: "fade-up",
        effects: ["fade", "slide-up"],
        trigger: "reveal",
        speed: "normal",
        easing: "smooth",
        distance: "md",
      },
    });

    await new Promise((resolve) =>
      stageDocument.defaultView?.setTimeout(resolve, 0),
    );

    const element = stageDocument.querySelector(
      '[data-aria-id="image-1"]',
    ) as HTMLElement | null;

    expect(element?.classList.contains("aria-motion")).toBe(true);
    expect(element?.classList.contains("aria-motion-fade")).toBe(true);
    expect(element?.classList.contains("aria-motion-slide-up")).toBe(true);
    expect(element?.classList.contains("aria-motion-reveal")).toBe(true);
    expect(element?.classList.contains("aria-motion-in")).toBe(true);
    expect(initMotion).toHaveBeenCalledWith(stageDocument);

    wrapper.unmount();
    iframe.remove();
  });

  it("rebuilds live button previews without leaking button-only props", async () => {
    const stageDocument = createButtonStageDocument();
    const iframeRef = {
      value: { contentDocument: stageDocument } as HTMLIFrameElement,
    };

    const { wrapper } = mountLiveUpdates({
      iframeRef,
      blocks: [
        createButtonNode("button-1", {
          label: "Buy now",
          variant: "primary",
        }),
      ],
    });

    bridgeCallbacks.propsUpdate?.({
      nodeId: "button-1",
      props: {
        label: "Checkout",
        variant: "muted",
        icon: "i-lucide:star",
        iconPosition: "right",
        iconGap: "1rem",
        iconSpaceBetween: true,
      },
      source: "inspector-live",
    });

    await Promise.resolve();

    const button = stageDocument.querySelector(
      '[data-aria-id="button-1"]',
    ) as HTMLElement | null;
    const contentRow = button?.firstElementChild as HTMLElement | null;

    expect(button?.tagName).toBe("BUTTON");
    expect(button?.getAttribute("data-button-variant")).toBe("muted");
    expect(button?.hasAttribute("variant")).toBe(false);
    expect(button?.hasAttribute("iconGap")).toBe(false);
    expect(button?.hasAttribute("label")).toBe(false);
    expect(contentRow).not.toBeNull();
    expect(contentRow?.style.gap).toBe("1rem");
    expect(contentRow?.style.justifyContent).toBe("space-between");
    expect(contentRow?.style.width).toBe("100%");
    expect(contentRow?.children[0]?.textContent).toBe("Checkout");
    expect(contentRow?.children[1]?.getAttribute("data-live-icon")).toBe("1");

    wrapper.unmount();
  });

  it("retags button nodes when live href updates switch them to links", () => {
    const stageDocument = createButtonStageDocument();
    const iframeRef = {
      value: { contentDocument: stageDocument } as HTMLIFrameElement,
    };

    const { wrapper } = mountLiveUpdates({
      iframeRef,
      blocks: [createButtonNode("button-1", { label: "Buy now" })],
    });

    bridgeCallbacks.propsUpdate?.({
      nodeId: "button-1",
      props: {
        href: "/pricing",
        label: "View pricing",
      },
      source: "inspector-live",
    });

    const element = stageDocument.querySelector(
      '[data-aria-id="button-1"]',
    ) as HTMLElement | null;

    expect(element?.tagName).toBe("A");
    expect(element?.getAttribute("href")).toBe("/pricing");
    expect(element?.textContent).toContain("View pricing");

    wrapper.unmount();
  });

  it("retags list nodes when live ordered updates switch list semantics", () => {
    const stageDocument = createListStageDocument();
    const iframeRef = {
      value: { contentDocument: stageDocument } as HTMLIFrameElement,
    };

    const { wrapper } = mountLiveUpdates({
      iframeRef,
      blocks: [createListNode("list-1", { ordered: false })],
    });

    bridgeCallbacks.propsUpdate?.({
      nodeId: "list-1",
      props: {
        ordered: true,
      },
      source: "inspector-live",
    });

    let element = stageDocument.querySelector(
      '[data-aria-id="list-1"]',
    ) as HTMLElement | null;

    expect(element?.tagName).toBe("OL");
    expect(element?.textContent).toContain("First item");
    expect(element?.hasAttribute("ordered")).toBe(false);

    bridgeCallbacks.propsUpdate?.({
      nodeId: "list-1",
      props: {
        ordered: false,
      },
      source: "inspector-live",
    });

    element = stageDocument.querySelector(
      '[data-aria-id="list-1"]',
    ) as HTMLElement | null;

    expect(element?.tagName).toBe("UL");
    expect(element?.hasAttribute("ordered")).toBe(false);

    wrapper.unmount();
  });

  it("retags text nodes to span-like tags and updates their live content", () => {
    const stageDocument = createTextStageDocument();
    const iframeRef = {
      value: { contentDocument: stageDocument } as HTMLIFrameElement,
    };

    const { wrapper } = mountLiveUpdates({
      iframeRef,
      blocks: [createTextNode("text-1", { content: "Hello world" })],
      canvasOverlays: {
        selection: {
          visible: true,
          nodeId: "text-1",
        },
      },
    });

    bridgeCallbacks.propsUpdate?.({
      nodeId: "text-1",
      props: {
        element: "span",
        content: "Inline copy",
      },
      source: "inspector-live",
    });

    const element = stageDocument.querySelector(
      '[data-aria-id="text-1"]',
    ) as HTMLElement | null;

    expect(element?.tagName).toBe("SPAN");
    expect(element?.innerHTML).toBe("Inline copy");

    wrapper.unmount();
  });

  it("retags heading nodes when tag overrides switch them away from semantic headings", () => {
    const stageDocument = createTextStageDocument(
      "heading-1",
      "h2",
      "Heading",
      "Original title",
    );
    const iframeRef = {
      value: { contentDocument: stageDocument } as HTMLIFrameElement,
    };

    const { wrapper } = mountLiveUpdates({
      iframeRef,
      blocks: [
        createTextNode(
          "heading-1",
          { text: "Original title", level: 2 },
          "Heading",
        ),
      ],
    });

    bridgeCallbacks.propsUpdate?.({
      nodeId: "heading-1",
      props: {
        element: "div",
        text: "Retagged title",
      },
      source: "inspector-live",
    });

    const element = stageDocument.querySelector(
      '[data-aria-id="heading-1"]',
    ) as HTMLElement | null;

    expect(element?.tagName).toBe("DIV");
    expect(element?.textContent).toBe("Retagged title");

    wrapper.unmount();
  });

  it("routes live icon typography updates through responsive CSS", () => {
    const stageDocument = createIconStageDocument();
    const iframeRef = {
      value: { contentDocument: stageDocument } as HTMLIFrameElement,
    };

    const { wrapper, collectResponsiveStyleCSS } = mountLiveUpdates({
      iframeRef,
      blocks: [createIconNode()],
      canvasOverlays: {
        selection: {
          visible: true,
          nodeId: "icon-1",
        },
      },
    });

    bridgeCallbacks.styleUpdate?.({
      nodeId: "icon-1",
      styles: {
        base: {
          color: "rgb(255, 0, 0)",
          fontSize: "28px",
          width: "28px",
          height: "28px",
        },
      },
    });

    const element = stageDocument.querySelector(
      '[data-aria-id="icon-1"]',
    ) as HTMLElement | null;
    const iconHost = stageDocument.querySelector(
      '[data-aria-id="icon-1"] [data-aria-icon-host="1"]',
    ) as HTMLElement | null;

    expect(element?.style.color).toBe("");
    expect(iconHost?.style.color).toBe("");
    expect(iconHost?.style.fontSize).toBe("");
    expect(iconHost?.style.width).toBe("");
    expect(iconHost?.style.height).toBe("");
    expect(collectResponsiveStyleCSS).toHaveBeenCalledWith(
      [createIconNode()],
      expect.any(Map),
    );

    wrapper.unmount();
  });

  it("keeps node utility classes off the icon host during live icon updates", () => {
    const stageDocument = createIconStageDocument();
    const iframeRef = {
      value: { contentDocument: stageDocument } as HTMLIFrameElement,
    };
    const iconNode = {
      ...createIconNode(),
      props: {
        icon: "i-lucide:star",
        className: "icon-content",
      },
      classNames: {
        base: ["size-6"],
      },
    } satisfies BuilderNode;

    const { wrapper } = mountLiveUpdates({
      iframeRef,
      blocks: [iconNode],
    });

    bridgeCallbacks.propsUpdate?.({
      nodeId: "icon-1",
      props: {
        icon: "i-lucide:activity",
      },
      source: "inspector-live",
    });

    expect(vi.mocked(hydrateIconHost)).toHaveBeenCalledWith(
      expect.objectContaining({
        iconValue: "i-lucide:activity",
        classNameValue: "icon-content",
      }),
    );
    expect(vi.mocked(hydrateIconHost)).not.toHaveBeenCalledWith(
      expect.objectContaining({
        classNameValue: "size-6",
      }),
    );

    wrapper.unmount();
  });

  it("keeps disabled canvas buttons selectable during live prop updates", () => {
    const stageDocument = createButtonStageDocument();
    const iframeRef = {
      value: { contentDocument: stageDocument } as HTMLIFrameElement,
    };

    const { wrapper } = mountLiveUpdates({
      iframeRef,
      blocks: [createButtonNode("button-1", { label: "Buy now" })],
    });

    bridgeCallbacks.propsUpdate?.({
      nodeId: "button-1",
      props: {
        disabled: true,
      },
      source: "inspector-live",
    });

    const element = stageDocument.querySelector(
      '[data-aria-id="button-1"]',
    ) as HTMLElement | null;

    expect(element?.hasAttribute("disabled")).toBe(false);
    expect(element?.getAttribute(CANVAS_DISABLED_ATTRIBUTE)).toBe("true");

    bridgeCallbacks.propsUpdate?.({
      nodeId: "button-1",
      props: {
        disabled: false,
      },
      source: "inspector-live",
    });

    expect(element?.hasAttribute("disabled")).toBe(false);
    expect(element?.hasAttribute(CANVAS_DISABLED_ATTRIBUTE)).toBe(false);

    wrapper.unmount();
  });
});
