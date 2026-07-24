import { beforeEach, describe, expect, it, vi } from "vitest";

const { frameRefMock, signalMock, loggerMock } = vi.hoisted(() => ({
  frameRefMock: { value: undefined as HTMLIFrameElement | undefined },
  signalMock: vi.fn(),
  loggerMock: vi.fn(),
}));

vi.mock("../../admin/composables/useSignals", () => ({
  useSignals: () => ({
    frameRef: frameRefMock,
    signal: signalMock,
  }),
}));

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("usePreviewSignals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    frameRefMock.value = undefined;
  });

  it("validates preview render payloads and targets the registered iframe", async () => {
    const { usePreviewSignals } =
      await import("../../admin/features/Stage/composables/usePreviewSignals");

    const previewSignals = usePreviewSignals();
    const iframe = { contentWindow: {} } as HTMLIFrameElement;

    previewSignals.registerPreviewFrame(iframe);

    const sent = previewSignals.signalRenderDSL({
      page: {
        id: "home",
        title: "Home",
        slug: "home",
        nodes: [],
      },
      layout: {
        id: "shell",
        name: "Shell",
        slug: "shell",
        nodes: [],
        slots: [],
      },
    });

    expect(frameRefMock.value).toBe(iframe);
    expect(sent).toBe(true);
    expect(signalMock).toHaveBeenCalledWith("aria:preview:render-dsl", {
      page: {
        id: "home",
        title: "Home",
        slug: "home",
        nodes: [],
      },
      layout: {
        id: "shell",
        name: "Shell",
        slug: "shell",
        nodes: [],
        slots: [],
      },
    });
  });

  it("rejects invalid preview payloads before signaling", async () => {
    const { usePreviewSignals } =
      await import("../../admin/features/Stage/composables/usePreviewSignals");

    const previewSignals = usePreviewSignals();

    const sent = previewSignals.signalScrollToNode({ nodeId: "" });

    expect(sent).toBe(false);
    expect(signalMock).not.toHaveBeenCalled();
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[usePreviewSignals] Ignored invalid scroll-to-node payload",
      expect.objectContaining({ issues: expect.any(Array) }),
    );
  });
});
