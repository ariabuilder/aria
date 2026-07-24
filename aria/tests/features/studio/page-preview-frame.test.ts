import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { mount, flushPromises } from "@vue/test-utils";

const { composeMock, getSettingsMock, getRenderStylesMock } = vi.hoisted(
  () => ({
    composeMock: vi.fn(),
    getSettingsMock: vi.fn(),
    getRenderStylesMock: vi.fn(),
  }),
);

const { ensurePageThumbnailMock } = vi.hoisted(() => ({
  ensurePageThumbnailMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    compose: composeMock,
    settings: {
      get: getSettingsMock,
    },
    styles: {
      getRenderStyles: getRenderStylesMock,
    },
  },
}));

vi.mock(
  "../../../admin/features/Studio/pages/composables/pageThumbnailGenerator",
  () => ({
    ensurePageThumbnail: ensurePageThumbnailMock,
  }),
);

import PagePreviewFrame from "../../../admin/features/Studio/pages/components/PagePreviewFrame.vue";

async function flushPreviewLoad(): Promise<void> {
  await flushPromises();
  await nextTick();
  await flushPromises();
  await nextTick();
}

describe("PagePreviewFrame", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview-image");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    ensurePageThumbnailMock.mockResolvedValue(null);

    composeMock.mockResolvedValue({
      data: {
        pageBlocks: [
          {
            id: "node-1",
            type: "Section",
            className: "preview-token",
            props: {
              text: "Preview body",
            },
            styles: {},
            children: [],
          },
        ],
      },
      error: null,
    });

    getSettingsMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          utilityEngine: "custom",
          breakpoints: [],
        },
      },
      error: null,
    });

    getRenderStylesMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          baseCSS: ".preview-token{color:red}",
          baseCSSHash: "base-hash",
          customClassesCSS: "",
          customFontsCSS: "",
          globalCSS: ".preview-token{color:red}",
          globalCSSHash: "global-hash",
          lastCompiled: "2026-03-25T00:00:00.000Z",
          styleRevision: "style-1",
          utilityCSS: "",
          utilityCSSHash: "utility-hash",
          utilityEngine: "custom",
        },
      },
      error: null,
    });

    global.IntersectionObserver = class ImmediateIntersectionObserver {
      private readonly callback: IntersectionObserverCallback;

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
      }

      disconnect(): void {}

      observe(): void {
        this.callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }

      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }

      unobserve(): void {}
    } as unknown as typeof IntersectionObserver;
  });

  it("loads canonical global CSS for component previews", async () => {
    const wrapper = mount(PagePreviewFrame, {
      props: {
        pageSlug: "hero-card",
        itemType: "component",
        skipObserver: true,
      },
      global: {
        stubs: {
          transition: false,
        },
      },
      attachTo: document.body,
    });

    await flushPreviewLoad();

    expect(composeMock).toHaveBeenCalledWith({
      pageSlug: "hero-card",
      itemType: "component",
    });
    expect(getRenderStylesMock).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("shows the unavailable state when compose returns a malformed payload", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    composeMock.mockResolvedValue({
      data: {
        pageMetadata: {
          settings: {
            cssVariables: {
              accent: "red",
            },
          },
        },
      },
      error: null,
    });

    const wrapper = mount(PagePreviewFrame, {
      props: {
        pageSlug: "hero-card",
        itemType: "component",
        skipObserver: true,
      },
      global: {
        stubs: {
          transition: false,
        },
      },
      attachTo: document.body,
    });

    await flushPreviewLoad();

    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
    wrapper.unmount();
  });

  it("falls back to empty CSS when global CSS payload is malformed", async () => {
    getRenderStylesMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          cssSize: 27,
        },
      },
      error: null,
    });

    const wrapper = mount(PagePreviewFrame, {
      props: {
        pageSlug: "hero-card",
        itemType: "component",
        skipObserver: true,
      },
      global: {
        stubs: {
          transition: false,
        },
      },
      attachTo: document.body,
    });

    await flushPreviewLoad();

    expect(composeMock).toHaveBeenCalledWith({
      pageSlug: "hero-card",
      itemType: "component",
    });
    expect(getRenderStylesMock).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("renders an image thumbnail for inert page previews", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = mount(PagePreviewFrame, {
      props: {
        pageSlug: "home",
        itemType: "page",
        inert: true,
        skipObserver: true,
        thumbnailUrl: "/admin/api/page-thumbnails/page_123?stage=draft",
      },
      global: {
        stubs: {
          transition: false,
        },
      },
      attachTo: document.body,
    });

    await flushPreviewLoad();

    expect(composeMock).not.toHaveBeenCalled();
    expect(ensurePageThumbnailMock).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(
      (
        fetchMock.mock.calls as unknown as Array<
          [RequestInfo | URL, ...unknown[]]
        >
      ).some(([url]) => String(url).includes("/admin/api/page-thumbnails/")),
    ).toBe(true);

    wrapper.unmount();

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("generates a thumbnail for inert page previews when one is missing", async () => {
    ensurePageThumbnailMock.mockResolvedValue(
      "/admin/api/page-thumbnails/page_123?stage=draft&cv=1",
    );
    const fetchMock = vi.fn(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = mount(PagePreviewFrame, {
      props: {
        pageId: "page_123",
        pageSlug: "home",
        itemType: "page",
        inert: true,
        skipObserver: true,
      },
      global: {
        stubs: {
          transition: false,
        },
      },
      attachTo: document.body,
    });

    await flushPreviewLoad();

    expect(composeMock).not.toHaveBeenCalled();
    expect(ensurePageThumbnailMock).toHaveBeenCalledWith({
      pageId: "page_123",
      pageSlug: "home",
      stage: "draft",
    });
    expect(
      (
        fetchMock.mock.calls as unknown as Array<
          [RequestInfo | URL, ...unknown[]]
        >
      ).some(([url]) => String(url).includes("/admin/api/page-thumbnails/")),
    ).toBe(true);

    wrapper.unmount();
  });
});
