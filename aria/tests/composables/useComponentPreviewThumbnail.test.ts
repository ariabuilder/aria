import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref, type Ref } from "vue";

const enqueueComponentThumbnailGenerationMock = vi.hoisted(() => vi.fn());
const generatedThumbnailUrlMock = vi.hoisted(() => ({ value: "" as unknown }));
const componentThumbnailGenerationEpochMock = vi.hoisted(() => ({
  value: null as Ref<Record<string, number>> | null,
}));

vi.mock(
  "../../admin/features/Studio/components/composables/componentThumbnailBackgroundQueue",
  async () => {
    const { ref } = await vi.importActual<typeof import("vue")>("vue");
    componentThumbnailGenerationEpochMock.value = ref<Record<string, number>>({});

    return {
      enqueueComponentThumbnailGeneration: enqueueComponentThumbnailGenerationMock,
      getComponentGeneratedThumbnailUrl: () => generatedThumbnailUrlMock.value,
      componentThumbnailGenerationEpoch: componentThumbnailGenerationEpochMock.value,
    };
  },
);

vi.mock("../../admin/features/Studio/pages/utils/deviceCapabilities", () => ({
  isThumbnailCaptureSupported: () => true,
}));

import {
  resetComponentPreviewThumbnailRepairState,
  useComponentPreviewThumbnail,
} from "../../admin/features/Studio/components/composables/useComponentPreviewThumbnail";
import { markCurrentComponentThumbnailPreset } from "../../admin/features/Studio/components/composables/componentThumbnailPreset";

function createHost() {
  return {
    iframeSrc: ref(""),
    iframeSrcDoc: ref(""),
    isRendered: ref(false),
    hasError: ref(false),
  };
}

function mockObjectUrls(objectUrl = "blob:hero-cta"): void {
  vi.spyOn(URL, "createObjectURL").mockReturnValue(objectUrl);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
}

function mockSampledImageDecode(sample: "flat-white" | "quiet-content"): void {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({
      width: 16,
      height: 16,
      close: vi.fn(),
    })),
  );

  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
    if (String(tagName).toLowerCase() !== "canvas") {
      return createElement(tagName, options);
    }

    const data = new Uint8ClampedArray(16 * 16 * 4).fill(255);
    if (sample === "quiet-content") {
      data[0] = 180;
      data[1] = 180;
      data[2] = 180;
      data[3] = 255;
    }

    return {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: () => ({
          data,
        }),
      }),
    } as unknown as HTMLCanvasElement;
  });
}

