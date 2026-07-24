import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  registerPreviewFrameMock,
  signalRenderDSLMock,
  signalHighlightNodeMock,
  signalScrollToNodeMock,
} = vi.hoisted(() => ({
  registerPreviewFrameMock: vi.fn(),
  signalRenderDSLMock: vi.fn(),
  signalHighlightNodeMock: vi.fn(),
  signalScrollToNodeMock: vi.fn(),
}));

vi.mock("../../admin/features/Stage/composables/usePreviewSignals", () => ({
  usePreviewSignals: () => ({
    registerPreviewFrame: registerPreviewFrameMock,
    signalRenderDSL: signalRenderDSLMock,
    signalHighlightNode: signalHighlightNodeMock,
    signalScrollToNode: signalScrollToNodeMock,
  }),
}));

describe("usePreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signalRenderDSLMock.mockReturnValue(true);
    signalHighlightNodeMock.mockReturnValue(true);
    signalScrollToNodeMock.mockReturnValue(true);
  });

  it("registers the preview iframe with the preview signal bridge", async () => {
    const { usePreview } =
      await import("../../admin/features/Stage/composables/usePreview");

    const preview = usePreview();
    preview.registerIframe(null);
    const iframe = { contentWindow: {}, src: "/preview" } as HTMLIFrameElement;

    preview.registerIframe(iframe);

    expect(preview.previewIframe.value).toStrictEqual(iframe);
    expect(registerPreviewFrameMock).toHaveBeenCalledWith(iframe);
  });

  it("does not signal preview messages until the iframe is ready", async () => {
    const { usePreview } =
      await import("../../admin/features/Stage/composables/usePreview");

    const preview = usePreview();
    preview.registerIframe(null);

    expect(
      preview.sendToPreview({
        id: "home",
        title: "Home",
        slug: "home",
        nodes: [],
      }),
    ).toBe(false);
    expect(preview.highlightNode("hero")).toBe(false);
    expect(preview.scrollToNode("hero")).toBe(false);

    expect(signalRenderDSLMock).not.toHaveBeenCalled();
    expect(signalHighlightNodeMock).not.toHaveBeenCalled();
    expect(signalScrollToNodeMock).not.toHaveBeenCalled();
  });

  it("routes preview messages through the typed preview signal bridge", async () => {
    const { usePreview } =
      await import("../../admin/features/Stage/composables/usePreview");

    const preview = usePreview();
    preview.registerIframe(null);
    preview.registerIframe({
      contentWindow: {},
      src: "/preview",
    } as HTMLIFrameElement);

    const page = {
      id: "home",
      title: "Home",
      slug: "home",
      nodes: [],
    };
    const layout = {
      id: "shell",
      name: "Shell",
      slug: "shell",
      nodes: [],
      slots: [],
    };

    expect(preview.sendToPreview(page, layout)).toBe(true);
    expect(preview.highlightNode("hero")).toBe(true);
    expect(preview.scrollToNode("hero")).toBe(true);
    expect(preview.clearHighlight()).toBe(true);

    expect(signalRenderDSLMock).toHaveBeenCalledWith({ page, layout });
    expect(signalHighlightNodeMock).toHaveBeenNthCalledWith(1, {
      nodeId: "hero",
    });
    expect(signalScrollToNodeMock).toHaveBeenCalledWith({ nodeId: "hero" });
    expect(signalHighlightNodeMock).toHaveBeenNthCalledWith(2, {
      nodeId: null,
    });
  });
});
