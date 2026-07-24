import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const enqueuePageThumbnailGenerationMock = vi.hoisted(() => vi.fn());

vi.mock(
  "../../admin/features/Studio/pages/composables/pageThumbnailBackgroundQueue",
  () => ({
    enqueuePageThumbnailGeneration: enqueuePageThumbnailGenerationMock,
    getPageGeneratedThumbnailUrl: () => "",
    pageThumbnailGenerationEpoch: ref({}),
  }),
);

import { usePagePreviewThumbnail } from "../../admin/features/Studio/pages/composables/usePagePreviewThumbnail";

describe("usePagePreviewThumbnail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    enqueuePageThumbnailGenerationMock.mockReset();
  });

  it("fetches admin thumbnail URLs and generates when the stored thumbnail is missing", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Not found", {
        status: 404,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    enqueuePageThumbnailGenerationMock.mockResolvedValue(
      "/admin/api/page-thumbnails/index?stage=published&cv=1",
    );

    const host = {
      iframeSrc: ref(""),
      iframeSrcDoc: ref(""),
      isRendered: ref(false),
      hasError: ref(false),
      isFrameReady: ref(false),
    };
    const thumbnail = usePagePreviewThumbnail({
      props: {
        pageId: "index",
        pageSlug: "index",
        itemType: "page",
        inert: true,
        thumbnailUrl: "/admin/api/page-thumbnails/index?stage=published",
      },
      host,
    });

    await thumbnail.loadThumbnailPreview();

    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/api/page-thumbnails/index?stage=published",
      expect.objectContaining({
        credentials: "same-origin",
      }),
    );
    expect(enqueuePageThumbnailGenerationMock).toHaveBeenCalledWith({
      pageId: "index",
      pageSlug: "index",
      stage: "draft",
      force: undefined,
    });
    expect(thumbnail.previewImageSrc.value).toBe(
      "/admin/api/page-thumbnails/index?stage=published&cv=1",
    );
    expect(host.isRendered.value).toBe(true);
    expect(host.hasError.value).toBe(false);
  });

  it("does not generate a thumbnail after an image load error", () => {
    const host = {
      iframeSrc: ref(""),
      iframeSrcDoc: ref(""),
      isRendered: ref(true),
      hasError: ref(false),
      isFrameReady: ref(true),
    };
    const thumbnail = usePagePreviewThumbnail({
      props: {
        pageId: "index",
        pageSlug: "index",
        itemType: "page",
        inert: true,
        thumbnailUrl: "/admin/api/page-thumbnails/index?stage=published",
      },
      host,
    });

    thumbnail.handlePreviewImageError();

    expect(enqueuePageThumbnailGenerationMock).not.toHaveBeenCalled();
    expect(thumbnail.previewImageSrc.value).toBe("");
    expect(host.isRendered.value).toBe(false);
    expect(host.hasError.value).toBe(true);
    expect(host.isFrameReady.value).toBe(false);
  });
});