describe("useComponentPreviewThumbnail", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    enqueueComponentThumbnailGenerationMock.mockReset();
    generatedThumbnailUrlMock.value = "";
    if (componentThumbnailGenerationEpochMock.value) {
      componentThumbnailGenerationEpochMock.value.value = {};
    }
    window.localStorage.clear();
    resetComponentPreviewThumbnailRepairState();
  });

  it("renders a cached thumbnail when the stored thumbnail succeeds", async () => {
    markCurrentComponentThumbnailPreset({ componentId: "hero-cta" });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response("webp", {
        status: 200,
        headers: { "Content-Type": "image/webp" },
      }),
    );
    mockObjectUrls();
    vi.stubGlobal("fetch", fetchMock);

    const host = createHost();
    const thumbnail = useComponentPreviewThumbnail({
      props: {
        componentId: "hero-cta",
        inert: true,
        thumbnailUrl: "/admin/api/component-thumbnails/hero-cta",
      },
      host,
    });

    await thumbnail.loadThumbnailPreview();

    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/api/component-thumbnails/hero-cta",
      expect.objectContaining({
        credentials: "same-origin",
      }),
    );
    expect(enqueueComponentThumbnailGenerationMock).not.toHaveBeenCalled();
    expect(thumbnail.previewImageSrc.value).toBe("blob:hero-cta");
    expect(thumbnail.status.value).toBe("ready");
    expect(host.isRendered.value).toBe(true);
    expect(host.hasError.value).toBe(false);
  });

  it("tries the canonical stored thumbnail endpoint when init omitted thumbnailUrl", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("webp", {
        status: 200,
        headers: { "Content-Type": "image/webp" },
      }),
    );
    mockObjectUrls();
    vi.stubGlobal("fetch", fetchMock);

    const host = createHost();
    const thumbnail = useComponentPreviewThumbnail({
      props: {
        componentId: "hero-cta",
        inert: true,
      },
      host,
    });

    await thumbnail.loadThumbnailPreview();

    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/api/component-thumbnails/hero-cta",
      expect.objectContaining({
        credentials: "same-origin",
      }),
    );
    expect(enqueueComponentThumbnailGenerationMock).not.toHaveBeenCalled();
    expect(thumbnail.previewImageSrc.value).toBe("blob:hero-cta");
    expect(thumbnail.status.value).toBe("ready");
    expect(host.isRendered.value).toBe(true);
    expect(host.hasError.value).toBe(false);
  });

  it("repairs a cached thumbnail when the stored image is flat white", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("webp", {
        status: 200,
        headers: { "Content-Type": "image/webp" },
      }),
    );
    enqueueComponentThumbnailGenerationMock.mockResolvedValue(
      "/admin/api/component-thumbnails/hero-cta?cv=generated",
    );
    mockSampledImageDecode("flat-white");
    mockObjectUrls();
    vi.stubGlobal("fetch", fetchMock);

    const host = createHost();
    const thumbnail = useComponentPreviewThumbnail({
      props: {
        componentId: "hero-cta",
        inert: true,
        thumbnailUrl: "/admin/api/component-thumbnails/hero-cta",
      },
      host,
    });

    await thumbnail.loadThumbnailPreview();

    expect(enqueueComponentThumbnailGenerationMock).toHaveBeenCalledWith(
      "hero-cta",
      { force: true },
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(thumbnail.previewImageSrc.value).toBe(
      "/admin/api/component-thumbnails/hero-cta?cv=generated",
    );
    expect(thumbnail.status.value).toBe("ready");
    expect(host.hasError.value).toBe(false);
  });

  it("renders a cached thumbnail when a quiet image still has content", async () => {
    markCurrentComponentThumbnailPreset({ componentId: "hero-cta" });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("webp", {
        status: 200,
        headers: { "Content-Type": "image/webp" },
      }),
    );
    mockSampledImageDecode("quiet-content");
    mockObjectUrls();
    vi.stubGlobal("fetch", fetchMock);

    const host = createHost();
    const thumbnail = useComponentPreviewThumbnail({
      props: {
        componentId: "hero-cta",
        inert: true,
        thumbnailUrl: "/admin/api/component-thumbnails/hero-cta",
      },
      host,
    });

    await thumbnail.loadThumbnailPreview();

    expect(enqueueComponentThumbnailGenerationMock).not.toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(thumbnail.previewImageSrc.value).toBe("blob:hero-cta");
    expect(thumbnail.status.value).toBe("ready");
    expect(host.hasError.value).toBe(false);
  });

  it("regenerates once when the cached thumbnail fails and then renders", async () => {
    markCurrentComponentThumbnailPreset({ componentId: "hero-cta" });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("Not found", {
          status: 404,
        }),
      );
    enqueueComponentThumbnailGenerationMock.mockResolvedValue(
      "/admin/api/component-thumbnails/hero-cta?cv=generated",
    );
    mockObjectUrls();
    vi.stubGlobal("fetch", fetchMock);

    const host = createHost();
    const thumbnail = useComponentPreviewThumbnail({
      props: {
        componentId: "hero-cta",
        inert: true,
        thumbnailUrl: "/uploads/missing-component-thumbnail.webp",
      },
      host,
    });

    await thumbnail.loadThumbnailPreview();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/uploads/missing-component-thumbnail.webp",
      expect.objectContaining({
        credentials: "same-origin",
      }),
    );
    expect(enqueueComponentThumbnailGenerationMock).toHaveBeenCalledWith(
      "hero-cta",
      { force: false },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(thumbnail.previewImageSrc.value).toBe(
      "/admin/api/component-thumbnails/hero-cta?cv=generated",
    );
    expect(thumbnail.status.value).toBe("ready");
    expect(host.isRendered.value).toBe(true);
    expect(host.hasError.value).toBe(false);
  });

  it("settles into a failed state when cached and regenerated thumbnails fail", async () => {
    markCurrentComponentThumbnailPreset({ componentId: "hero-cta" });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Not found", {
        status: 404,
      }),
    );
    enqueueComponentThumbnailGenerationMock.mockResolvedValue(null);
    vi.stubGlobal("fetch", fetchMock);

    const host = createHost();
    const thumbnail = useComponentPreviewThumbnail({
      props: {
        componentId: "hero-cta",
        inert: true,
        thumbnailUrl: "/uploads/missing-component-thumbnail.webp",
      },
      host,
    });

    await thumbnail.loadThumbnailPreview();
    await thumbnail.loadThumbnailPreview();

    expect(enqueueComponentThumbnailGenerationMock).toHaveBeenCalledTimes(1);
    expect(thumbnail.previewImageSrc.value).toBe("");
    expect(thumbnail.status.value).toBe("failed");
    expect(host.isRendered.value).toBe(false);
    expect(host.hasError.value).toBe(true);
  });

  it("does not stringify malformed generated thumbnail responses into image urls", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Not found", {
        status: 404,
      }),
    );
    enqueueComponentThumbnailGenerationMock.mockResolvedValue({
      thumbnailUrl: "/admin/api/component-thumbnails/hero-cta",
    });
    vi.stubGlobal("fetch", fetchMock);

    const host = createHost();
    const thumbnail = useComponentPreviewThumbnail({
      props: {
        componentId: "hero-cta",
        inert: true,
      },
      host,
    });

    await thumbnail.loadThumbnailPreview();

    expect(enqueueComponentThumbnailGenerationMock).toHaveBeenCalledWith(
      "hero-cta",
      { force: false },
    );
    expect(thumbnail.previewImageSrc.value).toBe("");
    expect(thumbnail.status.value).toBe("failed");
    expect(host.hasError.value).toBe(true);
  });

  it("stays in regenerating state while generation is in flight", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Not found", {
        status: 404,
      }),
    );
    let resolveGeneration: ((value: string | null) => void) | undefined;
    enqueueComponentThumbnailGenerationMock.mockReturnValue(
      new Promise<string | null>((resolve) => {
        resolveGeneration = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const host = createHost();
    const thumbnail = useComponentPreviewThumbnail({
      props: {
        componentId: "hero-cta",
        inert: true,
        thumbnailUrl: "/uploads/missing-component-thumbnail.webp",
      },
      host,
    });

    const loadPromise = thumbnail.loadThumbnailPreview();
    await Promise.resolve();

    expect(thumbnail.status.value).toBe("regenerating");
    expect(thumbnail.isGenerating.value).toBe(true);
    expect(enqueueComponentThumbnailGenerationMock).toHaveBeenCalledTimes(1);

    resolveGeneration?.("/admin/api/component-thumbnails/hero-cta?cv=generated");
    await loadPromise;

    expect(thumbnail.status.value).toBe("ready");
    expect(thumbnail.isGenerating.value).toBe(false);
    expect(host.hasError.value).toBe(false);
  });

  it("coalesces concurrent thumbnail loads for the same request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    let resolveGeneration: ((value: string | null) => void) | undefined;
    enqueueComponentThumbnailGenerationMock.mockReturnValue(
      new Promise<string | null>((resolve) => {
        resolveGeneration = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const host = createHost();
    const thumbnail = useComponentPreviewThumbnail({
      props: {
        componentId: "coalesced-card",
        inert: true,
        thumbnailUrl: "/uploads/missing-component-thumbnail.webp",
      },
      host,
    });

    const firstLoad = thumbnail.loadThumbnailPreview();
    const secondLoad = thumbnail.loadThumbnailPreview();

    await vi.waitFor(() => {
      expect(enqueueComponentThumbnailGenerationMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    resolveGeneration?.("/admin/api/component-thumbnails/coalesced-card?cv=generated");
    await Promise.all([firstLoad, secondLoad]);

    expect(thumbnail.previewImageSrc.value).toBe(
      "/admin/api/component-thumbnails/coalesced-card?cv=generated",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(enqueueComponentThumbnailGenerationMock).toHaveBeenCalledTimes(1);
  });

  it("does not reload when a generation epoch echoes the current generated thumbnail", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const generatedUrl = "/admin/api/component-thumbnails/echo-card?cv=generated";
    enqueueComponentThumbnailGenerationMock.mockImplementation(async () => {
      generatedThumbnailUrlMock.value = generatedUrl;
      return generatedUrl;
    });
    vi.stubGlobal("fetch", fetchMock);

    const host = createHost();
    const thumbnail = useComponentPreviewThumbnail({
      props: {
        componentId: "echo-card",
        inert: true,
        thumbnailUrl: "/uploads/missing-component-thumbnail.webp",
      },
      host,
    });

    await thumbnail.loadThumbnailPreview();
    componentThumbnailGenerationEpochMock.value!.value = {
      "echo-card": 1,
    };
    await nextTick();

    expect(thumbnail.previewImageSrc.value).toBe(generatedUrl);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(enqueueComponentThumbnailGenerationMock).toHaveBeenCalledTimes(1);
  });

  it("does not render object-shaped generated thumbnail cache values as image urls", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Not found", {
        status: 404,
      }),
    );
    generatedThumbnailUrlMock.value = {
      url: "/admin/api/component-thumbnails/object-cache-card",
    };
    enqueueComponentThumbnailGenerationMock.mockResolvedValue(null);
    vi.stubGlobal("fetch", fetchMock);

    const host = createHost();
    const thumbnail = useComponentPreviewThumbnail({
      props: {
        componentId: "object-cache-card",
        inert: true,
      },
      host,
    });

    await thumbnail.loadThumbnailPreview();

    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/api/component-thumbnails/object-cache-card",
      expect.objectContaining({
        credentials: "same-origin",
      }),
    );
    expect(thumbnail.previewImageSrc.value).toBe("");
    expect(thumbnail.status.value).toBe("failed");
    expect(host.hasError.value).toBe(true);
  });

  it("reloads when another preview generates a newer thumbnail", async () => {
    markCurrentComponentThumbnailPreset({ componentId: "external-card" });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response("webp", {
        status: 200,
        headers: { "Content-Type": "image/webp" },
      }),
    );
    mockObjectUrls();
    vi.stubGlobal("fetch", fetchMock);

    const host = createHost();
    const thumbnail = useComponentPreviewThumbnail({
      props: {
        componentId: "external-card",
        inert: true,
        thumbnailUrl: "/admin/api/component-thumbnails/external-card",
      },
      host,
    });

    await thumbnail.loadThumbnailPreview();

    generatedThumbnailUrlMock.value =
      "/admin/api/component-thumbnails/external-card?cv=external";
    componentThumbnailGenerationEpochMock.value!.value = {
      "external-card": 1,
    };

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/admin/api/component-thumbnails/external-card?cv=external",
      expect.objectContaining({
        credentials: "same-origin",
      }),
    );
    expect(enqueueComponentThumbnailGenerationMock).not.toHaveBeenCalled();
    expect(thumbnail.generatedThumbnailUrl.value).toBe(
      "/admin/api/component-thumbnails/external-card?cv=external",
    );
    expect(thumbnail.status.value).toBe("ready");
  });

  it("retries auto-repair after local thumbnail state is reset", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Not found", {
        status: 404,
      }),
    );
    enqueueComponentThumbnailGenerationMock.mockResolvedValue(null);
    vi.stubGlobal("fetch", fetchMock);

    const host = createHost();
    const thumbnail = useComponentPreviewThumbnail({
      props: {
        componentId: "hero-cta",
        inert: true,
        thumbnailUrl: "/uploads/missing-component-thumbnail.webp",
      },
      host,
    });

    await thumbnail.loadThumbnailPreview();
    thumbnail.clearThumbnailState();
    await thumbnail.loadThumbnailPreview();

    expect(enqueueComponentThumbnailGenerationMock).toHaveBeenCalledTimes(2);
    expect(thumbnail.status.value).toBe("failed");
  });

  it("retries fetch after local thumbnail state is reset and generated URLs change", async () => {
    markCurrentComponentThumbnailPreset({ componentId: "hero-cta" });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Not found", {
        status: 404,
      }),
    );
    enqueueComponentThumbnailGenerationMock.mockResolvedValue(null);
    vi.stubGlobal("fetch", fetchMock);

    const host = createHost();
    const thumbnail = useComponentPreviewThumbnail({
      props: {
        componentId: "hero-cta",
        inert: true,
        thumbnailUrl: "/uploads/missing-component-thumbnail.webp",
      },
      host,
    });

    await thumbnail.loadThumbnailPreview();
    thumbnail.clearThumbnailState();
    generatedThumbnailUrlMock.value =
      "/admin/api/component-thumbnails/hero-cta?cv=changed";
    await thumbnail.loadThumbnailPreview();

    expect(enqueueComponentThumbnailGenerationMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(thumbnail.status.value).toBe("failed");
  });

});
