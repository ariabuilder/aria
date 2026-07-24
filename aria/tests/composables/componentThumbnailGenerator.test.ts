import { beforeEach, describe, expect, it, vi } from "vitest";

import { COMPONENT_PREVIEW_ROOT_ATTR } from "@/lib/schemas/componentPreview";
import { COMPONENT_PREVIEW_ROOT_SELECTOR } from "@/features/Studio/components/composables/componentPreviewConstants";

const saveThumbnailMock = vi.hoisted(() => vi.fn());
const deleteThumbnailMock = vi.hoisted(() => vi.fn());

vi.mock("astro:actions", () => ({
  actions: {
    components: {
      saveThumbnail: saveThumbnailMock,
      deleteThumbnail: deleteThumbnailMock,
    },
  },
}));

vi.mock(
  "../../admin/features/Studio/pages/utils/deviceCapabilities",
  () => ({
    isThumbnailCaptureSupported: () => true,
    isIOS: () => false,
  }),
);

type ListenerMap = Record<string, Array<() => void>>;

function createFakeFrame(content = "Preview"): HTMLIFrameElement {
  const listeners: ListenerMap = {};
  const doc = document.implementation.createHTMLDocument("snapshot");
  const previewRoot = doc.createElement("div");
  previewRoot.setAttribute(COMPONENT_PREVIEW_ROOT_ATTR, "");
  previewRoot.textContent = content;
  Object.defineProperty(previewRoot, "scrollWidth", {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(previewRoot, "offsetWidth", {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(previewRoot, "scrollHeight", {
    configurable: true,
    get: () => 400,
  });
  Object.defineProperty(previewRoot, "offsetHeight", {
    configurable: true,
    get: () => 400,
  });
  doc.body.appendChild(previewRoot);

  const frame = {
    style: {},
    contentDocument: {
      body: doc.body,
      head: doc.head,
      documentElement: doc.documentElement,
      createElement: (tagName: string) => doc.createElement(tagName),
      querySelector: (selector: string) => doc.querySelector(selector),
      querySelectorAll: (selector: string) => doc.querySelectorAll(selector),
      fonts: {
        ready: Promise.resolve(),
      },
      readyState: "complete",
    },
    contentWindow: {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
      getComputedStyle: (element: Element) => window.getComputedStyle(element),
    },
    setAttribute: vi.fn(),
    addEventListener: (type: string, callback: () => void) => {
      listeners[type] ??= [];
      listeners[type].push(callback);
    },
    removeEventListener: (type: string, callback: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter(
        (candidate) => candidate !== callback,
      );
    },
    remove: vi.fn(),
  } as unknown as HTMLIFrameElement;

  Object.defineProperty(frame, "srcdoc", {
    set() {
      for (const callback of listeners.load ?? []) {
        callback();
      }
    },
  });

  expect(doc.querySelector(COMPONENT_PREVIEW_ROOT_SELECTOR)).toBe(previewRoot);

  return frame;
}

function createFrameElement(): HTMLIFrameElement {
  return createFakeFrame();
}

function createCapturingFrame(): {
  frame: HTMLIFrameElement;
  getSrcdoc: () => string;
} {
  const listeners: ListenerMap = {};
  let capturedSrcdoc = "";
  const doc = document.implementation.createHTMLDocument("snapshot");
  const previewRoot = doc.createElement("div");
  previewRoot.setAttribute(COMPONENT_PREVIEW_ROOT_ATTR, "");
  previewRoot.textContent = "Preview";
  Object.defineProperty(previewRoot, "scrollWidth", {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(previewRoot, "offsetWidth", {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(previewRoot, "scrollHeight", {
    configurable: true,
    get: () => 400,
  });
  Object.defineProperty(previewRoot, "offsetHeight", {
    configurable: true,
    get: () => 400,
  });
  doc.body.appendChild(previewRoot);

  const frame = {
    style: {},
    contentDocument: {
      body: doc.body,
      head: doc.head,
      documentElement: doc.documentElement,
      createElement: (tagName: string) => doc.createElement(tagName),
      querySelector: (selector: string) => doc.querySelector(selector),
      querySelectorAll: (selector: string) => doc.querySelectorAll(selector),
      fonts: {
        ready: Promise.resolve(),
      },
      readyState: "complete",
    },
    contentWindow: {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
      getComputedStyle: (element: Element) => window.getComputedStyle(element),
    },
    setAttribute: vi.fn(),
    addEventListener: (type: string, callback: () => void) => {
      listeners[type] ??= [];
      listeners[type].push(callback);
    },
    removeEventListener: (type: string, callback: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter(
        (candidate) => candidate !== callback,
      );
    },
    remove: vi.fn(),
  } as unknown as HTMLIFrameElement;

  Object.defineProperty(frame, "srcdoc", {
    set(value: string) {
      capturedSrcdoc = value;
      for (const callback of listeners.load ?? []) {
        callback();
      }
    },
  });

  return {
    frame,
    getSrcdoc: () => capturedSrcdoc,
  };
}

function createCrossRealmFrame(): {
  frame: HTMLIFrameElement;
  getPreviewRoot: () => Element | null;
} {
  const listeners: ListenerMap = {};
  const hostFrame = document.createElement("iframe");
  document.body.appendChild(hostFrame);

  const frameDocument = hostFrame.contentDocument;
  if (!frameDocument) {
    throw new Error("Expected iframe document");
  }

  const frame = {
    style: {},
    contentDocument: frameDocument,
    contentWindow: {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
      getComputedStyle: (element: Element) => window.getComputedStyle(element),
    },
    setAttribute: vi.fn(),
    addEventListener: (type: string, callback: () => void) => {
      listeners[type] ??= [];
      listeners[type].push(callback);
    },
    removeEventListener: (type: string, callback: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter(
        (candidate) => candidate !== callback,
      );
    },
    remove: () => hostFrame.remove(),
  } as unknown as HTMLIFrameElement;

  Object.defineProperty(frame, "srcdoc", {
    set(value: string) {
      frameDocument.documentElement.innerHTML = value;
      for (const callback of listeners.load ?? []) {
        callback();
      }
    },
  });

  return {
    frame,
    getPreviewRoot: () => frameDocument.querySelector(COMPONENT_PREVIEW_ROOT_SELECTOR),
  };
}

describe("componentThumbnailGenerator", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    saveThumbnailMock.mockReset();
    deleteThumbnailMock.mockReset();
    saveThumbnailMock.mockResolvedValue({
      success: true,
      data: {
        componentId: "hero-cta",
        thumbnailUrl: "/admin/api/component-thumbnails/hero-cta",
      },
    });
    deleteThumbnailMock.mockResolvedValue({
      success: true,
      data: {
        componentId: "hero-cta",
        deleted: true,
      },
    });
  });

  it("captures isolate snapshot html and uploads a webp thumbnail", async () => {
    const canvasToBlobMock = vi.fn((callback: BlobCallback, type?: string) => {
      callback?.(new Blob(["thumb"], { type: type ?? "image/webp" }));
    });
    const toCanvasMock = vi.fn(async () => {
      const canvas = document.createElement("canvas");
      canvas.toBlob = canvasToBlobMock as HTMLCanvasElement["toBlob"];
      return canvas;
    });
    const appendChild = vi.fn();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          `<html><body><div ${COMPONENT_PREVIEW_ROOT_ATTR}>Preview</div></body></html>`,
          {
            status: 200,
            headers: { "Content-Type": "text/html" },
          },
        ),
      );

    const { ensureComponentThumbnail } = await import(
      "../../admin/features/Studio/components/composables/componentThumbnailGenerator"
    );

    const thumbnailUrl = await ensureComponentThumbnail(
      { componentId: "hero-cta" },
      {
        document: {
          body: { appendChild },
          createElement: ((tagName: string) => {
            if (tagName !== "iframe") {
              throw new Error(`Unexpected tag: ${tagName}`);
            }

            return createFrameElement();
          }) as Document["createElement"],
        } as unknown as Document,
        fetch: fetchMock,
        toCanvas: toCanvasMock,
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/api/component-snapshots/hero-cta?thumb=1",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        headers: expect.objectContaining({
          Accept: "text/html",
        }),
      }),
    );
    expect(appendChild).toHaveBeenCalledWith(expect.anything());
    expect(toCanvasMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        width: expect.any(Number),
        height: expect.any(Number),
        pixelRatio: 1,
        backgroundColor: "#ffffff",
        skipFonts: true,
        cacheBust: true,
      }),
    );
    expect(saveThumbnailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        componentId: "hero-cta",
        mimeType: "image/webp",
      }),
    );
    expect(toCanvasMock).toHaveBeenCalled();
    expect(saveThumbnailMock).toHaveBeenCalled();
    expect(thumbnailUrl).toContain("/admin/api/component-thumbnails/hero-cta");
    expect(thumbnailUrl).toContain("cv=");
  });

  it("requests snapshot refresh only when regenerating", async () => {
    const appendChild = vi.fn();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          `<html><body><div ${COMPONENT_PREVIEW_ROOT_ATTR}>Preview</div></body></html>`,
          {
            status: 200,
            headers: { "Content-Type": "text/html" },
          },
        ),
      );

    const { regenerateComponentThumbnail } = await import(
      "../../admin/features/Studio/components/composables/componentThumbnailGenerator"
    );

    await regenerateComponentThumbnail(
      { componentId: "hero-cta" },
      {
        document: {
          body: { appendChild },
          createElement: ((tagName: string) => {
            if (tagName !== "iframe") {
              throw new Error(`Unexpected tag: ${tagName}`);
            }

            return createFrameElement();
          }) as Document["createElement"],
        } as unknown as Document,
        fetch: fetchMock,
        toCanvas: vi.fn(async () => {
          const canvas = document.createElement("canvas");
          canvas.toBlob = ((callback: BlobCallback) => {
            callback?.(new Blob(["thumb"], { type: "image/webp" }));
          }) as HTMLCanvasElement["toBlob"];
          return canvas;
        }),
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/api/component-snapshots/hero-cta?thumb=1&refresh=1",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
  });

  it("accepts preview root elements from the iframe DOM realm", async () => {
    const canvasToBlobMock = vi.fn((callback: BlobCallback, type?: string) => {
      callback?.(new Blob(["thumb"], { type: type ?? "image/webp" }));
    });
    const toCanvasMock = vi.fn(async () => {
      const canvas = document.createElement("canvas");
      canvas.toBlob = canvasToBlobMock as HTMLCanvasElement["toBlob"];
      return canvas;
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        `<html><body><div ${COMPONENT_PREVIEW_ROOT_ATTR}>Preview</div></body></html>`,
        {
          status: 200,
          headers: { "Content-Type": "text/html" },
        },
      ),
    );
    const crossRealmFrame = createCrossRealmFrame();

    const { ensureComponentThumbnail } = await import(
      "../../admin/features/Studio/components/composables/componentThumbnailGenerator"
    );

    const thumbnailUrl = await ensureComponentThumbnail(
      { componentId: "hero-cta" },
      {
        document: {
          body: { appendChild: vi.fn() },
          createElement: ((tagName: string) => {
            if (tagName !== "iframe") {
              throw new Error(`Unexpected tag: ${tagName}`);
            }

            return crossRealmFrame.frame;
          }) as Document["createElement"],
        } as unknown as Document,
        fetch: fetchMock,
        toCanvas: toCanvasMock,
      },
    );

    expect(crossRealmFrame.getPreviewRoot()).not.toBeInstanceOf(HTMLElement);
    expect(toCanvasMock).toHaveBeenCalled();
    expect(saveThumbnailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        componentId: "hero-cta",
        mimeType: "image/webp",
      }),
    );
    expect(thumbnailUrl).toContain("/admin/api/component-thumbnails/hero-cta");
  });

  it("falls back to png when webp encoding fails", async () => {
    const canvasToBlobMock = vi.fn(
      (callback: BlobCallback, type?: string, _quality?: number) => {
        if (type === "image/webp") {
          callback?.(null);
          return;
        }

        callback?.(new Blob(["thumb"], { type: type ?? "image/png" }));
      },
    );
    const toCanvasMock = vi.fn(async () => {
      const canvas = document.createElement("canvas");
      canvas.toBlob = canvasToBlobMock as HTMLCanvasElement["toBlob"];
      return canvas;
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        `<html><body><div ${COMPONENT_PREVIEW_ROOT_ATTR}>Preview</div></body></html>`,
        {
          status: 200,
          headers: { "Content-Type": "text/html" },
        },
      ),
    );

    const { ensureComponentThumbnail } = await import(
      "../../admin/features/Studio/components/composables/componentThumbnailGenerator"
    );

    const thumbnailUrl = await ensureComponentThumbnail(
      { componentId: "hero-cta" },
      {
        document: {
          body: { appendChild: vi.fn() },
          createElement: ((tagName: string) => {
            if (tagName !== "iframe") {
              throw new Error(`Unexpected tag: ${tagName}`);
            }

            return createFrameElement();
          }) as Document["createElement"],
        } as unknown as Document,
        fetch: fetchMock,
        toCanvas: toCanvasMock,
      },
    );

    expect(saveThumbnailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        componentId: "hero-cta",
        mimeType: "image/png",
      }),
    );
    expect(thumbnailUrl).toContain("/admin/api/component-thumbnails/hero-cta");
  });

  it("strips snapshot storage markers from html before capture", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        `<!-- aria-component-snapshot:v1 -->
<!-- aria-component-snapshot:style-revision:rev -->
<html><body><div ${COMPONENT_PREVIEW_ROOT_ATTR}>Preview</div></body></html>`,
        {
          status: 200,
          headers: { "Content-Type": "text/html" },
        },
      ),
    );
    const toCanvasMock = vi.fn(async () => {
      const canvas = document.createElement("canvas");
      canvas.toBlob = ((callback) => {
        callback?.(new Blob(["thumb"], { type: "image/webp" }));
      }) as HTMLCanvasElement["toBlob"];
      return canvas;
    });
    const capturingFrame = createCapturingFrame();

    const { ensureComponentThumbnail } = await import(
      "../../admin/features/Studio/components/composables/componentThumbnailGenerator"
    );

    await ensureComponentThumbnail(
      { componentId: "hero-cta" },
      {
        document: {
          body: { appendChild: vi.fn() },
          createElement: ((tagName: string) => {
            if (tagName !== "iframe") {
              throw new Error(`Unexpected tag: ${tagName}`);
            }

            return capturingFrame.frame;
          }) as Document["createElement"],
        } as unknown as Document,
        fetch: fetchMock,
        toCanvas: toCanvasMock,
      },
    );

    expect(capturingFrame.getSrcdoc()).toContain("Preview");
    expect(capturingFrame.getSrcdoc()).not.toContain("aria-component-snapshot");
  });

  it("strips google font assets from snapshot html before capture", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        `<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap"></head><body><div ${COMPONENT_PREVIEW_ROOT_ATTR}>Preview</div></body></html>`,
        {
          status: 200,
          headers: { "Content-Type": "text/html" },
        },
      ),
    );
    const toCanvasMock = vi.fn(async () => {
      const canvas = document.createElement("canvas");
      canvas.toBlob = ((callback) => {
        callback?.(new Blob(["thumb"], { type: "image/webp" }));
      }) as HTMLCanvasElement["toBlob"];
      return canvas;
    });
    const capturingFrame = createCapturingFrame();

    const { ensureComponentThumbnail } = await import(
      "../../admin/features/Studio/components/composables/componentThumbnailGenerator"
    );

    await ensureComponentThumbnail(
      { componentId: "hero-cta" },
      {
        document: {
          body: { appendChild: vi.fn() },
          createElement: ((tagName: string) => {
            if (tagName !== "iframe") {
              throw new Error(`Unexpected tag: ${tagName}`);
            }

            return capturingFrame.frame;
          }) as Document["createElement"],
        } as unknown as Document,
        fetch: fetchMock,
        toCanvas: toCanvasMock,
      },
    );

    expect(capturingFrame.getSrcdoc()).not.toContain("fonts.googleapis.com");
    expect(capturingFrame.getSrcdoc()).toContain("Preview");
  });

  it("supports detached fetch references without illegal invocation", async () => {
    const detachedFetch = globalThis.fetch;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((input, init) => detachedFetch(input, init));
    const appendChild = vi.fn();

    const { ensureComponentThumbnail } = await import(
      "../../admin/features/Studio/components/composables/componentThumbnailGenerator"
    );

    const thumbnailUrl = await ensureComponentThumbnail(
      { componentId: "missing-component" },
      {
        document: {
          body: { appendChild },
          createElement: ((tagName: string) => {
            if (tagName !== "iframe") {
              throw new Error(`Unexpected tag: ${tagName}`);
            }

            return createFrameElement();
          }) as Document["createElement"],
        } as unknown as Document,
        fetch: fetchMock,
        toCanvas: vi.fn(),
      },
    );

    expect(fetchMock).toHaveBeenCalled();
    expect(thumbnailUrl).toBeNull();
    expect(saveThumbnailMock).not.toHaveBeenCalled();
  });

  it("keeps the stored thumbnail untouched when component preview capture is empty", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        `<html><body><div ${COMPONENT_PREVIEW_ROOT_ATTR}></div></body></html>`,
        {
          status: 200,
          headers: { "Content-Type": "text/html" },
        },
      ),
    );

    const { ensureComponentThumbnail } = await import(
      "../../admin/features/Studio/components/composables/componentThumbnailGenerator"
    );

    const thumbnailUrl = await ensureComponentThumbnail(
      { componentId: "hero-cta" },
      {
        document: {
          body: { appendChild: vi.fn() },
          createElement: ((tagName: string) => {
            if (tagName !== "iframe") {
              throw new Error(`Unexpected tag: ${tagName}`);
            }

            return createFakeFrame("");
          }) as Document["createElement"],
        } as unknown as Document,
        fetch: fetchMock,
        toCanvas: vi.fn(),
      },
    );

    expect(thumbnailUrl).toBeNull();
    expect(saveThumbnailMock).not.toHaveBeenCalled();
    expect(deleteThumbnailMock).not.toHaveBeenCalled();
  });

  it("returns null when snapshot html is unavailable", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    const { ensureComponentThumbnail } = await import(
      "../../admin/features/Studio/components/composables/componentThumbnailGenerator"
    );

    const thumbnailUrl = await ensureComponentThumbnail(
      { componentId: "missing-component" },
      {
        document: {
          body: { appendChild: vi.fn() },
          createElement: ((tagName: string) => {
            if (tagName !== "iframe") {
              throw new Error(`Unexpected tag: ${tagName}`);
            }

            return createFrameElement();
          }) as Document["createElement"],
        } as unknown as Document,
        fetch: fetchMock,
        toCanvas: vi.fn(),
      },
    );

    expect(thumbnailUrl).toBeNull();
    expect(saveThumbnailMock).not.toHaveBeenCalled();
  });
});
