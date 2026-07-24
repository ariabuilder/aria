import { describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, nextTick, reactive, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";

import { usePagePreviewVisibility } from "../../../admin/features/Studio/pages/composables/usePagePreviewVisibility";
import type { PagePreviewFrameProps } from "../../../admin/features/Studio/pages/composables/pagePreviewTypes";

const TestHost = defineComponent({
  props: {
    thumbnailUrl: { type: String, default: "" },
    thumbnailRefreshToken: { type: String, default: null },
  },
  setup(componentProps) {
    const props = reactive<PagePreviewFrameProps>({
      pageSlug: "home",
      pageStatus: "draft",
      itemType: "page",
      inert: true,
      thumbnailUrl: componentProps.thumbnailUrl,
      thumbnailRefreshToken: componentProps.thumbnailRefreshToken,
    });

    const onReload = vi.fn();
    const onLoadPreview = vi.fn();
    const needsResizeObserver = computed(() => false);

    usePagePreviewVisibility({
      props,
      needsResizeObserver,
      containerWidth: ref(0),
      containerHeight: ref(0),
      iframeRef: ref(null),
      onLoadPreview,
      onReload,
      onReleaseThumbnail: vi.fn(),
    });

    return { props, onReload, onLoadPreview };
  },
  render() {
    return h("div");
  },
});

describe("usePagePreviewVisibility", () => {
  it("clears the thumbnail image when thumbnailUrl changes", async () => {
    const wrapper = mount(TestHost, {
      props: {
        thumbnailUrl:
          "/admin/api/page-thumbnails/page_123?stage=draft&v=2026-01-01",
      },
    });

    await flushPromises();
    await nextTick();

    const vm = wrapper.vm as typeof wrapper.vm & {
      props: PagePreviewFrameProps;
      onReload: ReturnType<typeof vi.fn>;
    };

    vm.props.thumbnailUrl =
      "/admin/api/page-thumbnails/page_123?stage=draft&v=2026-01-02";
    await nextTick();

    expect(vm.onReload).toHaveBeenLastCalledWith({ keepImage: false });
  });

  it("keeps the thumbnail image when unrelated props change", async () => {
    const wrapper = mount(TestHost, {
      props: {
        thumbnailUrl:
          "/admin/api/page-thumbnails/page_123?stage=draft&v=2026-01-01",
      },
    });

    await flushPromises();
    await nextTick();

    const vm = wrapper.vm as typeof wrapper.vm & {
      props: PagePreviewFrameProps;
      onReload: ReturnType<typeof vi.fn>;
    };

    vm.props.pageSlug = "about";
    await nextTick();

    expect(vm.onReload).toHaveBeenLastCalledWith({ keepImage: undefined });
  });
});
