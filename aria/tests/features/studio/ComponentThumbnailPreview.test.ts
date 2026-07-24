import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";

const loadThumbnailPreviewMock = vi.hoisted(() => vi.fn());
const clearThumbnailStateMock = vi.hoisted(() => vi.fn());
const releasePreviewObjectUrlMock = vi.hoisted(() => vi.fn());
const previewImageSrcMock = vi.hoisted(() => ({ value: "" }));
const thumbnailStatusMock = vi.hoisted(() => ({ value: "idle" }));
const isGeneratingMock = vi.hoisted(() => ({ value: false }));

vi.mock(
  "../../../admin/features/Studio/components/composables/useComponentPreviewThumbnail",
  () => ({
    useComponentPreviewThumbnail: () => ({
      previewImageSrc: previewImageSrcMock,
      generatedThumbnailUrl: ref(""),
      isGenerating: isGeneratingMock,
      status: thumbnailStatusMock,
      loadThumbnailPreview: loadThumbnailPreviewMock,
      handlePreviewImageError: vi.fn(),
      clearThumbnailState: clearThumbnailStateMock,
      releasePreviewObjectUrl: releasePreviewObjectUrlMock,
    }),
  }),
);

vi.mock(
  "../../../admin/features/Studio/components/components/ComponentIsolatePreview.vue",
  () => ({
    default: defineComponent({
      name: "ComponentIsolatePreview",
      template: "<div data-testid='isolate-preview' />",
    }),
  }),
);

import ComponentThumbnailPreview from "../../../admin/features/Studio/components/components/ComponentThumbnailPreview.vue";

describe("ComponentThumbnailPreview", () => {
  let observerCallback:
    | ((entries: Array<{ isIntersecting: boolean }>) => void)
    | null = null;
  const observeMock = vi.fn();
  const disconnectMock = vi.fn();

  beforeEach(() => {
    observerCallback = null;
    observeMock.mockClear();
    disconnectMock.mockClear();
    loadThumbnailPreviewMock.mockReset();
    clearThumbnailStateMock.mockReset();
    releasePreviewObjectUrlMock.mockReset();
    previewImageSrcMock.value = "";
    thumbnailStatusMock.value = "idle";
    isGeneratingMock.value = false;

    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn(function MockIntersectionObserver(callback) {
        observerCallback = callback;
        return {
          observe: observeMock,
          disconnect: disconnectMock,
        };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("observes the mounted thumbnail target before loading on intersection", async () => {
    const wrapper = mount(ComponentThumbnailPreview, {
      props: {
        componentId: "hero-cta",
        thumbnailUrl: "/admin/api/component-thumbnails/hero-cta",
      },
    });

    expect(observeMock).toHaveBeenCalledTimes(1);
    expect(loadThumbnailPreviewMock).not.toHaveBeenCalled();

    observerCallback?.([{ isIntersecting: true }]);
    await wrapper.vm.$nextTick();

    expect(loadThumbnailPreviewMock).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    expect(disconnectMock).toHaveBeenCalled();
    expect(releasePreviewObjectUrlMock).toHaveBeenCalled();
  });

  it("shows failed fallback without rendering a center retry button", () => {
    thumbnailStatusMock.value = "failed";

    const wrapper = mount(ComponentThumbnailPreview, {
      props: {
        componentId: "hero-cta",
        thumbnailUrl: "/admin/api/component-thumbnails/hero-cta",
      },
    });

    expect(wrapper.find("[aria-label='Retry thumbnail']").exists()).toBe(false);
    expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.find("[data-testid='isolate-preview']").exists()).toBe(true);
  });

  it("keeps skeleton when live fallback is suppressed", () => {
    thumbnailStatusMock.value = "failed";

    const wrapper = mount(ComponentThumbnailPreview, {
      props: {
        componentId: "hero-cta",
        thumbnailUrl: "/admin/api/component-thumbnails/hero-cta",
        suppressLiveFallback: true,
      },
    });

    expect(wrapper.find("[data-testid='isolate-preview']").exists()).toBe(false);
  });

  it("renders the thumbnail image src from the composable ref value", () => {
    previewImageSrcMock.value =
      "/admin/api/component-thumbnails/hero-cta?cv=generated";
    thumbnailStatusMock.value = "ready";

    const wrapper = mount(ComponentThumbnailPreview, {
      props: {
        componentId: "hero-cta",
      },
    });

    const image = wrapper.find("img");
    expect(image.exists()).toBe(true);
    expect(image.attributes("src")).toBe(
      "/admin/api/component-thumbnails/hero-cta?cv=generated",
    );
  });

  it("leaves generation epoch handling to the thumbnail composable", async () => {
    const wrapper = mount(ComponentThumbnailPreview, {
      props: {
        componentId: "hero-cta",
        thumbnailUrl: "/admin/api/component-thumbnails/hero-cta",
      },
    });

    await wrapper.vm.$nextTick();

    expect(clearThumbnailStateMock).not.toHaveBeenCalled();
    expect(loadThumbnailPreviewMock).not.toHaveBeenCalled();
  });
});
