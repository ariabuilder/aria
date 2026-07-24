import { beforeEach, describe, expect, it, vi } from "vitest";

const pageActions = vi.hoisted(() => ({
  saveThumbnail: vi.fn(),
  deleteThumbnail: vi.fn(),
  enqueueThumbnail: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: { pages: pageActions },
}));

type ListenerMap = Record<string, Array<() => void>>;

function createFakeFrame(
  getComputedStyleImpl?: typeof getComputedStyle,
): HTMLIFrameElement {
  const listeners: ListenerMap = {};
  const rootStyle: Record<string, string> = {};
  const bodyStyle: Record<string, string> = {};

  const frame = {
    style: {},
    contentDocument: {
      body: {
        style: bodyStyle,
        scrollHeight: 800,
        querySelectorAll: () => [],
      },
      documentElement: {
        style: rootStyle,
        scrollHeight: 800,
      },
      querySelectorAll: () => [],
      createElement: (tagName: string) => {
        if (tagName === "div") {
          return { style: {}, replaceWith: vi.fn() };
        }
        if (tagName === "style") {
          return {
            setAttribute: vi.fn(),
            textContent: "",
          };
        }
        throw new Error(`Unexpected tag: ${tagName}`);
      },
      head: {
        appendChild: vi.fn(),
      },
      fonts: {
        ready: Promise.resolve(),
      },
    },
    contentWindow: {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
      getComputedStyle:
        getComputedStyleImpl ??
        (((() =>
          ({
            background: "",
            backgroundColor: "#ffffff",
            backgroundImage: "none",
            display: "block",
            width: "100px",
            height: "100px",
          }) as CSSStyleDeclaration)) as typeof getComputedStyle),
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

  return frame;
}

describe("pageThumbnailGenerator", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pageActions.saveThumbnail.mockResolvedValue({
      data: {
        success: true,
        data: {
          pageId: "page-home",
          stage: "published",
          contentType: "image/webp",
          size: 128,
          thumbnailUrl: "/admin/api/page-thumbnails/page-home?stage=published",
        },
      },
      error: undefined,
    });
    pageActions.deleteThumbnail.mockResolvedValue({
      data: { success: true, data: { pageId: "page-home", deletedStages: ["published"] } },
      error: undefined,
    });
  });

  it("uses same-origin credentials and downscaled canvas capture for page thumbnails", async () => {
    const canvasToBlobMock = vi.fn((callback: BlobCallback, type?: string) => {
      callback?.(new Blob(["thumb"], { type: type ?? "image/webp" }));
    });
    const toCanvasMock = vi.fn(
      async () =>
        ({
          toBlob: canvasToBlobMock,
        }) as unknown as HTMLCanvasElement,
    );
    const frame = createFakeFrame();
    const appendChild = vi.fn();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("<html><body><div>Preview</div></body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              pageId: "page-home",
              stage: "published",
              contentType: "image/webp",
              size: 128,
              thumbnailUrl:
                "/admin/api/page-thumbnails/page-home?stage=published",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    const { createPageThumbnailGenerator } =
      await import("../../admin/features/Studio/pages/composables/pageThumbnailGenerator");

    const generator = createPageThumbnailGenerator({
      document: {
        body: { appendChild },
        createElement: ((tagName: string) => {
          if (tagName !== "iframe") {
            throw new Error(`Unexpected tag: ${tagName}`);
          }

          return frame;
        }) as Document["createElement"],
      } as unknown as Document,
      fetch: fetchMock,
      toCanvas: toCanvasMock as unknown as typeof toCanvasMock,
    });

    await generator.ensurePageThumbnail({
      pageId: "page-home",
      pageSlug: "home",
      stage: "published",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/admin/api/page-snapshots/home?stage=published&thumb=1",
      expect.objectContaining({
        credentials: "same-origin",
        headers: expect.objectContaining({
          Accept: "text/html",
        }),
      }),
    );

    expect(appendChild).toHaveBeenCalledWith(frame);
    expect(toCanvasMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        width: 1280,
        height: 720,
        canvasWidth: 640,
        canvasHeight: 360,
        skipFonts: true,
        fetchRequestInit: expect.objectContaining({
          credentials: "same-origin",
        }),
      }),
    );
    expect(canvasToBlobMock).toHaveBeenCalledWith(
      expect.any(Function),
      "image/webp",
      0.72,
    );
    expect(pageActions.saveThumbnail).toHaveBeenCalledTimes(1);
    const upload = pageActions.saveThumbnail.mock.calls[0]?.[0] as FormData;
    expect(upload.get("pageId")).toBe("page-home");
    expect(upload.get("stage")).toBe("published");
    expect(upload.get("file")).toBeInstanceOf(File);
  });

  it("captures cms-entry pages through the authenticated snapshot API", async () => {
    const canvasToBlobMock = vi.fn((callback: BlobCallback, type?: string) => {
      callback?.(new Blob(["thumb"], { type: type ?? "image/webp" }));
    });
    const toCanvasMock = vi.fn(
      async () =>
        ({
          toBlob: canvasToBlobMock,
        }) as unknown as HTMLCanvasElement,
    );
    const frame = createFakeFrame();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("<html><body><div>Template</div></body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              pageId: "page-template",
              stage: "published",
              contentType: "image/webp",
              size: 128,
              thumbnailUrl:
                "/admin/api/page-thumbnails/page-template?stage=published",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    const { createPageThumbnailGenerator } =
      await import("../../admin/features/Studio/pages/composables/pageThumbnailGenerator");

    const generator = createPageThumbnailGenerator({
      document: {
        body: { appendChild: vi.fn() },
        createElement: ((tagName: string) => {
          if (tagName !== "iframe") {
            throw new Error(`Unexpected tag: ${tagName}`);
          }

          return frame;
        }) as Document["createElement"],
      } as unknown as Document,
      fetch: fetchMock,
      toCanvas: toCanvasMock as unknown as typeof toCanvasMock,
    });

    await generator.ensurePageThumbnail({
      pageId: "page-template",
      pageSlug: "post-template",
      stage: "published",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/admin/api/page-snapshots/post-template?stage=published&thumb=1",
      expect.objectContaining({
        credentials: "same-origin",
      }),
    );
  });

  it("retries thumbnail encoding at a lower webp quality when the first pass is too large", async () => {
    const canvasToBlobMock = vi.fn(
      (callback: BlobCallback, type?: string, quality?: number) => {
        const byteLength = quality === 0.72 ? 300_000 : 80_000;
        callback?.(
          new Blob([new Uint8Array(byteLength)], {
            type: type ?? "image/webp",
          }),
        );
      },
    );
    const toCanvasMock = vi.fn(
      async () =>
        ({
          toBlob: canvasToBlobMock,
        }) as unknown as HTMLCanvasElement,
    );
    const frame = createFakeFrame();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("<html><body><div>Preview</div></body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              pageId: "page-home",
              stage: "published",
              contentType: "image/webp",
              size: 80_000,
              thumbnailUrl:
                "/admin/api/page-thumbnails/page-home?stage=published",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    const { createPageThumbnailGenerator } =
      await import("../../admin/features/Studio/pages/composables/pageThumbnailGenerator");

    const generator = createPageThumbnailGenerator({
      document: {
        body: { appendChild: vi.fn() },
        createElement: ((tagName: string) => {
          if (tagName !== "iframe") {
            throw new Error(`Unexpected tag: ${tagName}`);
          }

          return frame;
        }) as Document["createElement"],
      } as unknown as Document,
      fetch: fetchMock,
      toCanvas: toCanvasMock as unknown as typeof toCanvasMock,
    });

    await generator.ensurePageThumbnail({
      pageId: "page-home",
      pageSlug: "home",
      stage: "published",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/admin/api/page-snapshots/home?stage=published&thumb=1",
      expect.any(Object),
    );

    expect(canvasToBlobMock).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      "image/webp",
      0.72,
    );
    expect(canvasToBlobMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      "image/webp",
      0.52,
    );
  });

  it("captures the document body and propagates page background styling from body", async () => {
    const canvasToBlobMock = vi.fn((callback: BlobCallback, type?: string) => {
      callback?.(new Blob(["thumb"], { type: type ?? "image/webp" }));
    });
    const toCanvasMock = vi.fn(
      async () =>
        ({
          toBlob: canvasToBlobMock,
        }) as unknown as HTMLCanvasElement,
    );
    const getComputedStyleMock = vi.fn((node: Element) => {
      if (node === frame.contentDocument?.documentElement) {
        return {
          background:
            "rgba(0, 0, 0, 0) none repeat scroll 0% 0% / auto padding-box border-box",
          backgroundColor: "rgba(0, 0, 0, 0)",
          backgroundImage: "none",
        } as CSSStyleDeclaration;
      }

      return {
        background:
          "rgb(99, 33, 33) none repeat scroll 0% 0% / auto padding-box border-box",
        backgroundColor: "rgb(99, 33, 33)",
        backgroundImage: "none",
      } as CSSStyleDeclaration;
    });
    const frame = createFakeFrame(getComputedStyleMock as typeof getComputedStyle);

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("<html><body><div>Preview</div></body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              pageId: "page-404",
              stage: "published",
              contentType: "image/webp",
              size: 128,
              thumbnailUrl:
                "/admin/api/page-thumbnails/page-404?stage=published",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    const { createPageThumbnailGenerator } =
      await import("../../admin/features/Studio/pages/composables/pageThumbnailGenerator");

    const generator = createPageThumbnailGenerator({
      document: {
        body: { appendChild: vi.fn() },
        createElement: ((tagName: string) => {
          if (tagName !== "iframe") {
            throw new Error(`Unexpected tag: ${tagName}`);
          }

          return frame;
        }) as Document["createElement"],
      } as unknown as Document,
      fetch: fetchMock,
      toCanvas: toCanvasMock as unknown as typeof toCanvasMock,
    });

    await generator.ensurePageThumbnail({
      pageId: "page-404",
      pageSlug: "404",
      stage: "published",
    });

    expect(frame.contentDocument?.documentElement.style.background).toBe(
      "rgb(99, 33, 33) none repeat scroll 0% 0% / auto padding-box border-box",
    );
    expect(toCanvasMock).toHaveBeenCalledWith(
      frame.contentDocument?.body,
      expect.objectContaining({
        backgroundColor: "rgb(99, 33, 33)",
      }),
    );
  });

  it("forces snapshot refresh when regenerating thumbnails", async () => {
    const frame = createFakeFrame();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("<html><body><div>Preview</div></body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              pageId: "page-home",
              stage: "published",
              contentType: "image/webp",
              size: 80_000,
              thumbnailUrl:
                "/admin/api/page-thumbnails/page-home?stage=published",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    const toCanvasMock = vi.fn(
      async () =>
        ({
          toBlob: (callback: BlobCallback) => {
            callback?.(new Blob(["thumb"], { type: "image/webp" }));
          },
        }) as unknown as HTMLCanvasElement,
    );

    const { createPageThumbnailGenerator } =
      await import("../../admin/features/Studio/pages/composables/pageThumbnailGenerator");

    const generator = createPageThumbnailGenerator({
      document: {
        body: { appendChild: vi.fn() },
        createElement: ((tagName: string) => {
          if (tagName !== "iframe") {
            throw new Error(`Unexpected tag: ${tagName}`);
          }

          return frame;
        }) as Document["createElement"],
      } as unknown as Document,
      fetch: fetchMock,
      toCanvas: toCanvasMock as unknown as typeof toCanvasMock,
    });

    await generator.regeneratePageThumbnail({
      pageId: "page-home",
      pageSlug: "home",
      stage: "published",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/admin/api/page-snapshots/home?stage=published&thumb=1&refresh=1",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/admin/api/page-thumbnails/page-home?stage=published",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });

  it("refreshes draft snapshot HTML when regenerating a modified published page", async () => {
    const frame = createFakeFrame();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("<html>draft snapshot</html>", { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              pageId: "page-contact",
              stage: "draft",
              contentType: "image/webp",
              size: 80_000,
              thumbnailUrl:
                "/admin/api/page-thumbnails/page-contact?stage=draft",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    const toCanvasMock = vi.fn(
      async () =>
        ({
          toBlob: (callback: BlobCallback) => {
            callback?.(new Blob(["thumb"], { type: "image/webp" }));
          },
        }) as unknown as HTMLCanvasElement,
    );

    const { createPageThumbnailGenerator } =
      await import("../../admin/features/Studio/pages/composables/pageThumbnailGenerator");

    const generator = createPageThumbnailGenerator({
      document: {
        body: { appendChild: vi.fn() },
        createElement: ((tagName: string) => {
          if (tagName !== "iframe") {
            throw new Error(`Unexpected tag: ${tagName}`);
          }

          return frame;
        }) as Document["createElement"],
      } as unknown as Document,
      fetch: fetchMock,
      toCanvas: toCanvasMock as unknown as typeof toCanvasMock,
    });

    await generator.regeneratePageThumbnail({
      pageId: "page-contact",
      pageSlug: "contact",
      stage: "draft",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/admin/api/page-snapshots/contact?stage=draft&thumb=1&refresh=1",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/admin/api/page-thumbnails/page-contact?stage=draft",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });

  it("formats browser event-like capture failures without JSON-stringifying isTrusted", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const frame = createFakeFrame();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html><body><div>Preview</div></body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );
    const toCanvasMock = vi.fn(async () => {
      throw {
        isTrusted: true,
        type: "error",
        target: {
          tagName: "IMG",
        },
      };
    });

    const { createPageThumbnailGenerator } =
      await import("../../admin/features/Studio/pages/composables/pageThumbnailGenerator");

    const generator = createPageThumbnailGenerator({
      document: {
        body: { appendChild: vi.fn() },
        createElement: ((tagName: string) => {
          if (tagName !== "iframe") {
            throw new Error(`Unexpected tag: ${tagName}`);
          }

          return frame;
        }) as Document["createElement"],
      } as unknown as Document,
      fetch: fetchMock,
      toCanvas: toCanvasMock as unknown as typeof toCanvasMock,
    });

    const result = await generator.ensurePageThumbnail({
      pageId: "page-home",
      pageSlug: "home",
      stage: "published",
    });

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[pageThumbnailGenerator] Failed to generate thumbnail",
      expect.objectContaining({
        error:
          "Browser error event during thumbnail capture (target: img)",
      }),
    );
  });

  it("reveals aria-motion elements before rasterising snapshot HTML", async () => {
    vi.useFakeTimers();

    const captureDocument = document.implementation.createHTMLDocument(
      "thumbnail",
    );
    const motionElement = captureDocument.createElement("div");
    motionElement.className = "aria-motion aria-motion-fade aria-motion-reveal";
    motionElement.textContent = "Hero";
    captureDocument.body.appendChild(motionElement);
    Object.assign(captureDocument, {
      fonts: {
        ready: Promise.resolve(),
      },
      getAnimations: () => [],
    });

    const listeners: ListenerMap = {};
    const frame = {
      style: {},
      contentDocument: captureDocument,
      contentWindow: {
        requestAnimationFrame: (callback: FrameRequestCallback) => {
          callback(0);
          return 1;
        },
        getComputedStyle: ((() =>
          ({
            background: "",
            backgroundColor: "#ffffff",
            backgroundImage: "none",
            display: "block",
            width: "100px",
            height: "100px",
          }) as CSSStyleDeclaration)) as typeof getComputedStyle,
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

    const toCanvasMock = vi.fn(
      async () =>
        ({
          toBlob: (callback: BlobCallback) => {
            callback?.(new Blob(["thumb"], { type: "image/webp" }));
          },
        }) as unknown as HTMLCanvasElement,
    );
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          '<html><body><div class="aria-motion aria-motion-fade">Hero</div></body></html>',
          {
            status: 200,
            headers: { "Content-Type": "text/html" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              pageId: "page-home",
              stage: "published",
              contentType: "image/webp",
              size: 128,
              thumbnailUrl:
                "/admin/api/page-thumbnails/page-home?stage=published",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    const { createPageThumbnailGenerator } =
      await import("../../admin/features/Studio/pages/composables/pageThumbnailGenerator");

    const generator = createPageThumbnailGenerator({
      document: {
        body: { appendChild: vi.fn() },
        createElement: ((tagName: string) => {
          if (tagName !== "iframe") {
            throw new Error(`Unexpected tag: ${tagName}`);
          }

          return frame;
        }) as Document["createElement"],
      } as unknown as Document,
      fetch: fetchMock,
      toCanvas: toCanvasMock as unknown as typeof toCanvasMock,
    });

    const generationPromise = generator.ensurePageThumbnail({
      pageId: "page-home",
      pageSlug: "home",
      stage: "published",
    });

    await vi.runAllTimersAsync();
    await generationPromise;

    expect(motionElement.classList.contains("aria-motion-in")).toBe(true);
    expect(toCanvasMock).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
